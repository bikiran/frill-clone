export default function PayCancelled() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: 'var(--canvas)', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: '#fff', borderRadius: 18, padding: 40, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px' }}>Payment cancelled</h1>
        <p style={{ fontSize: 14, color: 'var(--slate)', margin: 0, lineHeight: 1.5 }}>No charge was made. You can return to your chat and pay whenever you&rsquo;re ready.</p>
      </div>
    </div>
  )
}
