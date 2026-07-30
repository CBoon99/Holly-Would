import { createRequire } from "module";
import { dbPath, ensureDataDirs } from "../paths";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);
// Load via require so Vitest/Vite does not rewrite node:sqlite → sqlite
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec: (sql: string) => void;
    prepare: (sql: string) => {
      get: (...args: unknown[]) => unknown;
      all: (...args: unknown[]) => unknown[];
      run: (...args: unknown[]) => unknown;
    };
    close: () => void;
  };
};

type SqliteDb = InstanceType<typeof DatabaseSync>;

let _sqlite: SqliteDb | null = null;

export function getSqlite(): SqliteDb {
  if (_sqlite) return _sqlite;
  ensureDataDirs();
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  _sqlite = new DatabaseSync(file);
  _sqlite.exec("PRAGMA journal_mode = WAL;");
  _sqlite.exec("PRAGMA foreign_keys = ON;");
  return _sqlite;
}

/** @deprecated alias — use getSqlite */
export function getDb(): SqliteDb {
  return getSqlite();
}

export function resetDbConnection(): void {
  if (_sqlite) {
    try {
      _sqlite.close();
    } catch {
      /* ignore */
    }
    _sqlite = null;
  }
}

export function one<T extends Record<string, unknown>>(
  sql: string,
  params: Array<string | number | null> = []
): T | undefined {
  const stmt = getSqlite().prepare(sql);
  return stmt.get(...params) as T | undefined;
}

export function many<T extends Record<string, unknown>>(
  sql: string,
  params: Array<string | number | null> = []
): T[] {
  const stmt = getSqlite().prepare(sql);
  return stmt.all(...params) as T[];
}

export function run(sql: string, params: Array<string | number | null> = []): void {
  const stmt = getSqlite().prepare(sql);
  stmt.run(...params);
}
