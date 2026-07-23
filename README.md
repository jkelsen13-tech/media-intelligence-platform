# media-intelligence-platform

MIP: Media Intelligence Platform — Interactive knowledge graph for tracking news stories, info ops, accountability arcs, and silence anomalies. Built with React + Vite + Cytoscape.js, backed by Supabase.

## Quick start

```bash
npm install
npm run dev
```

With no Supabase credentials configured, the app renders the bundled demo dataset (Fort Campbell drone theft story).

## Status

- Backend: **live** — Supabase project `niejaejtbxgakyrsntxm` (us-west-2), schema + Fort Campbell seed applied (10 nodes / 12 edges), anon read-only RLS enabled.
- Frontend builds clean (`npm run build`). With `.env` configured, header shows `data: supabase`.

## Supabase setup

1. In your Supabase project, open **SQL Editor** and run `supabase/schema.sql`, then `supabase/seed.sql`. (Already applied to the live project via migration `mip_knowledge_graph_schema`.)
2. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Project Settings → API**.
3. Restart `npm run dev`. The header shows `data: supabase` when it's reading from the database.

## Graph vocabulary

**Nodes** are octagons; border color encodes type, size scales with connection count.

| Type | Color |
| --- | --- |
| event | blue |
| actor | grey |
| institution | amber |
| document | green |
| anomaly | red |

**Edges** are colored by relationship type — causal (blue), actor (grey), financial (amber), conflict (red), documentary (green) — with thickness by weight: heavy, medium, light.

## Layout

- `src/graph/theme.js` — shared color/weight vocabulary
- `src/graph/styles.js` — Cytoscape stylesheet (octagons, degree-based sizing, edge styling)
- `src/graph/GraphView.jsx` — Cytoscape canvas component
- `src/data/demoData.js` — demo story dataset (mirrors the DB seed)
- `src/lib/supabase.js` — Supabase client + graph loader with demo fallback
- `supabase/schema.sql`, `supabase/seed.sql` — database schema and seed
