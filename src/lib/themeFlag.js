// 04_TRACK_B_DESIGN Step 1 — shared light-theme tokens, feature-flagged.
//
// Flag: pipeline_config.track_b_light_theme must be exactly boolean true,
// matching the withhold posture of phase3_beta / source_comparison_beta /
// account_ui. False, missing, or unreadable all resolve to the dark theme
// (current production), so a failed flag read can never strand users on a
// half-enabled theme.
//
// Mechanism: when the flag is true we set data-theme="light" on <html>;
// src/styles/tokens.css carries a [data-theme='light'] block that revalues
// every design token. The dark :root block is untouched and remains the
// default, so rollback = set the flag false (one SQL update, effective on
// next page load) — no data or logic changes, per Doc 04's rollback field.
//
// Step 1 scope note: token values only. No layout, density, or font-size
// changes ship under this flag (body-text 16–18px is a separately logged
// open item).

import { supabase } from './supabase.js'

/** Pure resolution: exactly boolean true -> 'light'; everything else -> 'dark'. */
export function resolveTheme(flagValue) {
  return flagValue === true ? 'light' : 'dark'
}

/** Apply a resolved theme to the document root. No-op outside the browser. */
export function applyTheme(theme, root) {
  const el = root ?? (typeof document !== 'undefined' ? document.documentElement : null)
  if (!el) return
  if (theme === 'light') el.dataset.theme = 'light'
  else delete el.dataset.theme
}

/**
 * Flag read + apply. Returns the applied theme. Withhold posture: any error
 * or non-true value applies dark.
 */
export async function applyThemeFlag() {
  let theme = 'dark'
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('pipeline_config')
        .select('value')
        .eq('key', 'track_b_light_theme')
        .maybeSingle()
      if (!error) theme = resolveTheme(data?.value)
    }
  } catch {
    theme = 'dark'
  }
  applyTheme(theme)
  return theme
}
