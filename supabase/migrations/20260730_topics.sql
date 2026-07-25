-- Step 8 (§5): fixed topic taxonomy. Tree seeded VERBATIM from the directive;
-- ingestion may tag against these slugs but NEVER invent new topics.

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  parent_id uuid references public.topics (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.node_topics (
  node_id uuid not null references public.nodes (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  confidence numeric not null default 0.5,
  created_at timestamptz not null default now(),
  primary key (node_id, topic_id)
);
create index if not exists node_topics_topic_idx on public.node_topics (topic_id);

alter table public.topics enable row level security;
alter table public.node_topics enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'topics' and policyname = 'topics_read') then
    create policy topics_read on public.topics for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'node_topics' and policyname = 'node_topics_read') then
    create policy node_topics_read on public.node_topics for select using (true);
  end if;
end $$;

-- Seed the fixed tree (idempotent). Roots first, then level 1, then level 2,
-- so self-referencing parent_id resolves within a single migration run.
insert into public.topics (slug, name, parent_id) values
  ('technology', 'Technology', null),
  ('governance', 'Governance', null),
  ('security-defense', 'Security & Defense', null),
  ('energy-environment', 'Energy & Environment', null),
  ('labor-economy', 'Labor & Economy', null),
  ('public-health', 'Public Health', null),
  ('civil-liberties', 'Civil Liberties', null)
on conflict (slug) do update set name = excluded.name;

insert into public.topics (slug, name, parent_id)
select s.slug, s.name, p.id from (values
  ('ai', 'Artificial Intelligence', 'technology'),
  ('semiconductors', 'Semiconductors', 'technology'),
  ('quantum-computing', 'Quantum computing', 'technology'),
  ('data-centers', 'Data centers', 'technology'),
  ('telecommunications', 'Telecommunications', 'technology'),
  ('governance-legislation', 'Legislation', 'governance'),
  ('governance-regulatory-action', 'Regulatory action', 'governance'),
  ('governance-judicial', 'Judicial', 'governance'),
  ('governance-executive-action', 'Executive action', 'governance')
) as s (slug, name, parent_slug)
join public.topics p on p.slug = s.parent_slug
on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id;

insert into public.topics (slug, name, parent_id)
select s.slug, s.name, p.id from (values
  ('ai-model-development', 'Model development', 'ai'),
  ('ai-regulation', 'AI regulation', 'ai'),
  ('ai-infrastructure', 'AI infrastructure', 'ai'),
  ('semiconductors-fabrication', 'Fabrication', 'semiconductors'),
  ('semiconductors-export-controls', 'Export controls', 'semiconductors'),
  ('semiconductors-supply-chain', 'Supply chain', 'semiconductors'),
  ('data-centers-siting', 'Siting & permitting', 'data-centers'),
  ('data-centers-energy', 'Energy consumption', 'data-centers'),
  ('data-centers-water', 'Water use', 'data-centers')
) as s (slug, name, parent_slug)
join public.topics p on p.slug = s.parent_slug
on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id;
