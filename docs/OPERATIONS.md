# Operations

Operational guide for BWinkeler Lists (`service_id: lists`). Read alongside
`docs/PLATFORM_ARCHITECTURE.md` and `docs/SERVICE_MANIFEST.md`.

## Prerequisites

- Node.js >= 22.12 (see `.node-version`)
- npm
- Docker and Docker Compose (local PostgreSQL and container builds)

## Local development

1. Copy `.env.example` to `.env` and adjust values (no real secrets).
2. Start local PostgreSQL: `docker compose -f deploy/compose.dev.yaml up -d postgres`
3. Apply migrations: `npm run db:migrate -w @bwinkeler-lists/backend`
4. Seed development data: `npm run db:seed -w @bwinkeler-lists/backend`
5. Start the dev servers: `npm run dev`. The Vite dev server proxies `/api` and
   `/ws` to the backend so the browser sees a single origin.

## Validation

Run the full gate before every change:

```sh
npm run validate
```

This runs format, lint, typecheck, tests, and build across all workspaces.

## Database and migrations

- The schema is owned by this repository and applied only through versioned
  migrations (architecture §11.6).
- After changing the schema, generate a migration:
  `npm run db:generate -w @bwinkeler-lists/backend`.
- Migrations run as a single job using the migrator credential before rollout.

## Production

Production images are built in CI and pulled on the VPS; the VPS never builds.
See `docs/PLATFORM_ARCHITECTURE.md` §19 for the deploy sequence. This service:

- joins the external networks `bw-edge` and `bw-data` and a private
  `bw-lists-private` network;
- publishes no host ports;
- exposes the aliases `lists-web` and `lists-api`;
- is routed by the shared Caddy: `/` to `lists-web`, `/api` and `/ws` to
  `lists-api`.

Infrastructure tasks (database and roles, Caddy fragment, DNS, backup) live in
the `bwinkeler-infra` repository and are proposed there separately.

## Health and rollback

- Liveness: `GET /health/live`. Readiness: `GET /health/ready`.
- Rollback: repoint `APP_VERSION` to the previous immutable tag and redeploy.
  Migrations are forward-only and backward-compatible.

## Dependency security

`npm audit` currently reports two advisories that are accepted and tracked:

- **react-router / react-router-dom** (high, GHSA-qwww-vcr4-c8h2): affects React
  Router's experimental RSC mode only. This application is a client-side SPA
  without RSC or server actions, so it is not exploitable. Version 7.18.2 is the
  most-patched release available; earlier releases carry additional, applicable
  issues.
- **esbuild via drizzle-kit** (moderate, GHSA-67mh-4wv8-2f99): a development-only
  advisory affecting esbuild's dev server. `drizzle-kit` is a devDependency used
  only to generate migrations and is not included in production images.

Re-evaluate on every dependency update and move to a fully clean tree once
patched releases are available.
