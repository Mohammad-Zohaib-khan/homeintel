# HomeIntel

Neighborhood intelligence for people deciding where to live in India. HomeIntel brings together amenities (OpenStreetMap), air quality (CPCB, OpenAQ) and public safety records (NCRB via data.gov.in). It scores localities with **fixed, published rules**, lets you compare them and weight them by your own priorities, and shows **where every number came from and what area it covers**.

AI is optional. It explains and summarises stored evidence, with citations that are checked, and it never decides scores, permissions or data.

## Features

| Area | What works |
|---|---|
| Home | Live search, highest-scoring specimen, an interactive 3D coverage globe of every locality (lazy-loaded, keyboard-accessible markers, list alternative), method, labels, FAQ |
| Search & explore | Prefix search, city filter, sort, pagination, list ↔ map sync, compare tray, OpenStreetMap lookup to add any Indian locality (signed in) |
| Profiles | Contour score, category ledger with rule-level explanations, amenity map plus a list alternative, PM2.5 trend (chart, table and text summary), evidence table, sources and licences, data-quality notes, ingestion progress |
| Scoring | Deterministic engine (`server/src/scoring/engine.js`, v1.0.0): coverage, confidence, freshness, missing categories reported and never estimated |
| Compare | 2–4 localities, category leaders, trade-offs, temporary re-weighting, saved comparisons, shareable URL, dedicated mobile layout |
| Personalize | Presets and 0–5 sliders, live server-ranked preview, saved per user and applied everywhere |
| Saved | Notes, tags, tag filter, CSV export (formula-safe), secure CSV shortlist import |
| Reports | Immutable snapshots (strengths, concerns, caveats, evidence, sources), print or PDF, revocable share links with Open Graph preview, optional AI narrative |
| AI | Research, comparison and report agents; provider abstraction (Anthropic, OpenAI, Gemini or none); grounded evidence packs; citation verification; per-user quota; fully usable without AI |
| Admin console | Overview, data health (per-locality source status, refresh one or all stale, ingestion run log), data-quality queue, security events (audit log), user controls (unlock, sign out everywhere, admin role). Requires the admin role, two-factor on, and a session signed in with the code. Shows counts only, never users' notes, reports or questions |
| Accounts | Argon2id, HttpOnly cookie sessions, rotating refresh tokens with reuse detection, CSRF, TOTP two-factor sign-in with recovery codes, change password, sign out everywhere, account deletion |
| Quality of experience | Light and dark themes (separately designed), keyboard shortcuts (`?`), skip link, route announcer, back-to-top, consent banner, toasts, skeletons, empty, error, stale and partial states |

## Quick start

```bash
cp .env.example .env                 # defaults work for local development
npm install
docker compose -f docker-compose.test.yml up -d   # or point MONGODB_URI at any MongoDB 6+
npm run seed:all                     # localities + labelled demo data + live ingestion where reachable
npm run dev                          # API http://localhost:5000, web http://localhost:5173
```

Requires Node ≥ 20 (22 recommended).

**Admin access:** there are no default accounts. Create the first admin with `npm run admin -- create --email you@example.com --name "Your Name"`, scan the printed QR code with an authenticator app, then sign in and open **Admin** in the header.

Without network access or API keys, `seed:all` falls back to **demo data**. It is synthetic and labelled "Demo data" everywhere, so the whole product can be tried offline. Once a live provider succeeds for a locality, its demo data is removed; demo and real values are never mixed.

### Real data

| Source | Needs | Command |
|---|---|---|
| OpenStreetMap amenities (Overpass) | network only | `npm run seed:osm` |
| Air quality (OpenAQ v3 + CPCB on data.gov.in) | `OPENAQ_API_KEY`, `DATA_GOV_IN_API_KEY` | `npm run seed:air-quality` |
| NCRB crime (data.gov.in) | `DATA_GOV_IN_API_KEY` + a verified mapping | `npm run inspect:ogd -- <resourceId>`, edit `server/src/ingestion/config/crimeResources.json`, then `npm run seed:crime` |
| Precise locality centres (Nominatim) | network | `npm run seed:localities -- --geocode` |

All of these accept `-- --slug <slug>` and are idempotent.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | API (watch) + Vite dev server |
| `npm test` | Server (`node:test`) + client (Vitest) tests; `REQUIRE_DB=1` fails if MongoDB is missing |
| `npm run build` | Production client build (no source maps) |
| `npm start` | Production API (`SERVE_CLIENT=1` to also serve the SPA) |
| `npm run seed:<localities\|demo\|osm\|air-quality\|crime\|all>` | Data CLI |
| `npm run inspect:ogd -- <id>` | Print a data.gov.in resource schema before mapping it |
| `npm run webhook:refresh -- <api-url> '<json>'` | Send a signed refresh webhook |
| `npm run admin -- create --email E --name N` | Create an admin (prompts for a password; two-factor is enrolled immediately and its QR code printed). Also `promote`, `demote`, `list` |
| `npm run audit:deps` | Dependency vulnerability audit (high and above) |

## Environment

Every variable is documented in [.env.example](.env.example). The server validates them at startup and refuses to run in production without strong secrets or with non-https origins. API keys are server-side only; nothing secret is ever exposed through `VITE_*`.

## Architecture

```
client/   React 18 · Vite 8 · Tailwind 4 · React Router 7 (data router, lazy routes) · Leaflet · Recharts
server/   Express · Mongoose · Zod   routes → validators → controllers → services → models
          scoring/    pure deterministic engine
          ingestion/  adapters (overpass, nominatim, openaq, ogd, cpcb, ncrb) → normalize → pipeline
          ai/         providers · evidence · agents (read-only over scores)
shared/   categories, weights, presets, labels (used by both sides)
scripts/  data CLI, OGD inspector, webhook signer
```

## Deployment (summary)

- **Azure Container Apps (current):** `powershell -ExecutionPolicy Bypass -File scriptszure-deploy.ps1 -EnvFile .env.azure` builds the image, pushes it to Azure Container Registry, stores secrets as Container Apps secrets and waits for `/api/health`. Copy the keys you need from `.env.example` into a git-ignored `.env.azure` first.
- **Recommended:** Vercel (client) + Render (API) + MongoDB Atlas. Vercel rewrites `/api/*` and `/share/*` to the API, so cookies stay first-party (`SameSite=Lax`) and the CSP can use `connect-src 'self'`.
- **Single service:** `SERVE_CLIENT=1` (Render or the included `Dockerfile`) serves the API and SPA from one origin with a strict CSP.
- CI (`.github/workflows/ci.yml`) runs every test against MongoDB 7, builds, checks that no source maps are shipped, and audits dependencies.

## Licences and attribution

Map data and amenities © OpenStreetMap contributors (ODbL 1.0). Government datasets are used under the Government Open Data License – India. OpenAQ data is subject to each originating provider's terms. Attribution is shown in the app footer, on every profile's Sources section, and in every report.
