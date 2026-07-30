# Listly

Listly is a collaborative shared-lists application (`service_id: lists`) for the
bwinkeler.com platform. Users create task and simple lists, organize items into
categories, reorder by drag-and-drop, share lists with others as Owner or Editor,
and see changes in real time.

## Features

- **Task** and **simple** list kinds (task items add due date, assignee, and notes).
- **Categories** per list, with colors and drag-and-drop reordering; an
  "Uncategorized" group always stays at the bottom.
- **Drag-and-drop** to reorder items and to move them between categories.
- **Duplicate** a list, optionally excluding or resetting completed items.
- **Pin** lists to keep them at the top of your overview.
- **Sharing** with Owner/Editor roles via invite-by-email, with acceptance.
- **In-app notifications** for invitations and task assignments.
- **Real-time** sync over WebSocket, with reconnection and full resync.
- **Light and dark** themes.

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
