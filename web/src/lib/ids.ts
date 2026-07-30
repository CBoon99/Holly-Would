import { createHash } from "crypto";
import { nanoid } from "nanoid";

export function id(prefix?: string): string {
  const n = nanoid(12);
  return prefix ? `${prefix}_${n}` : n;
}

/**
 * Deterministic IDs so every Netlify function instance seeds the same catalogue keys.
 * Random nanoids broke “click scene” when /tmp DB was empty on another instance.
 */
export function stableId(prefix: string, ...parts: Array<string | number>): string {
  const raw = parts
    .map((p) =>
      String(p)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    )
    .filter(Boolean)
    .join("__");
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 12);
  return `${prefix}_${hash}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
