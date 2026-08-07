'use client'

// "Download all" for a shared gallery link — staggers the downloads because
// browsers throttle rapid ones. Client component so the /m page can stay a
// server component.
export default function DownloadAll({ items, accent }: { items: { url: string; name?: string }[]; accent: string }) {
  if (!items.length) return null
  const run = () => {
    items.forEach((m, i) => setTimeout(() => {
      const a = document.createElement('a')
      a.href = m.url
      a.download = m.name || 'download'
      a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
    }, i * 400))
  }
  return (
    <button onClick={run}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      Download all ({items.length})
    </button>
  )
}
