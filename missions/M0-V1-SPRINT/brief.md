# Mission M0-V1-SPRINT — Build Phase 0 / V1 vertical slice

**Risk class:** L2  
**Authority:** Local write (B); no production deploy  
**Owner:** Builder agent  
**Date:** 2026-07-29

## Goal

Deliver a runnable **audio-first V1** that proves the product loop:

> User selects one original scene and one playable role, performs line-by-line against partner audio, and hears a coherent mixed scene of their takes + partner lines.

## In scope

1. Monorepo foundation (Next.js web+API modular monolith, SQLite for zero-Docker local, file storage abstraction)
2. Scene domain: Film → Edition → Scene → Character → Dialogue → Timeline → seed package
3. Performance session: line-by-line mode, countdown, mic record, upload stems
4. Media pipeline: validate → store immutable masters → FFmpeg mix → playback URL
5. Review screen: play mix, retake all, delete take
6. One original two-person seed scene (~60–90s, 6–10 exchanges)
7. Provider interface stub for TTS (pre-baked partner audio for V1; no live ElevenLabs required)
8. Rights decision record on seed (platform-original / approved)
9. One-command local dev + verify script
10. WORKING.md, AGENTS.md, ADRs, evidence packet

## Out of scope (explicit)

- Railway production deploy
- Live ElevenLabs generation
- Adaptive endpoint detection (Mode C)
- Payments, public share, social feed
- Video capture / insertion
- Bulk film ingest / public-domain library
- Full multi-tenant education accounts
- Territory engine beyond seed “worldwide original”

## Done means (Phase 0 acceptance)

| # | Criterion |
|---|-----------|
| 1 | `npm run dev` starts the app |
| 2 | Seed scene visible without inventing permissions |
| 3 | Line-by-line: partner plays, user records each line |
| 4 | Stems stored as immutable originals under object storage path |
| 5 | Mix job produces AAC/WAV playback of partner + user |
| 6 | User can hear completed mix and start another take |
| 7 | No secrets committed; `.env.example` present |
| 8 | `npm run verify` typechecks and runs unit tests |

## Evidence required

- `missions/M0-V1-SPRINT/evidence/` with command outputs
- Claim labels on verification summary

## Stack (sprint pragmatism)

| Layer | Choice | Note |
|-------|--------|------|
| App | Next.js 15 App Router + TypeScript + Tailwind | Modular monolith; NestJS split deferred until module boundaries proven |
| DB | SQLite (better-sqlite3) + Drizzle | Same schema designed for Postgres; docker-compose postgres optional |
| Queue | In-process job runner | Redis/BullMQ when multi-worker needed |
| Storage | Local `./.data/storage` S3-shaped paths | R2/S3 adapter interface ready |
| Media | FFmpeg CLI | Required for server mix |
| Auth | Dev session (local user) | Production auth via ADR later |

## Non-negotiables observed

Audio-first video-ready models · rights on publish · provider adapters · immutable masters · async mix · no bulk film ingest · evidence-backed done
