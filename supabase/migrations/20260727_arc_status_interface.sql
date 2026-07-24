-- Tier 1.2 (spec §2.5.4): arc status interface.
-- Normalize arc_milestones.status to the four-state taxonomy
-- (pending / confirmed / failed / abandoned). The live table is empty
-- post-Pass-A, so the CHECK constraint applies cleanly; the UI maps any
-- legacy values (confirmed_complete / confirmed_failed / unresolved)
-- onto the new states for older data shapes (e.g. demo fallback).
-- The pre-existing CHECK used an earlier taxonomy (confirmed_complete /
-- confirmed_failed / unresolved); replace it. The UI maps legacy values
-- onto the new states for older data shapes (e.g. demo fallback).
alter table arc_milestones
  drop constraint if exists arc_milestones_status_check;

alter table arc_milestones
  add constraint arc_milestones_status_check
  check (status in ('pending', 'confirmed', 'failed', 'abandoned'));
