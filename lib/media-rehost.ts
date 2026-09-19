import { uploadToR2, r2Configured } from '@/lib/r2'

// Fetch a remote media URL and store a durable copy, returning its public URL,
// kind (image/video) and content type. Instagram story-reply media (and Meta
// attachment URLs) are short-lived CDN links that 403/expire within hours, so a
// thumbnail saved as the raw URL renders broken by the time an agent looks. We
// fetch it while it's still fresh (at webhook time) and rehost it to R2 (or
// Supabase storage as a fallback), exactly like app/api/storage/put.
//
// Never throws — on any failure it returns null so the caller can fall back to
// the original URL rather than dropping the message.
export async function rehostRemoteMedia(
  db: any,
  url: string,
  prefix = 'ig-story'
): Promise<{ url: string; kind: 'image' | 'video'; contentType: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return null

    const kind: 'image' | 'video' = contentType.startsWith('video') ? 'video' : 'image'
    const ext = contentType.includes('mp4') ? 'mp4'
      : contentType.includes('webm') ? 'webm'
      : contentType.includes('quicktime') ? 'mov'
      : contentType.includes('png') ? 'png'
      : contentType.includes('gif') ? 'gif'
      : kind === 'video' ? 'mp4' : 'jpg'
    const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    if (r2Configured()) {
      try {
        const stored = await uploadToR2(key, buf, contentType)
        return { url: stored, kind, contentType }
      } catch { /* fall through to Supabase */ }
    }

    const bucket = 'chat-attachments'
    try {
      const { data: bks } = await db.storage.listBuckets()
      if (!bks?.some((b: any) => b.id === bucket)) await db.storage.createBucket(bucket, { public: true })
    } catch {}
    const { error } = await db.storage.from(bucket).upload(key, buf, { contentType, upsert: true })
    if (error) return null
    return { url: db.storage.from(bucket).getPublicUrl(key).data.publicUrl, kind, contentType }
  } catch {
    return null
  }
}
