'use client'

import { useVideoAspect } from '@/lib/video-aspect'

// A video sent on its own in a chat bubble, at its own shape: no wider than
// `maxW`, no taller than `maxH`. Sized exactly, so the bubble hugs the clip;
// left to the browser, it measured the full-size clip and left empty bubble
// beside a portrait video. Before the shape is known (no still frame, metadata
// not in yet) it assumes a phone video, the usual case.

export default function LoneChatVideo({ src, poster, maxW = 268, maxH = 280 }: { src: string; poster?: string; maxW?: number; maxH?: number }) {
  const { aspect, onLoadedMetadata } = useVideoAspect(src, poster)
  const a = aspect || 9 / 16
  let h = maxH, w = h * a
  if (w > maxW) { w = maxW; h = w / a }
  return (
    // No still frame? Seek a hair in (#t=0.1) so the frame painted isn't the
    // usual black leader.
    <video src={poster ? src : `${src}#t=0.1`} poster={poster} preload="metadata" muted playsInline
      onLoadedMetadata={onLoadedMetadata}
      style={{ width: Math.round(w), height: Math.round(h), display: 'block', objectFit: 'cover', pointerEvents: 'none', background: '#111' }} />
  )
}
