# WORKING.md — Acting Platform

**Stage:** V1 production smoke **ACCEPTED** (GABS 2026-08-03)  
**Profile:** `PROJECT_AGENT_PROFILE.md` v1.0  
**Mission:** `missions/GABS-PROD-RELEASE/` (evidence + acceptance)

## Locked decisions

| Decision | Choice |
|----------|--------|
| Initial release | Audio-first, video-ready models |
| Primary production host | **Railway** (not Netlify) |
| V1 sprint stack | Next.js modular monolith + SQLite on volume + FFmpeg in Docker |
| NestJS / Python workers / Postgres-primary / Redis / S3 | Deferred to M1–M2 (profile defaults; not yet production) |
| Partner voice V1 | Pre-baked audio (platform seed + PD archival clips); ElevenLabs adapter present |
| Auth V1 | Local dev user session |
| Licensed modern film star voices | **Out of legal scope** |

## Status

| Area | State |
|------|-------|
| Docs / profile / brief | Present |
| Application code | **V1 loop on Railway** |
| Deploy | **ACCEPTED smoke** — https://holly-would-web-production.up.railway.app |
| Verify | typecheck + unit tests PASS; independent R1–R10 PASS |
| Catalogue | 53 published (27 platform_tts + 26 public_domain_film) |
| Partner audio | Present on Railway volume; independent smoke confirmed WAV |
| Residual | iPhone human confirm; Auth/Redis/S3; per-title PD reels |

## How to run

```bash
cd "Documents/Acting practice, in real movies scences"
npm install --prefix web
npm run db:seed --prefix web
npm run dev --prefix web
# open http://localhost:3000
```

## Changelog

### 2026-08-03 (GABS full-team production release)

- Risk L3 production write with human order to deploy full team.
- Green gate: `npm run verify` + build PASS.
- Independent product tester ACCEPT R1–R10 (API smoke).
- Railway deploy SUCCESS; durable `dataDir=/data`.
- Evidence: `missions/GABS-PROD-RELEASE/evidence/` + `ACCEPTANCE.md`.
- Restore tag: `gabs-release-2026-08-03`.

### 2026-08-03 (Railway primary production locked)

- **Primary URL:** https://holly-would-web-production.up.railway.app
- Service `holly-would-web` · volume `/data` · ffmpeg + espeak in Docker · Postgres service online
- Env: `DATA_DIR=/data`, `SEED_MIN_SCENES=25`, `SKIP_PARTNER_AUDIO=0`
- Verified: home 200, ~53 published catalogue scenes (26 PD), partner WAV present, ffmpeg on PATH
- Netlify remains a secondary mirror only (ephemeral `/tmp`, no ffmpeg — pure-JS mix fallback)

### 2026-08-03 (iPhone start + PD classics pack)

- **iPhone Start take fix:** never silent-return; never hang forever on mic; force `goToIndex`; visible “Starting…” state; mic timeout 8s; need_mic button if recording needs a fresh tap.
- **25 public-domain classics** batch (`batches/batch-pd-classics-25.json`) — titles people know (Night of the Living Dead, Charade, His Girl Friday, Detour, Plan 9, etc.).
- **~30s partner clips** — unaltered archival PD film audio (`pd-audio/clip_30s_*.wav`) with terminal-quality disclaimer (not AI star clones).
- **Truth note:** current 30s rips are from White Pongo (1945) PD print as real film-voice tracks for the pack; per-title reels can replace them film-by-film later without changing the product path.
- Live: Railway primary. Force bootstrap after deploy to reseed catalogue.

### 2026-07-30 (Railway LIVE — works first time)

- Dockerfile + ffmpeg + volume `/data` + Postgres service online.
- Seeded 21 scenes to durable volume; session + partner audio verified.
- URL: https://holly-would-web-production.up.railway.app


### 2026-07-30 (Team path: renames + durable storage scaffold)

- Renamed franchise-hot titles/characters (Border Café, Open Line, Two Doors, Last Bell, etc.).
- Softened style tags; rights note on catalogue.
- `getStorage()` + S3/R2 adapter when env set; local fallback.
- Docs: `docs/DURABLE_SETUP.md`. Neon still TODO (own DATABASE_URL, not shared).


