// Demo dataset: Fort Campbell drone theft story.
// Placeholder entity names — replace labels/descriptions with the specifics
// from your source doc. Shapes mirror the Supabase nodes/edges tables so a
// row from the DB and a row from this file render identically.

export const demoNodes = [
  {
    id: 'evt-theft',
    label: 'Drone Tech Theft at Fort Campbell',
    type: 'event',
    description:
      'Sensitive drone equipment and components stolen from Fort Campbell and moved off-base.',
  },
  {
    id: 'evt-arrests',
    label: 'Arrests & Federal Charges',
    type: 'event',
    description: 'Suspects arrested; federal charges filed.',
  },
  {
    id: 'act-soldier-1',
    label: 'Suspect Soldier 1',
    type: 'actor',
    description: 'Primary suspect; alleged to have removed equipment from base.',
  },
  {
    id: 'act-soldier-2',
    label: 'Suspect Soldier 2',
    type: 'actor',
    description: 'Alleged co-conspirator.',
  },
  {
    id: 'act-buyer',
    label: 'Outside Buyer',
    type: 'actor',
    description: 'Alleged purchaser of the stolen drone tech.',
  },
  {
    id: 'inst-ftcampbell',
    label: 'Fort Campbell / 101st Airborne',
    type: 'institution',
    description: 'Installation where the theft occurred.',
  },
  {
    id: 'inst-cid',
    label: 'Army CID',
    type: 'institution',
    description: 'Criminal Investigation Division; led the investigation.',
  },
  {
    id: 'inst-doj',
    label: 'DOJ / U.S. Attorney',
    type: 'institution',
    description: 'Prosecuting office.',
  },
  {
    id: 'doc-complaint',
    label: 'Criminal Complaint',
    type: 'document',
    description: 'Charging document laying out the alleged scheme.',
  },
  {
    id: 'anom-coverage',
    label: 'Coverage Drop-off',
    type: 'anomaly',
    description:
      'Silence anomaly: national coverage fades after the initial arrest reports.',
  },
]

export const demoEdges = [
  { id: 'e1', source: 'act-soldier-1', target: 'evt-theft', type: 'actor', weight: 'heavy', label: 'carried out' },
  { id: 'e2', source: 'act-soldier-2', target: 'evt-theft', type: 'actor', weight: 'medium', label: 'assisted' },
  { id: 'e3', source: 'act-soldier-2', target: 'act-soldier-1', type: 'actor', weight: 'light', label: 'co-conspirator' },
  { id: 'e4', source: 'inst-ftcampbell', target: 'evt-theft', type: 'actor', weight: 'light', label: 'site of' },
  { id: 'e5', source: 'act-buyer', target: 'act-soldier-1', type: 'financial', weight: 'heavy', label: 'paid' },
  { id: 'e6', source: 'act-soldier-1', target: 'act-buyer', type: 'financial', weight: 'medium', label: 'delivered goods' },
  { id: 'e7', source: 'evt-theft', target: 'evt-arrests', type: 'causal', weight: 'heavy', label: 'led to' },
  { id: 'e8', source: 'inst-cid', target: 'evt-arrests', type: 'causal', weight: 'medium', label: 'investigation produced' },
  { id: 'e9', source: 'inst-cid', target: 'act-soldier-1', type: 'conflict', weight: 'medium', label: 'investigated' },
  { id: 'e10', source: 'inst-doj', target: 'doc-complaint', type: 'documentary', weight: 'medium', label: 'filed' },
  { id: 'e11', source: 'doc-complaint', target: 'evt-arrests', type: 'documentary', weight: 'heavy', label: 'charges' },
  { id: 'e12', source: 'evt-arrests', target: 'anom-coverage', type: 'causal', weight: 'light', label: 'followed by' },
]
