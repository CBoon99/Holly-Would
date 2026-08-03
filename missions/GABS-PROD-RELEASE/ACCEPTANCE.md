# Acceptance — GABS-PROD-RELEASE

**Verdict:** **ACCEPT for production smoke** (2026-08-03)

## Roles

| Role | Who |
|------|-----|
| Builder | Primary agent session |
| Independent tester | Subagent `019fc761-6551-79e0-909f-f07b5eb3b8d1` (requirement-first) |
| Release authority | Human requested full team deployment |

## Green gate

| Check | Result |
|-------|--------|
| `npm run verify` (typecheck + vitest 10) | PASS — see `evidence/verify.txt` |
| `npm run build` | PASS |
| Restore tag | `gabs-release-2026-08-03` |

## Deploy

| Check | Result |
|-------|--------|
| Railway `holly-would` / `production` / `holly-would-web` | SUCCESS `7df9beb1` |
| URL | https://holly-would-web-production.up.railway.app |
| Volume | `/data` |
| ffmpeg in image | Present (Dockerfile) |

## Independent smoke R1–R10

All **PASS**. Full table in independent tester output. Summary:

- Home 200 + title  
- 53 published scenes (≥25)  
- Sessions + manifest lines  
- Partner `partnerAudioUrl` present on sampled scenes  
- Media play `audio/wav` multi-100kB+  
- Bootstrap `dataDir=/data`  
- 26 PD film scenes  
- Rights approved on available catalogue  

## Known residual risks (not smoke blockers)

1. Real iPhone UX not lab-tested by agents  
2. Transient media 502 once (retest OK)  
3. Auth / Redis / S3 / Sentry unconfigured  
4. Licensed star voices not shipped (by design)  
5. PD 30s clips may share archival source material across titles  

## Product URL

**https://holly-would-web-production.up.railway.app**
