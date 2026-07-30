import fs from "fs";
import path from "path";
import { projectRoot } from "./paths";

/**
 * Load .env / .env.local from app and monorepo roots.
 * Never log secret values.
 */
export function loadEnvFiles(): string[] {
  const loaded: string[] = [];
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(projectRoot(), "apps/web/.env.local"),
    path.join(projectRoot(), "apps/web/.env"),
    path.join(projectRoot(), ".env.local"),
    path.join(projectRoot(), ".env"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
    loaded.push(p);
  }
  return loaded;
}

export type ServiceStatus = {
  name: string;
  configured: boolean;
  hint: string;
};

/** Report which automation tokens are present (no secret values). */
export function serviceInventory(): ServiceStatus[] {
  const has = (k: string) => Boolean(process.env[k]?.trim());
  return [
    {
      name: "elevenlabs_tts",
      configured: has("ELEVENLABS_API_KEY"),
      hint: "ELEVENLABS_API_KEY (+ optional ELEVENLABS_VOICE_ID)",
    },
    {
      name: "elevenlabs_stt",
      configured: has("ELEVENLABS_API_KEY"),
      hint: "Same key; needs speech_to_text permission if restricted",
    },
    {
      name: "openai_whisper",
      configured: has("OPENAI_API_KEY"),
      hint: "OPENAI_API_KEY — Whisper STT",
    },
    {
      name: "deepgram",
      configured: has("DEEPGRAM_API_KEY"),
      hint: "DEEPGRAM_API_KEY — primary STT (auto)",
    },
    {
      name: "database",
      configured: has("DATABASE_URL") || true,
      hint: "DATABASE_URL (Postgres later); SQLite local default",
    },
    {
      name: "redis",
      configured: has("REDIS_URL"),
      hint: "REDIS_URL for job queue at scale",
    },
    {
      name: "object_storage",
      configured:
        has("S3_ENDPOINT") || has("R2_ACCOUNT_ID") || has("AWS_ACCESS_KEY_ID"),
      hint: "S3_ENDPOINT + keys, or R2_*, or AWS_*",
    },
    {
      name: "sentry",
      configured: has("SENTRY_DSN"),
      hint: "SENTRY_DSN",
    },
    {
      name: "railway",
      configured: has("RAILWAY_TOKEN") || has("RAILWAY_API_TOKEN"),
      hint: "RAILWAY_TOKEN for deploy automation",
    },
    {
      name: "auth",
      configured: has("CLERK_SECRET_KEY") || has("BETTER_AUTH_SECRET"),
      hint: "CLERK_* or BETTER_AUTH_SECRET",
    },
  ];
}
