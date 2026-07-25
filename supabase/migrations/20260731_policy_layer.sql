-- Step 10 (§7, governed by §3): policy consequence layer.
-- Policies are first-class: structured documents (statutes, EOs, regulations,
-- rulings, treaties) linked into the graph with fully-typed, fully-attributed
-- edges. Every policy edge MUST carry doc_strength, claimed_by, signal_source,
-- reliability, stance (+ counterfactual_test & alternative_causes when
-- MIP_inferred) — enforced by constraint below.

-- nodes.type: add 'policy' (and 'topic' for later use)
alter table public.nodes drop constraint if exists nodes_type_check;
alter table public.nodes add constraint nodes_type_check
  check (type in ('event', 'actor', 'institution', 'document', 'anomaly', 'policy', 'topic'));

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  jurisdiction text, -- 'US Federal', 'US State (NC)', 'EU', 'UK', ...
  instrument_type text check (instrument_type in ('statute', 'executive order', 'regulation', 'court ruling', 'treaty')),
  enacted_date date,
  effective_date date,
  status text check (status in ('proposed', 'enacted', 'in force', 'amended', 'superseded', 'repealed', 'struck down')),
  source_url text,
  full_text_url text,
  external_id text, -- e.g. Federal Register document_number
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
-- unique where present (plain unique index: NULLs are distinct in Postgres,
-- and a partial index could not back ON CONFLICT (external_id))
create unique index if not exists policies_external_id_idx on public.policies (external_id);
create index if not exists policies_name_idx on public.policies (lower(name));

create table if not exists public.policy_topics (
  policy_id uuid not null references public.policies (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  confidence numeric not null default 0.5,
  created_at timestamptz not null default now(),
  primary key (policy_id, topic_id)
);

create table if not exists public.policy_actors (
  policy_id uuid not null references public.policies (id) on delete cascade,
  entity_id uuid not null references public.entities (id) on delete cascade,
  role text not null default 'issuing_authority', -- issuing_authority | affected_sector | enforcer
  created_at timestamptz not null default now(),
  primary key (policy_id, entity_id, role)
);

-- Documents harvested from cross-domain sources (§3.1). Claims stored only as
-- stated by the document — never fabricated.
create table if not exists public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references public.policies (id) on delete set null,
  source text not null check (source in ('federal_register', 'gao', 'crs', 'ig', 'eurlex', 'legislation_gov_uk', 'courtlistener')),
  external_id text,
  title text,
  url text,
  published_at timestamptz,
  raw_summary text,
  extracted_claims jsonb not null default '[]', -- [{edge_hint, target_ref, claimed_by:'analysis', claimant}]
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

alter table public.policies enable row level security;
alter table public.policy_topics enable row level security;
alter table public.policy_actors enable row level security;
alter table public.policy_documents enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='policies' and policyname='policies_read') then
    create policy policies_read on public.policies for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='policy_topics' and policyname='policy_topics_read') then
    create policy policy_topics_read on public.policy_topics for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='policy_actors' and policyname='policy_actors_read') then
    create policy policy_actors_read on public.policy_actors for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='policy_documents' and policyname='policy_documents_read') then
    create policy policy_documents_read on public.policy_documents for select using (true);
  end if;
end $$;

-- §3.2/§3.4 enforcement: any edge touching a policy node must be fully
-- attributed; MIP_inferred edges must additionally carry a counterfactual
-- test and at least one alternative cause.
create or replace function public.policy_edge_attributed()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.nodes n
    where n.type = 'policy' and (n.id = new.source_id or n.id = new.target_id)
  ) then
    if new.claimed_by is null or new.doc_strength is null
       or new.signal_source is null or new.reliability is null then
      raise exception 'policy edge missing attribution (claimed_by/doc_strength/signal_source/reliability required)';
    end if;
    if new.claimed_by = 'MIP_inferred'
       and (new.counterfactual_test is null or jsonb_array_length(new.alternative_causes) = 0) then
      raise exception 'MIP_inferred policy edge requires counterfactual_test and >=1 alternative_causes';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists policy_edge_attributed on public.edges;
create trigger policy_edge_attributed
before insert or update on public.edges
for each row execute function public.policy_edge_attributed();
