// FILE: lib/r2.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// R2 is S3-compatible — same SDK as AWS, just pointed at Cloudflare's endpoint.
export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!; // e.g. https://pub-xxxx.r2.dev or your custom domain

/**
 * Uploads a file buffer to R2 and returns its public URL.
 * `key` is the path inside the bucket, e.g. "feedback/session-42/img.png".
 */
export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `${PUBLIC_URL}/${key}`;
}

export async function deleteFromR2(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Builds a collision-safe key for a given "folder" (e.g. a session ID)
 * and original filename — keeps the extension, randomizes the rest.
 */
export function buildKey(folder: string, originalFilename: string): string {
  const ext = originalFilename.split('.').pop() || 'bin';
  const random = crypto.randomUUID();
  return `${folder}/${random}.${ext}`;
}