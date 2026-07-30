import path from "path";
import fs from "fs";

/** True on Netlify / Lambda-style hosts (ephemeral disk). */
export function isServerlessHost(): boolean {
  return Boolean(
    process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY_DEV === "true"
  );
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
  if (isServerlessHost()) {
    return process.env.DATA_DIR || "/tmp/holly-would-data";
  }
  const raw = process.env.DATA_DIR || path.join(projectRoot(), ".data");
  // when projectRoot is web/, .data lives at monorepo or web
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), raw);
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
