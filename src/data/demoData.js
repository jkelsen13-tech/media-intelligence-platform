// Demo dataset: Fort Campbell drone theft story.
// Mirrors the Supabase tables so a row from the DB and a row from this file
// render identically. Used whenever VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// are unset.

export const demoNodes = [
  {
    id: 'evt-theft',
    slug: 'evt-theft',
    label: 'Drone Tech Theft at Fort Campbell',
    type: 'event',
    description:
      'Sensitive drone equipment and components stolen from Fort Campbell and moved off-base.',
    confidence: 92,
    summary:
      'Four Skydio X10D military AI surveillance drones were reported stolen from Fort Campbell. Military-grade platforms carry asset tracking, GPS signatures, and serial-numbered inventory — making an untracked disappearance structurally anomalous.',
    occurred_at: '2025-11-02',
  },
  {
    id: 'evt-disclosure',
    slug: 'evt-disclosure',
    label: 'Public Disclosure After 108 Days',
    type: 'event',
    description:
      'Theft publicly disclosed 108 days after the incident, via an Army Facebook post requesting tips.',
    confidence: 78,
    summary:
      'The incident was not publicly disclosed for 108 days. When disclosed, the Army posted on Facebook and asked the public to call a tip line — the instrument an institution uses when it has no leads, or wants to appear to have none.',
    occurred_at: '2026-02-18',
  },
  {
    id: 'evt-arrests',
    slug: 'evt-arrests',
    label: 'Arrests & Federal Charges',
    type: 'event',
    description: 'Suspects arrested; federal charges filed.',
    confidence: 85,
    summary:
      'Suspects were arrested and federal charges filed. Downstream accountability outcomes — trial, sentencing, recovery of the hardware — remain open tracking items.',
    occurred_at: '2026-03-05',
  },
  {
    id: 'act-soldier-1',
    slug: 'act-soldier-1',
    label: 'Suspect Soldier 1',
    type: 'actor',
    description: 'Primary suspect; alleged to have removed equipment from base.',
    confidence: 70,
  },
  {
    id: 'act-soldier-2',
    slug: 'act-soldier-2',
    label: 'Suspect Soldier 2',
    type: 'actor',
    description: 'Alleged co-conspirator.',
    confidence: 62,
  },
  {
    id: 'act-buyer',
    slug: 'act-buyer',
    label: 'Outside Buyer',
    type: 'actor',
    description: 'Alleged purchaser of the stolen drone tech.',
    confidence: 55,
  },
  {
    id: 'inst-ftcampbell',
    slug: 'inst-ftcampbell',
    label: 'Fort Campbell / 101st Airborne',
    type: 'institution',
    description: 'Installation where the theft occurred.',
    confidence: 95,
  },
  {
    id: 'inst-cid',
    slug: 'inst-cid',
    label: 'Army CID',
    type: 'institution',
    description: 'Criminal Investigation Division; led the investigation.',
    confidence: 90,
  },
  {
    id: 'inst-doj',
    slug: 'inst-doj',
    label: 'DOJ / U.S. Attorney',
    type: 'institution',
    description: 'Prosecuting office.',
    confidence: 90,
  },
  {
    id: 'doc-complaint',
    slug: 'doc-complaint',
    label: 'Criminal Complaint',
    type: 'document',
    description: 'Charging document laying out the alleged scheme.',
    confidence: 88,
  },
  {
    id: 'anom-coverage',
    slug: 'anom-coverage',
    label: 'Coverage Drop-off',
    type: 'anomaly',
    description:
      'Silence anomaly: national coverage fades after the initial arrest reports.',
    confidence: 81,
    summary:
      'National coverage faded within one news cycle despite open accountability milestones and unrecovered military hardware. High connection weight, near-zero ongoing coverage — flagged as a silence anomaly.',
  },
]

export const demoEdges = [
  { id: 'e1', source: 'act-soldier-1', target: 'evt-theft', type: 'actor', weight: 'heavy', label: 'carried out' },
  { id: 'e2', source: 'act-soldier-2', target: 'evt-theft', type: 'actor', weight: 'medium', label: 'assisted' },
  { id: 'e3', source: 'act-soldier-2', target: 'act-soldier-1', type: 'actor', weight: 'light', label: 'co-conspirator' },
  { id: 'e4', source: 'inst-ftcampbell', target: 'evt-theft', type: 'actor', weight: 'light', label: 'site of' },
  { id: 'e5', source: 'act-buyer', target: 'act-soldier-1', type: 'financial', weight: 'heavy', label: 'paid' },
  { id: 'e6', source: 'act-soldier-1', target: 'act-buyer', type: 'financial', weight: 'medium', label: 'delivered goods' },
  { id: 'e7', source: 'evt-theft', target: 'evt-disclosure', type: 'causal', weight: 'heavy', label: 'disclosed after 108 days' },
  { id: 'e7b', source: 'evt-disclosure', target: 'evt-arrests', type: 'causal', weight: 'medium', label: 'tip line preceded' },
  { id: 'e8', source: 'evt-theft', target: 'evt-arrests', type: 'causal', weight: 'heavy', label: 'led to' },
  { id: 'e9', source: 'inst-cid', target: 'evt-arrests', type: 'causal', weight: 'medium', label: 'investigation produced' },
  { id: 'e10', source: 'inst-cid', target: 'act-soldier-1', type: 'conflict', weight: 'medium', label: 'investigated' },
  { id: 'e11', source: 'inst-doj', target: 'doc-complaint', type: 'documentary', weight: 'medium', label: 'filed' },
  { id: 'e12', source: 'doc-complaint', target: 'evt-arrests', type: 'documentary', weight: 'heavy', label: 'charges' },
  { id: 'e13', source: 'evt-arrests', target: 'anom-coverage', type: 'causal', weight: 'light', label: 'followed by' },
]

