'use client'

import { useRef, useState } from 'react'

// The little Instagram story-reply thumbnail shown in a chat bubble. Instead of
// a plain gradient with "View story", it renders the real media: an image, or a
// video that shows its first frame and plays muted on hover. Clicking it opens
// the full gallery player (with the thread's other media as thumbnails).
export default function StoryReplyPreview({ url, knownVideo, onOpen }: {
  url: string
  knownVideo: boolean
  onOpen: (kind: 'image' | 'video') => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const vidRef = useRef<HTMLVideoElement>(null)
  // A story with no extension that fails to load as an image is a video.
  const showVideo = knownVideo || imgFailed
  const box: React.CSSProperties = { width: 150, maxWidth: '100%', borderRadius: 10, display: 'block', aspectRatio: '9 / 16', objectFit: 'cover', background: '#000' }

  return (
    <div style={{ position: 'relative', width: 150, maxWidth: '100%', cursor: 'zoom-in' }}
      onMouseEnter={() => { if (showVideo) vidRef.current?.play().catch(() => {}) }}
      onMouseLeave={() => { if (showVideo && vidRef.current) { try { vidRef.current.pause(); vidRef.current.currentTime = 0 } catch {} } }}
      onClick={() => onOpen(showVideo ? 'video' : 'image')}>
      {showVideo ? (
        <video ref={vidRef} src={url} muted playsInline preload="metadata"
          onError={() => { /* expired link: keep the dark frame + play badge */ }} style={box} />
      ) : (
        // Fall back to the gradient only if BOTH image and video fail — but the
        // switch to video happens on img error, so this img path is images only.
        <img src={url} alt="story" onError={() => setImgFailed(true)}
          style={{ ...box, background: 'linear-gradient(135deg,#F47133,#BC3081)' }} />
      )}
      {showVideo && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </span>
      )}
    </div>
  )
}
