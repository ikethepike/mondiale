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

### UN World Population Prospects

`generate:wpp` reads the open **bulk CSVs** (no auth) — the primary source for
demography and population pyramids. The UN Data Portal **API** is only for
spot-checks: its `/data` endpoints require a bearer token, sent as
`Authorization: Bearer $UN_DATA_PORTAL_TOKEN` (stored in `.env`, never
committed).

- Token renewal: https://population.un.org/dataportalapi/token/index.html
  (valid 1 year; current token expires **2027-07-28**; issued by
  population@un.org)
