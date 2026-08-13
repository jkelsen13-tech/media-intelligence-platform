-- 05_ACCOUNT_PIPELINE: feature flag for the account UI entry point.
-- Matches the phase3_beta / source_comparison_beta withhold posture:
-- boolean true exposes the Sign in button; flipping false removes the
-- entry point without touching accounts or data (Doc 05 rollback field).
insert into public.pipeline_config (key, value, description)
values (
  'account_ui',
  'true'::jsonb,
  '05_ACCOUNT_PIPELINE: expose magic-link account UI (identity layer only). Rollback = set false.'
)
on conflict (key) do nothing;
