import { nanoid } from "nanoid";

export function id(prefix?: string): string {
  const n = nanoid(12);
  return prefix ? `${prefix}_${n}` : n;
}

export function nowIso(): string {
  return new Date().toISOString();
}