// node_slug references demoNodes ids above.
export const demoSources = [
  { id: 's1', node_slug: 'evt-theft', outlet: 'Army Public Affairs (Facebook)', headline: 'Fort Campbell requests public assistance locating missing equipment', url: 'https://www.facebook.com/FortCampbell', published_at: '2026-02-18' },
  { id: 's2', node_slug: 'evt-theft', outlet: 'Clarksville Now', headline: 'Military drones reported stolen from Fort Campbell', url: 'https://clarksvillenow.com', published_at: '2026-02-19' },
  { id: 's3', node_slug: 'evt-disclosure', outlet: 'Stars and Stripes', headline: 'Army seeks tips 108 days after drone theft at Fort Campbell', url: 'https://www.stripes.com', published_at: '2026-02-18' },
  { id: 's4', node_slug: 'evt-arrests', outlet: 'DOJ Press Release', headline: 'Two charged in theft of military drone systems', url: 'https://www.justice.gov', published_at: '2026-03-05' },
  { id: 's5', node_slug: 'evt-arrests', outlet: 'Associated Press', headline: 'Soldiers charged in Fort Campbell drone theft case', url: 'https://apnews.com', published_at: '2026-03-06' },
  { id: 's6', node_slug: 'doc-complaint', outlet: 'U.S. District Court (M.D. Tenn.)', headline: 'Criminal complaint and affidavit', url: 'https://www.tnmd.uscourts.gov', published_at: '2026-03-05' },
  { id: 's7', node_slug: 'anom-coverage', outlet: 'MIP Analysis Layer', headline: 'Coverage volume collapsed 96% within 9 days of arrests while milestones remain open', url: null, published_at: null },
]

export const demoArcs = [
  {
    id: 'arc-ftcampbell-drones',
    slug: 'arc-ftcampbell-drones',
    title: 'Fort Campbell Drone Theft — Accountability Arc',
    category: 'institutional_accountability',
    status: 'active',
    root_node_id: 'evt-theft',
    coverage_gap: true,
    summary:
      'Tracks the stolen Skydio X10D drones from theft through disclosure, arrests, and prosecution. Open questions: hardware recovery, trial outcome, and whether asset-tracking failures produced any institutional reform. Coverage has faded while milestones remain open.',
    started_at: '2025-11-02',
    last_update_at: '2026-03-14T00:00:00Z',
  },
]

export const demoMilestones = [
  { id: 'm1', arc_slug: 'arc-ftcampbell-drones', title: 'CID investigation opened', status: 'confirmed_complete', notes: 'Army CID led the investigation.', updated_at: '2025-11-05T00:00:00Z' },
  { id: 'm2', arc_slug: 'arc-ftcampbell-drones', title: 'Public disclosure of the theft', status: 'confirmed_complete', notes: 'Disclosed via Facebook tip-line post after 108 days.', updated_at: '2026-02-18T00:00:00Z' },
  { id: 'm3', arc_slug: 'arc-ftcampbell-drones', title: 'Federal charges filed', status: 'confirmed_complete', notes: 'Criminal complaint filed by U.S. Attorney.', updated_at: '2026-03-05T00:00:00Z' },
  { id: 'm4', arc_slug: 'arc-ftcampbell-drones', title: 'Stolen drones recovered', status: 'unresolved', notes: 'No documented recovery of the four X10D units.', updated_at: '2026-03-05T00:00:00Z' },
  { id: 'm5', arc_slug: 'arc-ftcampbell-drones', title: 'Trial / judicial outcome', status: 'pending', notes: 'Proceedings not yet concluded.', updated_at: '2026-03-05T00:00:00Z' },
  { id: 'm6', arc_slug: 'arc-ftcampbell-drones', title: 'Institutional review of asset-tracking failure', status: 'unresolved', notes: 'No announced review of how tracked military hardware left base undetected.', updated_at: '2026-03-05T00:00:00Z' },
]

export const demoArcEvents = [
  { id: 'ae1', arc_slug: 'arc-ftcampbell-drones', title: 'Four X10D drones stolen from Fort Campbell', category: 'accountability', confidence: 'confirmed', occurred_at: '2025-11-02', description: 'Triggering event. Military AI surveillance platforms with asset tracking removed from base.' },
  { id: 'ae2', arc_slug: 'arc-ftcampbell-drones', title: '108 days of non-disclosure', category: 'accountability', confidence: 'confirmed', occurred_at: '2026-02-18', description: 'Incident withheld from public for 108 days — anomalous relative to standard military theft disclosure timelines. Flagged by silence detection.' },
  { id: 'ae3', arc_slug: 'arc-ftcampbell-drones', title: 'Army Facebook tip-line post', category: 'accountability', confidence: 'confirmed', occurred_at: '2026-02-18', description: 'Disclosure took the form of a tip request — structurally inconsistent with tracked, serialized military inventory.' },
  { id: 'ae4', arc_slug: 'arc-ftcampbell-drones', title: 'Arrests and federal charges', category: 'accountability', confidence: 'confirmed', occurred_at: '2026-03-05', description: 'Suspects charged; prosecution begins.' },
  { id: 'ae5', arc_slug: 'arc-ftcampbell-drones', title: 'National coverage collapse', category: 'accountability', confidence: 'inferred', occurred_at: '2026-03-14', description: 'Coverage volume fell ~96% within nine days of arrests while recovery and trial milestones remained open. Connection to suppression is inference, not documentation.' },
]
