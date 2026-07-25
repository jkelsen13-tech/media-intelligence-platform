-- backfill-legacy v3 reprocess cursors (MIP Build Directive v2, steps 1-4 reprocess)
alter table public.articles add column if not exists entities_extracted_at timestamptz;
alter table public.articles add column if not exists arc_assign_attempted_at timestamptz;
create index if not exists articles_extract_idx on public.articles (entities_extracted_at) where entities_extracted_at is null;
create index if not exists articles_assign_idx on public.articles (arc_assign_attempted_at) where arc_id is null and arc_assign_attempted_at is null;
