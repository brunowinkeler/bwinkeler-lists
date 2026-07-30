# AGENTS

Before changing this repository, read, in order:

1. `docs/PLATFORM_ARCHITECTURE.md` — platform contract (`BW-PLATFORM-ARCH-001`).
2. `docs/REQUIREMENTS.md` — product requirements baseline (`BW-LISTS-REQ-001`).
3. `docs/SERVICE_MANIFEST.md` — this service's operational contract.

Rules:

- Scope changes to this repository (`service_id: lists`). Shared infrastructure
  (Caddy, production PostgreSQL, global networks, backups) belongs to
  `bwinkeler-infra` and must be proposed there separately.
- All code, identifiers, and documentation are in English.
- Do not commit secrets. Do not publish host ports in the production compose.
- Own the database schema through versioned migrations only.
