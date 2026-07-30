# ADR-001: Modular monolith for V1

**Status:** Accepted  
**Date:** 2026-07-29

## Context

Brief recommends NestJS + Python workers + modular monolith first. One-sprint V1 needs a runnable audio loop without multi-service ops tax (no Docker on build machine).

## Decision

Ship V1 as a **Next.js modular monolith** with clear internal module boundaries (`domain`, `storage`, `media`, `rights`, `providers`). Extract NestJS API and Python media worker in M1–M2 once the loop is proven.

## Consequences

- Faster vertical slice and local one-command dev
- Schema and path layouts still match brief (S3 keys, manifests, rights records)
- Must not hard-couple UI to DB; keep server modules testable
