-- Seed: Fort Campbell drone theft demo story.
-- Mirrors src/data/demoData.js. Run after schema.sql.

insert into public.nodes (slug, label, type, description) values
  ('evt-theft',       'Drone Tech Theft at Fort Campbell', 'event',       'Sensitive drone equipment and components stolen from Fort Campbell and moved off-base.'),
  ('evt-arrests',     'Arrests & Federal Charges',         'event',       'Suspects arrested; federal charges filed.'),
  ('act-soldier-1',   'Suspect Soldier 1',                 'actor',       'Primary suspect; alleged to have removed equipment from base.'),
  ('act-soldier-2',   'Suspect Soldier 2',                 'actor',       'Alleged co-conspirator.'),
  ('act-buyer',       'Outside Buyer',                     'actor',       'Alleged purchaser of the stolen drone tech.'),
  ('inst-ftcampbell', 'Fort Campbell / 101st Airborne',    'institution', 'Installation where the theft occurred.'),
  ('inst-cid',        'Army CID',                          'institution', 'Criminal Investigation Division; led the investigation.'),
  ('inst-doj',        'DOJ / U.S. Attorney',               'institution', 'Prosecuting office.'),
  ('doc-complaint',   'Criminal Complaint',                'document',    'Charging document laying out the alleged scheme.'),
  ('anom-coverage',   'Coverage Drop-off',                 'anomaly',     'Silence anomaly: national coverage fades after the initial arrest reports.');

insert into public.edges (source_id, target_id, type, weight, label)
select s.id, t.id, e.type, e.weight, e.label
from (values
  ('act-soldier-1',   'evt-theft',     'actor',       'heavy',  'carried out'),
  ('act-soldier-2',   'evt-theft',     'actor',       'medium', 'assisted'),
  ('act-soldier-2',   'act-soldier-1', 'actor',       'light',  'co-conspirator'),
  ('inst-ftcampbell', 'evt-theft',     'actor',       'light',  'site of'),
  ('act-buyer',       'act-soldier-1', 'financial',   'heavy',  'paid'),
  ('act-soldier-1',   'act-buyer',     'financial',   'medium', 'delivered goods'),
  ('evt-theft',       'evt-arrests',   'causal',      'heavy',  'led to'),
  ('inst-cid',        'evt-arrests',   'causal',      'medium', 'investigation produced'),
  ('inst-cid',        'act-soldier-1', 'conflict',    'medium', 'investigated'),
  ('inst-doj',        'doc-complaint', 'documentary', 'medium', 'filed'),
  ('doc-complaint',   'evt-arrests',   'documentary', 'heavy',  'charges'),
  ('evt-arrests',     'anom-coverage', 'causal',      'light',  'followed by')
) as e(source_slug, target_slug, type, weight, label)
join public.nodes s on s.slug = e.source_slug
join public.nodes t on t.slug = e.target_slug;
