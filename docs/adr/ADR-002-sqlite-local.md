# ADR-002: SQLite for local V1; Postgres target

**Status:** Accepted  
**Date:** 2026-07-29

## Context

PostgreSQL is the production source of truth. Docker/Postgres unavailable on the sprint machine.

## Decision

Use **SQLite via Node’s built-in `node:sqlite` (DatabaseSync)** for local V1. Portable SQL; migration path to Postgres (M1). Avoided better-sqlite3 due to Node 26 native build breakage.

## Consequences

- Zero-ops local development; no native addon compile
- Concurrent write limits acceptable for single-user Phase 0
- Production deploy must switch driver + DATABASE_URL
- Requires Node 22+ (`node:sqlite`)
