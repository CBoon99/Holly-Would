import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import type { ObjectStorage, StoredObject } from "./types";

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

/** R2 / S3 when S3_BUCKET (or R2_BUCKET) is set. */
export function isS3Configured(): boolean {
  return Boolean(
    (env("S3_BUCKET") || env("R2_BUCKET")) &&
      (env("AWS_ACCESS_KEY_ID") || env("R2_ACCESS_KEY_ID")) &&
      (env("AWS_SECRET_ACCESS_KEY") || env("R2_SECRET_ACCESS_KEY"))
  );
}

export class S3ObjectStorage implements ObjectStorage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const bucket = env("S3_BUCKET") || env("R2_BUCKET");
    if (!bucket) throw new Error("S3_BUCKET or R2_BUCKET required");
    this.bucket = bucket;

    const endpoint = env("S3_ENDPOINT") || env("R2_ENDPOINT");
    const region = env("S3_REGION") || env("R2_REGION") || "auto";
    const accessKeyId = env("AWS_ACCESS_KEY_ID") || env("R2_ACCESS_KEY_ID")!;
    const secretAccessKey =
      env("AWS_SECRET_ACCESS_KEY") || env("R2_SECRET_ACCESS_KEY")!;

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId, secretAccessKey },
    });
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
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey })
      );
      return true;
    } catch {
      return false;
    }
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
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: data,
        ContentType: "application/octet-stream",
        ChecksumSHA256: Buffer.from(checksumSha256, "hex").toString("base64"),
      })
    );
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
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey })
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Empty object: ${objectKey}`);
    return Buffer.from(bytes);
  }

  async materialize(objectKey: string): Promise<string> {
    const buf = await this.read(objectKey);
    const ext = path.extname(objectKey) || ".bin";
    const tmp = path.join(
      os.tmpdir(),
      `hw-${crypto.createHash("sha1").update(objectKey).digest("hex").slice(0, 12)}${ext}`
    );
    fs.writeFileSync(tmp, buf);
    return tmp;
  }
}
