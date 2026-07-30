# Backlog — Acting Platform

## Current

| ID | Title | Status |
|----|-------|--------|
| M0-V1-SPRINT | Phase 0 / V1 vertical slice (audio loop) | **Done (local)** |
| M3 | ElevenLabs adapter (TTS partner generation) | **Done (live TTS seed)** |

## Next (after M0)

| ID | Title | Depends |
|----|-------|---------|
| M1 | Postgres + Redis + S3 docker-compose parity | M0 |
| M2 | NestJS extract + Python media worker | M0 |
| M3 | ElevenLabs adapter (TTS partner generation) | M0 — code landed |
| M4 | Continuous guided mode (Mode B) | M0 |
| M5 | Transcription + timing feedback | M0, M3 |
| M6 | Admin scene editor | M0 |
| M7 | Full rights/territory engine | M0 |
| M8 | Auth (Clerk/Better Auth) + production Railway | M1 |
| M9 | Hardening + e2e Playwright + golden media | M1–M5 |

## Explicitly deferred

- Video insertion (V2)
- Creator marketplace
- Celebrity / film library bulk ingest
