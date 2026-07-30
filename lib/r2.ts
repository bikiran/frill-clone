import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// Cloudflare R2 (S3-compatible) storage. Uploads happen server-side so the
// secret never touches the browser. Falls back gracefully: callers check
// r2Configured() and use Supabase storage until the env vars are set.
let _client: S3Client | null = null

function client(): S3Client {
  if (_client) return _client
  const accountId = process.env.R2_ACCOUNT_ID!
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
  return _client
}

export function r2Configured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
}

/** Upload bytes to R2 and return the public URL on the media domain. */
export async function uploadToR2(key: string, body: Uint8Array | Buffer, contentType: string): Promise<string> {
  const bucket = process.env.R2_BUCKET || 'colvy-media'
  // Strip any leading slash so the key maps cleanly onto the public domain.
  const cleanKey = key.replace(/^\/+/, '')
  await client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: cleanKey,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  const domain = (process.env.R2_PUBLIC_DOMAIN || 'https://media.colvy.com').replace(/\/+$/, '')
  return `${domain}/${cleanKey}`
}
