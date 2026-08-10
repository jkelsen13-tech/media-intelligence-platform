-- Incident remediation (2026-08-09 doc07 canary sweep): held run tags.
-- Articles whose ingestion_run_id is listed in pipeline_config.held_run_tags
-- are quarantined data (test canaries, held batches) and are excluded from
-- ingest-rss's Phase 2 unattached-sweep pool. Seeded with the Document 07
-- canary tag. General mechanism: any future held batch adds its tag here.
insert into public.pipeline_config (key, value)
values ('held_run_tags', '["doc07-canary-2026-08-08"]'::jsonb)
on conflict (key) do nothing;
