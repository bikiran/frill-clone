// How the web chooses what to play and when to show a "Processing…" state for a
// gallery video, mirroring the mobile rule so both clients behave identically.
//
// Always prefer the processed `playback_url`. Only treat a video as processing
// when the row explicitly says so and no playback URL exists yet — legacy rows
// (no status) play their original `url` unchanged.

export type MediaLike = {
  url?: string | null
  playback_url?: string | null
  thumbnail_url?: string | null
  kind?: string | null
  processing_status?: string | null
  created_at?: string | null
}

// A normal transcode finishes in seconds; a row still pending after this is a
// down/absent worker, so we stop blocking and play the original.
const PROCESSING_GRACE_MS = 10 * 60 * 1000

export function playbackUrl(item: MediaLike): string {
  return item.playback_url || item.url || ''
}

export function isVideoProcessing(item: MediaLike): boolean {
  if (item.kind !== 'video') return false
  if (item.playback_url) return false
  if (item.processing_status !== 'pending' && item.processing_status !== 'processing') return false
  const created = item.created_at ? Date.parse(item.created_at) : NaN
  if (!Number.isNaN(created) && Date.now() - created > PROCESSING_GRACE_MS) return false
  return true
}