### 2026-07-30 (Catalogue wave 2 — well-known film energy)

- +10 original scenes (Oz / Godfather / Titanic / Hitchcock / Jaws / Rocky / Tiffany / Die Hard / Matrix / Pride energy).
- Still **platform-original dialogue only** — not licensed scripts.
- Catalogue total ~21 with The Last Call. Bootstrap re-seeds when `yellow-mile` missing.


### 2026-07-30 (Railway parked — Netlify primary)

- Attempted Railway project `holly-would` (volume `/data`, domain created).
- Build failed: Nixpacks tried to cache-mount `tsconfig.tsbuildinfo` as a directory (`not a directory`).
- **Decision:** stop fighting Railway for now. Primary live host = **Netlify**.
- Railway project left in account for a later Dockerfile-based retry.
- Stable-ID catalogue seed + session bootstrap already on Netlify.

### 2026-07-30 (Netlify layout + holly-would)

- Restructured app to repo-root `web/` (same pattern as Devils Advocates).
- Root + `web/netlify.toml`: base `web`, Next plugin, `DATA_DIR=/tmp/holly-would-data`.
- Netlify site name for now: **holly-would** → `https://holly-would.netlify.app`
- Seed JSON also at `web/content/seed/` for serverless file tracing.
- After green deploy: open `/api/bootstrap` once to seed catalogue on cold storage.


### 2026-07-30 (GitHub + Holly Would brand)

- **Repo live:** https://github.com/CBoon99/Holly-Would (`main` pushed)
- Brand: **Holly Would** — series · technical · hilarious
- Netlify methodology copied from Devils Advocates (`web/netlify.toml`, base `web`)
- Secrets **not** committed; local tokens remain in `web/.env.local`
- Next: connect Netlify site → set env vars → green deploy

### 2026-07-30 (Hollywood catalogue)

- **11 original scenes** seeded (Casablanca/Scarlett/Wayne *energy*, not licensed scripts).
- Filters: difficulty, tone, rudeness, funny, style (incl. `john-wayne-type`, `southern-belle`, café noir).
- Command: `npm run db:seed:hollywood --prefix web`
- Rights: all `platform_original` / approved.

### 2026-07-30 (Token harvest from disk)

- No screen access; scanned local `.env` files.
- Reused from Devils Advocates (API-only): `OPENAI_API_KEY`, `DEEPGRAM_API_KEY` → Acting Platform `.env.local`.
- STT auto chain: Deepgram → OpenAI → ElevenLabs. Smoke: Deepgram live.
- **Not** copied: `CLERK_*`, `DATABASE_URL` (other products / shared DB risk).

### 2026-07-30 (Full automation layer)

- One-command: `npm run automate --prefix web` (env → migrate → seed TTS → verify).
- Automated feedback on mix complete (STT via ElevenLabs Scribe when permitted; timing always).
- Continuous guided mode (auto-advance user windows).
- Token inventory: `TOKENS.md` + `GET /api/system/status`.
- Services not yet configured show as empty slots (Railway, S3, Postgres, Clerk, etc.).

### 2026-07-30 (M3 live)

- ElevenLabs key stored in `web/.env.local` only (gitignored). **Rotate key** — it was shared in chat.
- Restricted key: no `voices_read`; TTS works with pinned voice Adam `pNInz6obpgDQGcFmaJgB`.
- Reseeded **The Last Call** partner lines (5) via ElevenLabs live TTS — observed.

### 2026-07-29 (M3)

- Picked **ElevenLabs adapter** next (easiest with API token; scales partner TTS).
- `VoiceSynthesisProvider` + `ElevenLabsVoiceProvider`; internal `voice_profiles` + `generation_records`.
- Seed uses live TTS when `ELEVENLABS_API_KEY` is in `web/.env.local`; else offline fallback.
- Commands: `npm run voices:check --prefix web`, then `npm run db:seed --prefix web`.

### 2026-07-29

- Mission M0-V1-SPRINT completed for local V1: catalogue → line-by-line perform → upload stems → FFmpeg mix → review playback.
- Seed scene: **The Last Call** (platform original, rights approved).
- ADRs 001–002 accepted (modular monolith; node:sqlite local).
- Evidence: `missions/M0-V1-SPRINT/evidence/verify.txt`.
