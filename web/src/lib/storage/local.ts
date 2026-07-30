import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ensureDataDirs, storageRoot } from "../paths";

export type StoredObject = {
  objectKey: string;
  absolutePath: string;
  sizeBytes: number;
  checksumSha256: string;
};

/** S3-shaped local storage. Masters are never overwritten in place. */
export class LocalObjectStorage {
  constructor(private root = storageRoot()) {
    ensureDataDirs();
  }

  resolve(objectKey: string): string {
    const clean = objectKey.replace(/^\/+/, "");
    const full = path.join(this.root, clean);
    if (!full.startsWith(this.root)) {
      throw new Error("Invalid object key");
    }
    return full;
  }

  exists(objectKey: string): boolean {
    return fs.existsSync(this.resolve(objectKey));
  }

  async putBytes(
    objectKey: string,
    data: Buffer,
    opts?: { overwrite?: boolean }
  ): Promise<StoredObject> {
    const full = this.resolve(objectKey);
    if (fs.existsSync(full) && !opts?.overwrite) {
      throw new Error(`Immutable master exists: ${objectKey}`);
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data);
    const checksumSha256 = crypto.createHash("sha256").update(data).digest("hex");
    return {
      objectKey,
      absolutePath: full,
      sizeBytes: data.length,
      checksumSha256,
    };
  }

  async putFile(
    objectKey: string,
    sourcePath: string,
    opts?: { overwrite?: boolean }
  ): Promise<StoredObject> {
    const data = fs.readFileSync(sourcePath);
    return this.putBytes(objectKey, data, opts);
  }

  read(objectKey: string): Buffer {
    return fs.readFileSync(this.resolve(objectKey));
  }

  openReadStream(objectKey: string): fs.ReadStream {
    return fs.createReadStream(this.resolve(objectKey));
  }

  /** New unique key under masters/ or derivatives/ */
  masterKey(parts: string[]): string {
    return path.posix.join("masters", ...parts);
  }

  derivativeKey(parts: string[]): string {
    return path.posix.join("derivatives", ...parts);
  }

  tempKey(parts: string[]): string {
    return path.posix.join("temp", ...parts);
  }
}

export const storage = new LocalObjectStorage();
