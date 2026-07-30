import { LocalObjectStorage } from "./local";
import { isS3Configured, S3ObjectStorage } from "./s3";
import {
  isNetlifyBlobsAvailable,
  NetlifyBlobsStorage,
} from "./netlify-blobs";
import type { ObjectStorage } from "./types";

export type { ObjectStorage, StoredObject } from "./types";
export { isS3Configured } from "./s3";
export { LocalObjectStorage } from "./local";

let _storage: ObjectStorage | null = null;

/**
 * Backend priority:
 * 1. S3/R2 if bucket keys set
 * 2. Netlify Blobs on Netlify (durable, no external keys)
 * 3. Local disk (dev / Railway volume via DATA_DIR)
 */
export function getStorage(): ObjectStorage {
  if (_storage) return _storage;
  if (isS3Configured()) {
    console.log("storage: S3/R2");
    _storage = new S3ObjectStorage();
  } else if (isNetlifyBlobsAvailable() && process.env.STORAGE_BACKEND !== "local") {
    try {
      console.log("storage: Netlify Blobs");
      _storage = new NetlifyBlobsStorage();
    } catch (e) {
      console.warn("Netlify Blobs unavailable, falling back to local", e);
      _storage = new LocalObjectStorage();
    }
  } else {
    _storage = new LocalObjectStorage();
  }
  return _storage;
}
