-- 04_TRACK_B_DESIGN Step 1: shared light-theme tokens feature flag.
-- Matches the phase3_beta / source_comparison_beta / account_ui withhold
-- posture: boolean true switches the app to the [data-theme='light'] token
-- bundle (src/styles/tokens.css); false/missing/unreadable keeps the dark
-- theme. Rollback = set false — no data or logic touched (Doc 04 rollback).
insert into public.pipeline_config (key, value, description)
values (
  'track_b_light_theme',
  'false'::jsonb,
  '04_TRACK_B Step 1: shared light-theme tokens. true = light token bundle app-wide; false = dark. Rollback = set false.'
)
on conflict (key) do nothing;
