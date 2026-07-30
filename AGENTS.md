# AGENTS.md — Acting Platform

Read first:

1. `PROJECT_AGENT_PROFILE.md` (every mission)
2. `AGENT_STANDARDS.md` via global memory
3. Relevant pots from profile (product brief sections only when needed)

## Commands

| Command | Intent |
|---------|--------|
| `npm run dev` | Full local stack (web+API) |
| `npm run verify` | Typecheck + unit tests |
| `npm run db:seed` | Seed original scene + rights |
| `npm run db:push` | Apply schema |

## Rules (summary)

- No third-party AI outside provider adapters
- No permanent media on ephemeral disk only — use `.data/storage` with S3-shaped keys
- No publish without rights decision
- No long media work blocking request without job status
- Evidence for done claims
- Do not bulk-ingest films in Phase 0

## Current mission

See `missions/BACKLOG.md` and `missions/M0-V1-SPRINT/`.
