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

/** Project root: monorepo root (content/seed, etc.) */
export function projectRoot(): string {
  // On Netlify, cwd is apps/web during functions; monorepo root is one up or process.cwd
  if (process.env.PROJECT_ROOT) {
    return path.resolve(process.env.PROJECT_ROOT);
  }
  // Prefer apps/web/../.. when running from apps/web
  const candidate = path.resolve(process.cwd(), "../..");
  if (fs.existsSync(path.join(candidate, "content"))) return candidate;
  if (fs.existsSync(path.join(process.cwd(), "content"))) return process.cwd();
  return path.resolve(process.cwd(), "../..");
}

export function dataDir(): string {
  // Serverless: always /tmp (writable)
  if (isServerlessHost()) {
    return process.env.DATA_DIR || "/tmp/holly-would-data";
  }
  const raw = process.env.DATA_DIR || path.join(projectRoot(), ".data");
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
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
