-- D4/D5 database-side enforcement (owner-authorized 2026-07-29).
-- Applied via Supabase migration: d4_d5_publication_guard_and_source_change_propagation.
-- Design record: docs/PHASE_2_D4_D5_DECISIONS.md. Additive only; no production data modified.

-- D4 layer 1: publication guard on explanations
create or replace function public.explanations_publication_guard()
returns trigger
language plpgsql
as $$
begin
  if NEW.review_status = 'published' then
    if NEW.state is distinct from 'ok'
       or NEW.supporting_passage is null
       or length(btrim(NEW.supporting_passage)) = 0
       or NEW.falsification_condition is null
       or NEW.falsification_condition ilike 'missing:%' then
      raise exception 'D4 publication block: assertion % cannot be published (requires state=ok, a supporting passage, and a recorded falsification condition)', NEW.assertion_id;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists explanations_publication_guard on public.explanations;
create trigger explanations_publication_guard
before insert or update on public.explanations
for each row execute function public.explanations_publication_guard();

-- D5 audit table
create table if not exists public.source_change_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  change_type text not null check (change_type in ('corrected','withdrawn')),
  affected_assertion_ids text[] not null default '{}',
  actor text not null default 'system',
  note text,
  created_at timestamptz not null default now()
);

alter table public.source_change_events enable row level security;

-- D5 propagation function
create or replace function public.mark_source_change(
  p_source_id uuid,
  p_change_type text,
  p_actor text default 'system',
  p_note text default null
)
returns integer
language plpgsql
as $$
declare
  v_new_state text;
  v_affected text[];
begin
  if p_change_type not in ('corrected','withdrawn') then
    raise exception 'mark_source_change: change_type must be corrected or withdrawn, got %', p_change_type;
  end if;
  v_new_state := 'source_' || p_change_type;

  select coalesce(array_agg(assertion_id), '{}') into v_affected
    from public.explanations
   where is_current and p_source_id = any(source_ids);

  update public.explanations e
     set review_status = 'awaiting_review',
         state = v_new_state,
         correction_history = coalesce(correction_history, '[]'::jsonb) || jsonb_build_object(
           'changed_by', p_actor,
           'changed_at', now(),
           'reason', 'source ' || p_change_type || '; renewed human review required per D5',
           'source_id', p_source_id::text
         )
   where e.is_current and p_source_id = any(e.source_ids);

  insert into public.source_change_events (source_id, change_type, affected_assertion_ids, actor, note)
  values (p_source_id, p_change_type, v_affected, p_actor, p_note);

  return coalesce(array_length(v_affected, 1), 0);
end;
$$;

-- Rollback:
-- drop trigger explanations_publication_guard on public.explanations;
-- drop function public.explanations_publication_guard();
-- drop function public.mark_source_change(uuid,text,text,text);
-- drop table public.source_change_events;
