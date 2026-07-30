# ADR 0001: Technology stack and product independence

- Status: accepted
- Date: 2026-07-30

## Context

Listly is a real-time collaborative lists application under the
bwinkeler.com platform. The platform architecture (`BW-PLATFORM-ARCH-001`) is
stack-agnostic and requires self-hosting, portability, single-replica operation
without Redis, and PostgreSQL as the source of truth. The v1 requirements
(`BW-LISTS-REQ-001`) deliberately choose last-write-wins concurrency, online-only
operation, and exclude offline/CRDT and object storage.

## Decision

Adopt a TypeScript monorepo (npm workspaces):

- Backend: Fastify v5 + native WebSocket (`@fastify/websocket`).
- Frontend: React + Vite single-page application.
- Database: PostgreSQL via Drizzle ORM with drizzle-kit migrations; no required
  extensions (emails are lowercase-normalized; UUIDs are generated in the app).
- Shared: a `shared` package with Zod schemas for DTOs and the WebSocket
  protocol, shared by backend and frontend.
- Tests: Vitest and Playwright.

Each product on the platform chooses its own stack. The `bwinkeler-portfolio`
project is standalone and is **not** a technical baseline or reference for this
or other applications (consistent with platform ADR 002 and §4.4).

## Alternatives considered

- Elixir/Phoenix: best-in-class real-time, but introduces a new language and
  paradigm for a solo developer and diverges from the SPA ecosystem; its scale
  advantage is unused at family scale.
- Local-first / CRDT / sync frameworks (Yjs, ElectricSQL, Replicache, Zero,
  Convex, Liveblocks, PartyKit): either hosted (vendor lock-in versus
  self-hosting and portability) or exceed the deliberate v1 scope.
- Go backend: leaner memory but loses shared TypeScript contracts; efficiency is
  not decisive below 50 users.
- Svelte/SolidJS frontend: leaner but lateral; React chosen for its ecosystem and
  accessibility support.

## Consequences

- One language across the stack, with shared and type-checked contracts for the
  real-time protocol.
- Real-time convergence is handled by a single serialized per-list arbiter that
  persists and then broadcasts.
- Adding a second replica later requires introducing a bus (architecture §12.5).
