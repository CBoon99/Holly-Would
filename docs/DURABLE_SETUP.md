# Durable setup (team path: Neon + R2)

Netlify is the **UI**. Durable multi-instance needs shared DB + object storage.

## 1. Cloudflare R2 (or any S3)

1. Create bucket e.g. `holly-would-media`
2. Create API token with Object Read/Write
3. Set on Netlify (and local `.env.local`):

```bash
R2_BUCKET=holly-would-media
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_REGION=auto
```

App uses `getStorage()` → S3 when these are set; otherwise local disk.

## 2. Neon Postgres (next)

Create a **new** project (do **not** reuse Devils Advocates `DATABASE_URL`).

```bash
DATABASE_URL=postgresql://...
```

Postgres client swap is staged after R2 is live. Until then SQLite + stable seed still runs per instance.

## 3. Verify

```bash
# Local with R2
npm run dev --prefix web
# upload a take → object appears in bucket
```

Live: cold open → perform → mix → hard refresh still plays (requires R2 + later Postgres).
