-- 02A Amendment B hardening: feature flag for the location-corroboration
-- render path (SkyBadge + confidence boost in News Feed and Article Panel).
-- Matches the phase3_beta / source_comparison_beta / account_ui withhold
-- posture: boolean true exposes the path; false, missing, or unreadable
-- fails closed and the UI renders nothing. Default false — the capability
-- stays dormant until a future owner-authorized phase flips it.
-- Rollback = set false (or delete the row — an absent flag also resolves
-- false). No data or logic changes; the flag gates rendering only.

insert into public.pipeline_config (key, value, description)
values (
  'location_corroboration',
  'false'::jsonb,
  '02A hardening: expose the location-corroboration render path (SkyBadge + boost). Withhold posture, default false. Rollback = set false.'
)
on conflict (key) do nothing;
