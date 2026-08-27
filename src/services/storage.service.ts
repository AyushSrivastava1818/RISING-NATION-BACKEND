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
 */

import crypto from 'crypto';
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

  return { upload_url: signS3PutUrl(object_key, input.mime_type), object_key };
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
    const response = await fetch(publicUrlFor(objectKey), {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (err) {
    throw new UpstreamError(
      `Object storage unreachable while confirming upload: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── AWS SigV4 presigned PUT (S3-compatible, path-style) — no SDK dependency ──

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function signingKey(secret: string, date: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function signS3PutUrl(objectKey: string, _contentType: string): string {
  const accessKey = config.S3_ACCESS_KEY_ID;
  const secretKey = config.S3_SECRET_ACCESS_KEY;
  const region = config.S3_REGION;
  const service = 's3';

  const endpointUrl = new URL(config.S3_ENDPOINT);
  const host = endpointUrl.host;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const canonicalUri = `/${config.S3_BUCKET}/${objectKey}`;

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(UPLOAD_URL_TTL_SECONDS),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = hmac(signingKey(secretKey, dateStamp, region, service), stringToSign).toString('hex');

  return `${endpointUrl.protocol}//${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}
