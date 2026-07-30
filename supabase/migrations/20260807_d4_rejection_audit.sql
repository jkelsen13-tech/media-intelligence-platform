-- D4 rejection-audit (owner-authorized 2026-07-30, design v2).
-- Persistent audit for rejected publication attempts. Additive only.
-- Existing explanations_publication_guard trigger/function unchanged.

-- 1. Audit table
create table public.publication_rejection_audit (
  id uuid primary key default gen_random_uuid(),
  assertion_id text not null,
  explanation_id uuid,
  attempted_status text not null default 'published',
  prior_review_status text,
  rejecting_rule text not null,
  state_at_attempt text,
  actor text not null,
  created_at timestamptz not null default now()
);

alter table public.publication_rejection_audit enable row level security;
-- Service-role-only posture: no policies for anon/authenticated; writes occur
-- only via the SECURITY DEFINER function below (owner: postgres).

-- 2. Prevalidating publish wrapper: NEVER raises on expected D4 rejection.
create or replace function public.publish_explanation(
  p_explanation_id uuid,
  p_actor text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.explanations%rowtype;
  v_rule text;
begin
  select * into r from public.explanations where id = p_explanation_id for update;

  if not found or not r.is_current then
    insert into public.publication_rejection_audit
      (assertion_id, explanation_id, prior_review_status, rejecting_rule, state_at_attempt, actor)
    values
      (coalesce(r.assertion_id, 'unknown:' || p_explanation_id::text),
       p_explanation_id,
       r.review_status,
       'not_found_or_not_current',
       r.state,
       p_actor);
    return jsonb_build_object('ok', false, 'rule', 'not_found_or_not_current',
      'assertion_id', coalesce(r.assertion_id, 'unknown:' || p_explanation_id::text));
  end if;

  if r.review_status = 'published' then
    return jsonb_build_object('ok', false, 'rule', 'already_published', 'assertion_id', r.assertion_id);
  end if;

  -- D4 predicate, same order as explanations_publication_guard
  if r.state is distinct from 'ok' then
    v_rule := 'state_not_ok';
  elsif r.supporting_passage is null or length(btrim(r.supporting_passage)) = 0 then
    v_rule := 'missing_supporting_passage';
  elsif r.falsification_condition is null or r.falsification_condition ilike 'missing:%' then
    v_rule := 'missing_falsification_condition';
  else
    v_rule := null;
  end if;

  if v_rule is not null then
    insert into public.publication_rejection_audit
      (assertion_id, explanation_id, prior_review_status, rejecting_rule, state_at_attempt, actor)
    values
      (r.assertion_id, r.id, r.review_status, v_rule, r.state, p_actor);
    return jsonb_build_object('ok', false, 'rule', v_rule, 'assertion_id', r.assertion_id);
  end if;

  update public.explanations
     set review_status = 'published', reviewed_at = now()
   where id = r.id;

  return jsonb_build_object('ok', true, 'assertion_id', r.assertion_id);
end;
$$;

-- Rollback:
-- drop function public.publish_explanation(uuid, text);
-- drop table public.publication_rejection_audit;
