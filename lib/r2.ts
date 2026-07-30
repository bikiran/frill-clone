import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// Cloudflare R2 (S3-compatible) storage. Uploads happen server-side so the
// secret never touches the browser. Falls back gracefully: callers check
// r2Configured() and use Supabase storage until the env vars are set.
let _client: S3Client | null = null

function client(): S3Client {
  if (_client) return _client
  const accountId = process.env.R2_ACCOUNT_ID!
  // Prefer an explicit endpoint if provided, else build it from the account id.
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`
  _client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
  return _client
}

export function r2Configured(): boolean {
  return !!(
    (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT) &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  )
}

const R2_BUCKET = () => process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || 'colvy-media'
const R2_DOMAIN = () =>
  (process.env.R2_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://media.colvy.com').replace(/\/+$/, '')

/** Upload bytes to R2 and return the public URL on the media domain. */
export async function uploadToR2(key: string, body: Uint8Array | Buffer, contentType: string): Promise<string> {
  const cleanKey = key.replace(/^\/+/, '')
  await client().send(new PutObjectCommand({
    Bucket: R2_BUCKET(),
    Key: cleanKey,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return `${R2_DOMAIN()}/${cleanKey}`
}
