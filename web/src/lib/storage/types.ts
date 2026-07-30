/** S3-shaped object storage — local, R2, or S3. Masters never overwritten. */

export type StoredObject = {
  objectKey: string;
  /** Absolute path only when backend is local/materialized */
  absolutePath?: string;
  sizeBytes: number;
  checksumSha256: string;
};

export interface ObjectStorage {
  exists(objectKey: string): Promise<boolean> | boolean;
  putBytes(
    objectKey: string,
    data: Buffer,
    opts?: { overwrite?: boolean }
  ): Promise<StoredObject>;
  putFile(
    objectKey: string,
    sourcePath: string,
    opts?: { overwrite?: boolean }
  ): Promise<StoredObject>;
  read(objectKey: string): Promise<Buffer> | Buffer;
  /** Local path usable by FFmpeg (downloads to temp if remote). */
  materialize(objectKey: string): Promise<string>;
  masterKey(parts: string[]): string;
  derivativeKey(parts: string[]): string;
  tempKey(parts: string[]): string;
}
