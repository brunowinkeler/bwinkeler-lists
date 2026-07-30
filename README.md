# BWinkeler Lists

Collaborative shared-lists application (`service_id: lists`) for the bwinkeler.com
platform. Users create task and simple lists, share them with others as Owner or
Editor, and see changes in real time.

## Documentation

- Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (`BW-LISTS-REQ-001`)
- Platform architecture: `docs/PLATFORM_ARCHITECTURE.md` (`BW-PLATFORM-ARCH-001`)
- Service manifest: `docs/SERVICE_MANIFEST.md`
- Operations: `docs/OPERATIONS.md`

## Stack

TypeScript monorepo (npm workspaces): Fastify + native WebSocket (backend),
React + Vite (frontend), PostgreSQL + Drizzle, Vitest + Playwright.

## Workspaces

- `shared/` — shared types and Zod contracts (DTOs and the WebSocket protocol)
- `backend/` — Fastify HTTP API and real-time server
- `frontend/` — React single-page application

## Development

Requires Node >= 22.12 and Docker (for local PostgreSQL).

```sh
npm install
npm run validate
```

See `docs/OPERATIONS.md` for the full development and deployment workflow.
