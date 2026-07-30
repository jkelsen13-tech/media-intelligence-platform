-- D5 automatic source-side trigger (owner-authorized 2026-07-30, plan v2, Q1-a).
-- Additive + in-place amendment of mark_source_change. No production data modified:
-- all existing articles default to 'active'; audit columns default empty/0.
-- Design: D5_AUTO_TRIGGER_DESIGN_V2_2026-07-30.md.
-- Q1-a: current explanations with review_status='withdrawn' are skipped from
-- mutation, remain withdrawn, and are recorded in the audit payload as
-- linked-but-preserved. No auto-publish, no auto-restore, no auto-review.
--
-- Rollback (plan v2 section 6):
--   drop trigger if exists articles_source_status_d5_propagate on public.articles;
--   drop function if exists public.articles_source_status_propagate();
--   alter table public.articles
--     drop column if exists source_status,
--     drop column if exists source_status_changed_at,
--     drop column if exists source_status_note;
--   -- restore mark_source_change verbatim from
--   -- supabase/migrations/20260806_d4_d5_enforcement.sql (git history;
--   -- also captured in verifier/backups/mark_source_change_pre_d5.sql)
--   alter table public.source_change_events
--     drop column if exists linked_assertion_ids,
--     drop column if exists mutated_assertion_ids,
--     drop column if exists skipped_withdrawn_assertion_ids,
--     drop column if exists linked_count,
--     drop column if exists mutated_count,
--     drop column if exists skipped_withdrawn_count;
-- Audit rows written before rollback are retained; propagated explanation rows
-- remain awaiting_review + source_* (safe, non-presentation-eligible terminal state).

-- 1. articles marking fields
alter table public.articles
  add column source_status text not null default 'active'
    check (source_status in ('active','corrected','withdrawn')),
  add column source_status_changed_at timestamptz,
  add column source_status_note text;

-- 2. audit payload columns (affected_assertion_ids retained; now defined as the
--    mutated set)
alter table public.source_change_events
  add column linked_assertion_ids            text[]  not null default '{}',
  add column mutated_assertion_ids           text[]  not null default '{}',
  add column skipped_withdrawn_assertion_ids text[]  not null default '{}',
  add column linked_count            integer not null default 0,
  add column mutated_count           integer not null default 0,
  add column skipped_withdrawn_count integer not null default 0;

-- 3. amended mark_source_change (Q1-a): skips review_status='withdrawn' rows from
--    mutation; records linked / mutated / skipped-withdrawn populations in audit.
create or replace function public.mark_source_change(
  p_source_id   uuid,
  p_change_type text,
  p_actor       text default 'system',
  p_note        text default null
)
returns integer
language plpgsql
as $$
declare
  v_new_state text;
  v_linked    text[];
  v_mutated   text[];
  v_skipped   text[];
begin
  if p_change_type not in ('corrected','withdrawn') then
    raise exception 'mark_source_change: change_type must be corrected or withdrawn, got %', p_change_type;
  end if;
  v_new_state := 'source_' || p_change_type;

  -- all linked current assertions (audit universe)
  select coalesce(array_agg(assertion_id), '{}') into v_linked
    from public.explanations
   where is_current and p_source_id = any(source_ids);

  -- skipped: linked but withdrawn (Q1-a; intentionally preserved)
  select coalesce(array_agg(assertion_id), '{}') into v_skipped
    from public.explanations
   where is_current and p_source_id = any(source_ids)
     and review_status = 'withdrawn';

  -- mutated: linked, current, not withdrawn
  with u as (
    update public.explanations e
       set review_status = 'awaiting_review',
           state = v_new_state,
           correction_history = coalesce(correction_history, '[]'::jsonb) || jsonb_build_object(
             'changed_by', p_actor,
             'changed_at', now(),
             'reason', 'source ' || p_change_type || '; renewed human review required per D5',
             'source_id', p_source_id::text
           )
     where e.is_current
       and p_source_id = any(e.source_ids)
       and e.review_status is distinct from 'withdrawn'
    returning e.assertion_id
  )
  select coalesce(array_agg(assertion_id), '{}') into v_mutated from u;

  insert into public.source_change_events (
    source_id, change_type,
    affected_assertion_ids,
    linked_assertion_ids, mutated_assertion_ids, skipped_withdrawn_assertion_ids,
    linked_count, mutated_count, skipped_withdrawn_count,
    actor, note
  ) values (
    p_source_id, p_change_type,
    v_mutated,
    v_linked, v_mutated, v_skipped,
    coalesce(array_length(v_linked,1),0),
    coalesce(array_length(v_mutated,1),0),
    coalesce(array_length(v_skipped,1),0),
    p_actor, p_note
  );

  return coalesce(array_length(v_mutated,1),0);
end;
$$;

-- 4. trigger function + trigger
create or replace function public.articles_source_status_propagate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  NEW.source_status_changed_at := now();
  perform public.mark_source_change(
    NEW.id,
    NEW.source_status,
    coalesce(nullif(current_setting('mip.source_actor', true), ''), 'system:auto-trigger'),
    NEW.source_status_note
  );
  return NEW;
end;
$$;

create trigger articles_source_status_d5_propagate
before update of source_status on public.articles
for each row
when (OLD.source_status is distinct from NEW.source_status
      and NEW.source_status in ('corrected','withdrawn'))
execute function public.articles_source_status_propagate();
