import { LocalObjectStorage } from "./local";
import { isS3Configured, S3ObjectStorage } from "./s3";
import type { ObjectStorage } from "./types";

export type { ObjectStorage, StoredObject } from "./types";
export { isS3Configured } from "./s3";
export { LocalObjectStorage } from "./local";

let _storage: ObjectStorage | null = null;

/**
 * Local filesystem by default (dev + Netlify /tmp).
 * Set R2_BUCKET or S3_BUCKET + access keys for durable multi-instance media.
 */
export function getStorage(): ObjectStorage {
  if (_storage) return _storage;
  if (isS3Configured()) {
    console.log("storage: S3/R2 backend");
    _storage = new S3ObjectStorage();
  } else {
    _storage = new LocalObjectStorage();
  }
  return _storage;
}
