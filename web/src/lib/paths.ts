import path from "path";
import fs from "fs";

/** True on Netlify / Lambda-style hosts (ephemeral disk, no durable volume). */
export function isServerlessHost(): boolean {
  return Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_DEV === "true" ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.LAMBDA_TASK_ROOT ||
      // Netlify Next runtime often sets these without NETLIFY=true
      process.env.URL?.includes("netlify.app") ||
      process.env.DEPLOY_URL?.includes("netlify.app") ||
      process.env.CONTEXT === "production" ||
      process.env.CONTEXT === "deploy-preview"
  );
}

/** Railway (or other long-lived hosts) — prefer DATA_DIR volume when set. */
export function isRailwayHost(): boolean {
  return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
}

/** Monorepo / package root for seed JSON. */
export function projectRoot(): string {
  if (process.env.PROJECT_ROOT) {
    return path.resolve(process.env.PROJECT_ROOT);
  }
  // Prefer package-local content/ (works on Netlify with base=web)
  if (fs.existsSync(path.join(process.cwd(), "content/seed"))) {
    return process.cwd();
  }
  // monorepo root (local: web/../)
  const up = path.resolve(process.cwd(), "..");
  if (fs.existsSync(path.join(up, "content/seed"))) return up;
  if (fs.existsSync(path.join(up, "web/content/seed"))) return path.join(up, "web");
  return process.cwd();
}

export function dataDir(): string {
  // Explicit DATA_DIR always wins (Railway volume → /data)
  if (process.env.DATA_DIR) {
    return path.isAbsolute(process.env.DATA_DIR)
      ? process.env.DATA_DIR
      : path.resolve(process.cwd(), process.env.DATA_DIR);
  }
  if (isServerlessHost()) {
    return "/tmp/holly-would-data";
  }
  if (isRailwayHost()) {
    return "/data";
  }
  return path.join(projectRoot(), ".data");
}

export function storageRoot(): string {
  return path.join(dataDir(), "storage");
}

export function dbPath(): string {
  return path.join(dataDir(), "acting.db");
}

export function ensureDataDirs(): void {
  for (const p of [
    dataDir(),
    storageRoot(),
    path.join(storageRoot(), "masters"),
    path.join(storageRoot(), "derivatives"),
    path.join(storageRoot(), "temp"),
  ]) {
    fs.mkdirSync(p, { recursive: true });
  }
}
