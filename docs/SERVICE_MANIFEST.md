# Service Manifest: Listly

## Identity

- Platform architecture version: 1.3
- Service ID: `lists`
- Product name: Listly
- Repository: https://github.com/brunowinkeler/bwinkeler-lists
- Owner: Bruno Winkeler
- Criticality: family

## Publication

- Production origin: https://lists.bwinkeler.com
- Frontend alias: `lists-web`
- Frontend internal port: 80
- API alias: `lists-api`
- API internal port: 8080
- API prefix: `/api`
- WebSocket path: `/ws`
- Caddy path behavior: preserve

## Containers

| Service | Image                           | Purpose                                       | Networks                           | Persistent data |
| ------- | ------------------------------- | --------------------------------------------- | ---------------------------------- | --------------- |
| web     | ghcr.io/brunowinkeler/lists-web | Static React SPA served by Caddy              | bw-edge                            | none            |
| api     | ghcr.io/brunowinkeler/lists-api | Fastify HTTP + WebSocket server               | bw-edge, bw-data, bw-lists-private | none            |
| migrate | ghcr.io/brunowinkeler/lists-api | One-shot schema migration job (tools profile) | bw-data                            | none            |

## Database

- Database: `lists_db`
- Runtime role: `lists_runtime`
- Migrator role: `lists_migrator`
- Position ordering: binary `COLLATE "C"` (required by fractional-indexing keys)
- Migration command: `node dist/db/migrate.js`
- Required extensions: none
- Expected initial size: < 100 MB
- Backup class: daily

## Redis/queue

- Required: no
- Reason: single backend replica; real-time state is held in memory and persisted in PostgreSQL (architecture §12.1)
- Durable: n/a
- Persistence and retry policy: n/a

## Object storage

- Required: no
- Bucket/prefix: n/a
- Data classification: n/a
- Lifecycle: n/a

## Configuration contract

| Variable            | Secret | Required | Scope             | Description                                           |
| ------------------- | -----: | -------: | ----------------- | ----------------------------------------------------- |
| NODE_ENV            |     no |      yes | runtime           | Runtime environment                                   |
| HOST                |     no |      yes | runtime           | Bind address                                          |
| PORT                |     no |      yes | runtime           | API internal port (8080)                              |
| PUBLIC_ORIGIN       |     no |      yes | runtime           | Canonical public origin for cookies and Origin checks |
| PGHOST              |     no |      yes | runtime/migration | PostgreSQL host (`bw-postgres`)                       |
| PGPORT              |     no |      yes | runtime/migration | PostgreSQL port                                       |
| PGDATABASE          |     no |      yes | runtime/migration | Database name (`lists_db`)                            |
| PGUSER              |     no |      yes | runtime/migration | Role (`lists_runtime` or `lists_migrator`)            |
| PGPASSWORD          |    yes |      yes | runtime/migration | Role password                                         |
| SESSION_COOKIE_NAME |     no |      yes | runtime           | Session cookie name                                   |
| CSRF_COOKIE_NAME    |     no |      yes | runtime           | CSRF cookie name                                      |
| SESSION_TTL_HOURS   |     no |      yes | runtime           | Session lifetime in hours                             |
| SESSION_SECRET      |    yes |      yes | runtime           | Secret used to sign the CSRF token                    |
| LOG_LEVEL           |     no |       no | runtime           | Log level (default `info`)                            |

## Health and operations

- Liveness: `/health/live`
- Readiness: `/health/ready`
- Smoke test: `scripts/smoke.sh` (login, create list, add item, receive a WebSocket update)
- Graceful shutdown timeout: 15 s
- Expected RAM: idle ~80 MB / p95 ~200 MB (to be measured)
- Expected CPU: idle low / p95 to be measured
- Log format: JSON (pino) to stdout

## Security

- Registration: invite-only (admin-created accounts)
- Session strategy: opaque session id in a Secure/HttpOnly/SameSite=Lax cookie, persisted in PostgreSQL
- Admin roles: `is_admin` flag; admins create accounts
- Sensitive data: list and item content is private to members; personal data (display names, emails)
- Retention/deletion: account deletion cascades owned lists; list deletion cascades items, memberships, and invitations
- Accepted dependency advisories: see `docs/OPERATIONS.md` (React Router RSC-mode CSRF — not applicable; esbuild dev-server via dev-only drizzle-kit)

## Deploy

- CI workflow: `.github/workflows/ci.yaml`
- Production compose: `deploy/compose.prod.yaml`
- Release identifier: immutable image tag (`1.x.y` and `git-<sha>`)
- Migration order: run the `migrate` job with `lists_migrator` before rolling out `api` and `web`
- Rollback command/process: repoint `APP_VERSION` to the previous tag, re-pull, redeploy
- Database rollback limitation: migrations are forward-only and backward-compatible; a schema rollback requires a restore

## Dependencies

- External services: Cloudflare (DNS/TLS), shared PostgreSQL (bwinkeler-infra), GHCR
- Infrastructure changes required: provision `lists_db` + `lists_runtime` + `lists_migrator`; add the Caddy fragment for `lists.bwinkeler.com`; create DNS; include `lists_db` in daily backup
- Known portability constraints: none; no required PostgreSQL extensions; no object storage

## Open decisions

- Formalize (ADR in `ARCHITECTURE.md`) that each product chooses its own stack and the portfolio is not a technical baseline.
- Confirm the CI integration-test database approach (compose PostgreSQL service vs Testcontainers).
