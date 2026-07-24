Pipeline source of truth is the DEPLOYED edge function (ingest-rss, v9).
This file mirrors the deployed version. Local edits here do nothing until
deployed via the Supabase MCP deploy_edge_function tool or `supabase functions deploy`.

See index.ts in this directory for the full pipeline source.

# Ingestion / provenance / arc-assignment pipeline

Per run (scheduled every 24h via pg_cron, cadence stored in pipeline_config.ingest_cron):

1. Fetch every enabled feed in public.ingest_sources (5 outlets: Fox, CNN, BBC, Al Jazeera, NYT).
2. Per new article (deduped by URL):
   a. Resolve byline -> authors row (new authors queued for profiling).
   b. Resolve outlet -> outlets row (parent ownership tracked).
   c. Extract citations (heuristic patterns -> citations rows, weighted by doc_strength_weights).
   d. Extract claims (substantive vs framing sentences -> articles.claims jsonb).
   e. Embed title+summary (Supabase AI gte-small, 384-dim -> articles.embedding).
   f. Cosine vs active arc embeddings: >= attach_threshold (0.88) -> attach + generate node/edge/arc_event.
   g. Else significance check (cross-outlet coverage in the same cycle + citation density) -> originate new arc.
   h. Else store unattached.
3. Monoculture pass: articles sharing one originating citation get monoculture = true (confidence penalty factor 0.7 at node generation).
4. Author profiling phase: queued authors with >= author_min_articles (3) articles get a heuristic framing profile (settled-vs-contested claim ratio, citation diversity); cached, quarterly refresh, confidence interval stored.

All constants live in public.pipeline_config; the source list lives in public.ingest_sources.
