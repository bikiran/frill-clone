// Instant placeholder for public board pages while the server renders the real
// one (used by loading.tsx). Pure markup and CSS — no client JavaScript — so a
// tab switch paints straight away. Full width, like the pages it stands in for.

const bar = (w: string, h: number, extra?: React.CSSProperties): React.CSSProperties => ({
  width: w, height: h, borderRadius: 8, background: 'var(--border, #ececec)', ...extra,
})

export default function PageSkeleton({ variant = 'list' }: { variant?: 'list' | 'columns' | 'hero' }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ width: '100%', boxSizing: 'border-box', padding: variant === 'hero' ? 0 : '28px 24px 48px' }}>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Loading…</span>
      <style>{`@keyframes colvy-skel{0%,100%{opacity:1}50%{opacity:.55}} .colvy-skel>*{animation:colvy-skel 1.4s ease-in-out infinite}`}</style>
      {variant === 'hero' ? (
        <>
          <div className="colvy-skel" style={{ padding: '56px 24px 72px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, background: 'var(--canvas, #fafafa)' }}>
            <div style={bar('min(420px, 80%)', 34)} />
            <div style={bar('min(300px, 60%)', 16)} />
            <div style={bar('min(640px, 100%)', 52, { borderRadius: 999, marginTop: 14 })} />
          </div>
          <div className="colvy-skel" style={{ padding: '28px 24px 48px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 16 }}>
            {Array.from({ length: 6 }, (_, i) => <div key={i} style={bar('100%', 110, { borderRadius: 16 })} />)}
          </div>
        </>
      ) : variant === 'columns' ? (
        <div className="colvy-skel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ border: '1px solid var(--border, #ececec)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: '#fff' }}>
              <div style={bar('50%', 16)} />
              {Array.from({ length: 3 }, (_, j) => <div key={j} style={bar('100%', 64, { borderRadius: 12 })} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="colvy-skel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={bar('min(280px, 60%)', 26)} />
          {Array.from({ length: 5 }, (_, i) => <div key={i} style={bar('100%', 84, { borderRadius: 16 })} />)}
        </div>
      )}
    </div>
  )
}
