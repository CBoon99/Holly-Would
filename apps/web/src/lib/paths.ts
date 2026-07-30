import path from "path";
import fs from "fs";

/** Project root: Documents/Acting practice, in real movies scences */
export function projectRoot(): string {
  // apps/web -> monorepo root
  return path.resolve(process.cwd(), process.env.PROJECT_ROOT || "../..");
}

export function dataDir(): string {
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
