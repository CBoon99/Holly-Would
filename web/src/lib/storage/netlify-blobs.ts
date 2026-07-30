/**
 * Netlify Blobs backend — durable across function instances without R2 keys.
 * Requires Netlify production/deploy context (site store available).
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getStore } from "@netlify/blobs";
import type { ObjectStorage, StoredObject } from "./types";

const STORE_NAME = "holly-would-media";

export function isNetlifyBlobsAvailable(): boolean {
  // Real Netlify runtime only (not local, not Railway)
  return Boolean(process.env.NETLIFY === "true" || process.env.NETLIFY === "1");
}

export class NetlifyBlobsStorage implements ObjectStorage {
  private store() {
    // site-scoped store — shared across deploys/instances
    return getStore({ name: STORE_NAME, consistency: "strong" });
  }

  masterKey(parts: string[]): string {
    return path.posix.join("masters", ...parts);
  }
  derivativeKey(parts: string[]): string {
    return path.posix.join("derivatives", ...parts);
  }
  tempKey(parts: string[]): string {
    return path.posix.join("temp", ...parts);
  }

  async exists(objectKey: string): Promise<boolean> {
    const meta = await this.store().getMetadata(objectKey);
    return Boolean(meta);
  }

  async putBytes(
    objectKey: string,
    data: Buffer,
    opts?: { overwrite?: boolean }
  ): Promise<StoredObject> {
    if (!opts?.overwrite && (await this.exists(objectKey))) {
      throw new Error(`Immutable master exists: ${objectKey}`);
    }
    const checksumSha256 = crypto.createHash("sha256").update(data).digest("hex");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.store().set(objectKey, data as any, {
      metadata: { checksumSha256, sizeBytes: String(data.length) },
    });
    return { objectKey, sizeBytes: data.length, checksumSha256 };
  }

  async putFile(
    objectKey: string,
    sourcePath: string,
    opts?: { overwrite?: boolean }
  ): Promise<StoredObject> {
    return this.putBytes(objectKey, fs.readFileSync(sourcePath), opts);
  }

  async read(objectKey: string): Promise<Buffer> {
    const data = await this.store().get(objectKey, { type: "arrayBuffer" });
    if (!data) throw new Error(`Missing object: ${objectKey}`);
    return Buffer.from(data);
  }

  async materialize(objectKey: string): Promise<string> {
    const buf = await this.read(objectKey);
    const ext = path.extname(objectKey) || ".bin";
    const tmp = path.join(
      os.tmpdir(),
      `hw-blob-${crypto.createHash("sha1").update(objectKey).digest("hex").slice(0, 12)}${ext}`
    );
    fs.writeFileSync(tmp, buf);
    return tmp;
  }
}
