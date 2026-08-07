-- Doc 07 Amendment 07-A: Adjacent Bias/Hate-Incident Track storage.
-- Additive only: new table. Separate from the legal-policy outcome track;
-- shares the run's 300-article ceiling at the manifest layer (not enforced here).
-- Applied to production as migration 20260807_bias_incidents (owner-authorized 2026-08-07).
-- Note: ingestion_run_id intentionally carries no FK — the tag is a non-unique
-- label shared by every row of a bounded run (first draft's REFERENCES clause
-- failed on articles.ingestion_run_id being non-unique; dropped by design).
CREATE TABLE IF NOT EXISTS public.bias_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_date date,
  jurisdiction text,
  status text NOT NULL DEFAULT 'status_unknown'
    CHECK (status IN (
      'reported_incident',
      'bias_incident_not_established_as_crime',
      'investigated_as_possible_hate_crime',
      'law_enforcement_reported_hate_crime',
      'hate_crime_charge_filed',
      'hate_crime_adjudicated',
      'status_unknown'
    )),
  callais_relationship text NOT NULL DEFAULT 'no_causal_link_established'
    CHECK (callais_relationship IN (
      'same_time_period',
      'same_jurisdiction',
      'same_affected_population',
      'publicly_attributed_to_policy_change',
      'officially_linked',
      'no_causal_link_established'
    )),
  -- Status may only be advanced by a DOJ/FBI/court/law-enforcement source.
  -- Advocacy/news characterizations live in explanations as claims, not here.
  status_source_url text,
  status_source_class text
    CHECK (status_source_class IN ('doj_fbi_court_le', 'news', 'advocacy')),
  -- Privacy: redacted at manifest selection, before any row exists. No private
  -- individual or minor may be named in this table, ever.
  summary_redacted text,
  -- Run tag, matching articles.ingestion_run_id by convention (no FK: the tag
  -- is a non-unique label shared by every row of a bounded run).
  ingestion_run_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bias_incidents_run_idx
  ON public.bias_incidents (ingestion_run_id)
  WHERE ingestion_run_id IS NOT NULL;

ALTER TABLE public.bias_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read bias_incidents"
  ON public.bias_incidents FOR SELECT
  USING (true);

COMMENT ON TABLE public.bias_incidents IS
  'Amendment 07-A Adjacent Bias/Hate-Incident Track. Records, never presumes: zero rows is a valid result (recorded absence, not proof none occurred). Temporal/geographic adjacency never creates a causal edge; causal edges require officially_linked or attributable publicly_attributed_to_policy_change.';
