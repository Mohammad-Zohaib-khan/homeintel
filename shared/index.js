// Shared, dependency-free constants used by both server (scoring, validation) and client (labels, UI).

export const CATEGORIES = [
  { id: 'education', label: 'Education', short: 'Schools', description: 'Schools, colleges and kindergartens within reach.' },
  { id: 'healthcare', label: 'Healthcare', short: 'Health', description: 'Hospitals, clinics and pharmacies nearby.' },
  { id: 'safety', label: 'Safety', short: 'Safety', description: 'Emergency services proximity and, where an official dataset is configured, recorded crime.' },
  { id: 'environment', label: 'Air & environment', short: 'Air', description: 'Measured air quality at nearby monitoring stations, and green space.' },
  { id: 'utilities', label: 'Water & utilities', short: 'Utilities', description: 'Water supply and municipal utility reliability.' },
  { id: 'power', label: 'Power reliability', short: 'Power', description: 'Electricity supply reliability.' },
  { id: 'connectivity', label: 'Connectivity', short: 'Internet', description: 'Broadband and mobile network quality.' },
  { id: 'transport', label: 'Transport', short: 'Transit', description: 'Bus stops and rail/metro stations within walking distance.' },
  { id: 'essentials', label: 'Daily essentials', short: 'Essentials', description: 'Groceries, markets, banks and ATMs close by.' },
  { id: 'development', label: 'Development signals', short: 'Growth', description: 'Mapped construction activity and planned infrastructure nearby.' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

// Default weights (0–5). Users override these on /personalize.
export const DEFAULT_WEIGHTS = Object.freeze({
  education: 3, healthcare: 4, safety: 4, environment: 3, utilities: 3,
  power: 3, connectivity: 2, transport: 3, essentials: 3, development: 1,
});

export const WEIGHT_PRESETS = [
  { id: 'balanced', label: 'Balanced', description: 'Sensible defaults for most households.', weights: DEFAULT_WEIGHTS },
  { id: 'family', label: 'Family with children', description: 'Schools, healthcare and safety come first.',
    weights: { education: 5, healthcare: 5, safety: 5, environment: 4, utilities: 3, power: 3, connectivity: 2, transport: 2, essentials: 3, development: 1 } },
  { id: 'professional', label: 'Working professional', description: 'Commute, connectivity and daily convenience.',
    weights: { education: 1, healthcare: 3, safety: 3, environment: 3, utilities: 3, power: 4, connectivity: 5, transport: 5, essentials: 4, development: 2 } },
  { id: 'retiree', label: 'Retired', description: 'Healthcare, clean air and calm, walkable essentials.',
    weights: { education: 0, healthcare: 5, safety: 4, environment: 5, utilities: 4, power: 3, connectivity: 2, transport: 2, essentials: 4, development: 0 } },
  { id: 'investor', label: 'Investor', description: 'Growth signals and broad liveability that sustain demand.',
    weights: { education: 3, healthcare: 3, safety: 3, environment: 2, utilities: 3, power: 3, connectivity: 3, transport: 4, essentials: 3, development: 5 } },
];

// Geographic level a value describes. The UI must always show this.
export const GRANULARITY = ['neighborhood', 'locality', 'city', 'district', 'state', 'station'];
export const GRANULARITY_LABEL = {
  neighborhood: 'Neighborhood', locality: 'Locality', city: 'City-wide', district: 'District-wide',
  state: 'State-wide', station: 'Nearby station',
};

// Where a value came from. 'seed' is synthetic demo data and must be labelled as such.
export const ORIGINS = ['live', 'cached', 'seed'];
export const ORIGIN_LABEL = { live: 'Source-backed', cached: 'Source-backed (cached)', seed: 'Demo data' };

export const SCORE_BANDS = [
  { min: 80, label: 'Excellent' }, { min: 65, label: 'Strong' }, { min: 50, label: 'Fair' },
  { min: 35, label: 'Weak' }, { min: 0, label: 'Poor' },
];
export const scoreBand = (s) => (s == null ? 'No data' : SCORE_BANDS.find((b) => s >= b.min).label);

export const MAX_COMPARE = 4;
