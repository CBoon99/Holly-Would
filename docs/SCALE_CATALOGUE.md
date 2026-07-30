# Scaling Holly Would to thousands of scenes

**Product truth:** One scene was Phase 0 proof. The product is a **library** — eventually **thousands** of original, rights-safe two-handers. Not one demo. Not a joke shelf.

## Rules (non-negotiable)

1. **Platform-original dialogue only** — never licensed film scripts  
2. **No franchise character names** in public catalogue  
3. **Both roles playable**  
4. **Rights decision** before “published”  
5. **Partner audio** generated in **batch jobs**, not by wiping the whole library on cold start  

## Architecture for 1k → 10k+

| Layer | Now | Scale |
|--------|-----|--------|
| Scene source | `hollywood-catalogue.json` + `batches/*.json` | Many batch files + admin CMS later |
| Seed | `seed-hollywood.ts` loads all batches | `SEED_LIMIT` for fast deploys; full seed offline |
| DB | SQLite on Railway volume | Postgres catalogue index for multi-instance |
| Audio | TTS chain (EL → OpenAI → espeak) | Pre-bake partner WAV to R2/volume by slug |
| Discovery | Filters + search | Tags, collections, skill paths, “daily 10” |

## Milestones

| Target | How |
|--------|-----|
| **~180** | Handcrafted (~21) + factory batch-001 (**160**) — **this PR** |
| **1,000** | Factory batches 002–010 + human QA sample 5–10% |
| **10,000** | Template engine + optional LLM polish under rights review; on-demand TTS |

## Commands

```bash
# How many scene records in seed JSON
npm run catalogue:stats --prefix web

# Fast seed (40 scenes) for smoke
npm run db:seed:hollywood:fast --prefix web

# Full catalogue seed (espeak/OpenAI — can take a while)
npm run db:seed:hollywood:full --prefix web
```

## Railway

- Volume `/data` holds DB + media  
- Prefer **full seed once**, then ship app deploys without `force` wipe  
- `SEED_LIMIT=80` on boot if cold start must be fast; run full seed as one-off  

## Not the path

- Bulk ingest of real movie scripts  
- One perfect scene forever  
- Reseeding thousands of TTS lines on every deploy  

## Factory quality

Batch-001 uses **structured original beats** (conflict → push → need). Later batches raise dialogue variety; human edit pass for “hero” scenes used in marketing.
