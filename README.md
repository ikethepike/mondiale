# Nuxt 3 Minimal Starter

Look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install the dependencies:

```bash
# yarn
yarn install

# npm
npm install

# pnpm
pnpm install --shamefully-hoist
```

## Development Server

Start the development server on http://localhost:3000

```bash
npm run dev
```

## Production

Build the application for production:

```bash
npm run build
```

Locally preview production build:

```bash
npm run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Data generators

Game data is fetched-and-committed by the `generate:*` scripts in `package.json`
(`bun run generate:owid`, `generate:wpp`, `generate:countries`, …). Sources are
open CSV/JSON downloads; regenerate, eyeball the diff, commit.

### Attribution

Every dataset is credited in `lib/attribution.ts`: the provider, the release it
came from, its licence and the year its figures are for. A new `data/*.gen.ts`
must be claimed by a `DATASETS` entry there — `lib/attribution.test.ts` fails
until it is. Views resolve credits through `attributionFor(accessorId, amount)`
(or `datasetAttribution(datasetId)`) rather than naming a source in copy, and
`pages/sources.vue` is rendered straight from the registry.

Per-value provenance rides along on `Amount.source`, stamped by the generators
where a stat has a fallback chain (military spending prefers SIPRI via OWID and
backstops with the Factbook), so a figure is credited to the source it actually
came from. Values generated before the stamp existed fall back to the primary
source named in `STAT_ORIGINS`; re-run `generate:countries` to fill them in.

### UN World Population Prospects

`generate:wpp` reads the open **bulk CSVs** (no auth) — the primary source for
demography and population pyramids. The UN Data Portal **API** is only for
spot-checks: its `/data` endpoints require a bearer token, sent as
`Authorization: Bearer $UN_DATA_PORTAL_TOKEN` (stored in `.env`, never
committed).

- Token renewal: https://population.un.org/dataportalapi/token/index.html
  (valid 1 year; current token expires **2027-07-28**; issued by
  population@un.org)
