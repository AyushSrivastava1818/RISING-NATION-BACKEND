/**
 * Object Storage — ENGINEERING.md §6.4 (File / Media Security).
 *
 * Signed-upload flow: backend validates + issues a short-TTL signed PUT URL,
 * the client uploads bytes directly to storage, then a confirm step HEADs the
 * object to verify it landed before any DB row is persisted. The backend never
 * handles file bytes.
 *
 * The client's declared filename is never used as the storage path — the
 * object_key is backend-generated (UUID-based) to prevent path traversal and
 * avoid persisting original filenames.
 *
 * Signing uses the official AWS SDK (@aws-sdk/client-s3 +
 * @aws-sdk/s3-request-presigner) rather than hand-rolled SigV4 — there is no
 * bundle-size or environment constraint here (this is a Node backend, not a
 * size-constrained bundle), so hand-rolling request signing has no upside and
 * a real downside: it's exactly the kind of security-sensitive, easy-to-get-
 * subtly-wrong logic you don't want hand-maintained.
 */

import crypto from 'crypto';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import { ValidationError, UpstreamError } from '../utils/errors.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — images (ENGINEERING.md §6.4)
const UPLOAD_URL_TTL_SECONDS = 5 * 60; // short TTL per §6.4

export interface SignedUploadRequest {
  filename: string;
  mime_type: string;
  size: number;
}

export interface SignedUploadResult {
  upload_url: string;
  object_key: string;
}

function isStubMode(): boolean {
  return !config.S3_ACCESS_KEY_ID || config.S3_ACCESS_KEY_ID === 'your-s3-access-key-id';
}

function validateUpload(input: SignedUploadRequest): void {
  if (!ALLOWED_MIME_TYPES.includes(input.mime_type)) {
    throw new ValidationError(
      `mime_type must be one of: ${ALLOWED_MIME_TYPES.join(', ')} (got "${input.mime_type}")`,
    );
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new ValidationError('size must be a positive number of bytes');
  }
  if (input.size > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(`size exceeds the ${MAX_FILE_SIZE_BYTES}-byte limit for images`);
  }
}

function extensionFor(mimeType: string): string {
  return mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
}

export function publicUrlFor(objectKey: string): string {
  return `${config.S3_ENDPOINT}/${config.S3_BUCKET}/${objectKey}`;
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: true, // S3-compatible custom endpoints (e.g. MinIO) need path-style addressing
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

/**
 * Validates the request (mime/size allowlist — backend-side enforcement; the
 * bucket policy is the real enforcement per §6.4) and issues a signed PUT URL.
 * The client's declared size can be lied about, so this is a first line of
 * defense, not the sole one.
 */
export async function createSignedUploadUrl(input: SignedUploadRequest): Promise<SignedUploadResult> {
  validateUpload(input);
  const object_key = `${crypto.randomUUID()}.${extensionFor(input.mime_type)}`;

  if (isStubMode()) {
    // Dev/test placeholder — no real bucket configured. Mirrors youtube.service.ts's
    // stub convention so the write path (validation, confirm, DB insert) is exercisable
    // without live cloud credentials.
    return {
      upload_url: `${publicUrlFor(object_key)}?stub-signed-put=true&expires=${UPLOAD_URL_TTL_SECONDS}`,
      object_key,
    };
  }

  const command = new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: object_key,
    ContentType: input.mime_type,
  });
  const upload_url = await getSignedUrl(getS3Client(), command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

  return { upload_url, object_key };
}

/**
 * Confirm step: HEAD the object to verify the upload actually landed before
 * any media row is persisted. Throws UpstreamError if storage is unreachable.
 */
export async function verifyObjectExists(objectKey: string): Promise<boolean> {
  if (isStubMode()) {
    return true; // no real bucket to HEAD in dev/test
  }

  try {
    await getS3Client().send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: objectKey }));
    return true;
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
      return false;
    }
    throw new UpstreamError(
      `Object storage unreachable while confirming upload: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
