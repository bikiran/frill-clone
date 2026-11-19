import { useCallback, useEffect, useState, type SyntheticEvent } from 'react'
import { toPublicUrl } from '@/lib/storage-url'

// The shape (width ÷ height) of the videos seen in this tab, by address, so a
// chat tile or the player can size itself before the clip's own size arrives.
// Without it a player waits for the video's metadata at the browser's default
// 300×150, with its controls squashed on top, and a chat bubble guesses from
// the full-size clip and leaves empty bubble beside a portrait video.

const seen = new Map<string, number>()
const key = (url: string) => toPublicUrl(url).split('#')[0]

export function videoAspect(url?: string | null): number | null {
  return url ? seen.get(key(url)) ?? null : null
}

export function rememberVideoAspect(url: string | null | undefined, w: number, h: number) {
  if (url && w > 0 && h > 0) seen.set(key(url), w / h)
}

/** Remember a clip's shape from a <video>'s loadedmetadata event. */
export const rememberFromVideo = (url: string) => (e: SyntheticEvent<HTMLVideoElement>) => {
  const v = e.currentTarget
  rememberVideoAspect(url, v.videoWidth, v.videoHeight)
}

/**
 * A video's shape: known already, else from its still frame (poster) as soon as
 * that loads, then from the clip itself once its metadata arrives. Pass the
 * returned handler to the <video>'s onLoadedMetadata.
 */
export function useVideoAspect(src: string, poster?: string | null) {
  const [aspect, setAspect] = useState<number | null>(() => videoAspect(src))
  useEffect(() => {
    const known = videoAspect(src)
    setAspect(known)
    if (known || !poster) return
    let live = true
    const img = new Image()
    img.onload = () => {
      if (!live || !img.naturalWidth || !img.naturalHeight || videoAspect(src)) return
      rememberVideoAspect(src, img.naturalWidth, img.naturalHeight)
      setAspect(img.naturalWidth / img.naturalHeight)
    }
    img.src = poster
    return () => { live = false; img.onload = null }
  }, [src, poster])
  const onLoadedMetadata = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget
    if (!v.videoWidth || !v.videoHeight) return
    rememberVideoAspect(src, v.videoWidth, v.videoHeight)
    setAspect(v.videoWidth / v.videoHeight)
  }, [src])
  return { aspect, onLoadedMetadata }
}
