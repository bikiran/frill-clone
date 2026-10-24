'use client'

// Conversation protection in the inbox (lib/conversation-protection): a
// customer message Colvy held back as possible spam. The text stays hidden
// until someone chooses to look; then they decide: Not spam (and trust this
// customer from now on) or Block sender.

const VERDICT: Record<string, { label: string; color: string; bg: string }> = {
  suspect: { label: 'Possible spam', color: '#c2410c', bg: 'rgba(234, 88, 12, 0.12)' },
  spam: { label: 'Spam', color: '#b91c1c', bg: 'rgba(220, 38, 38, 0.12)' },
  blocked: { label: 'Blocked sender', color: '#475569', bg: 'rgba(100, 116, 139, 0.14)' },
}

const Shield = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>
)

export function ProtectionCard({ name, verdict, reasons, firstContact, blocked, busy, onReview, onNotSpam, onBlock }: {
  name: string
  verdict: string
  reasons?: string[]
  firstContact?: boolean
  blocked?: boolean
  busy?: boolean
  onReview: () => void
  onNotSpam: () => void
  onBlock?: () => void
}) {
  const v = VERDICT[verdict] || VERDICT.suspect
  // "Unknown sender" is already said; the rest are the reasons it was held back.
  const why = (reasons || []).filter(r => r !== 'First message from an unknown sender')
  const btn: React.CSSProperties = { padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
  return (
    <div role="group" aria-label="Message hidden by conversation protection" style={{ margin: '6px 0 10px', maxWidth: 520, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--card, #fff)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: 'var(--slate)', display: 'inline-flex' }}><Shield /></span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Conversation protection</span>
        <span style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 999, background: v.bg, color: v.color, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{v.label}</span>
      </div>
      <div style={{ borderRadius: 12, background: 'var(--bg, #f5f6f8)', padding: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{name}</div>
        <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>{blocked || verdict === 'blocked' ? 'Blocked sender' : firstContact ? 'New conversation · Unknown sender' : 'Flagged message'}{why.length ? ` · ${why.join(', ')}` : ''}</div>
        <p style={{ margin: '10px 0 12px', fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>Message hidden because it may contain unsolicited or inappropriate content. Automatic replies are paused.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={onReview} disabled={busy} style={{ ...btn, border: 'none', background: 'var(--ink)', color: 'var(--card, #fff)' }}>Review message</button>
          <button type="button" onClick={onNotSpam} disabled={busy} style={{ ...btn, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)' }}>{busy ? 'Saving…' : 'Not spam'}</button>
          {onBlock && !blocked && verdict !== 'blocked' && <button type="button" onClick={onBlock} disabled={busy} style={{ ...btn, border: '1px solid var(--border)', background: 'transparent', color: 'var(--slate)' }}>Block sender</button>}
        </div>
      </div>
    </div>
  )
}

/** The thread-top reminder while a flagged message is still undecided. */
export function ProtectionBanner({ verdict, busy, onNotSpam, onBlock, blocked }: { verdict: string; busy?: boolean; onNotSpam: () => void; onBlock?: () => void; blocked?: boolean }) {
  const v = VERDICT[verdict] || VERDICT.suspect
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 12px', padding: '10px 12px', borderRadius: 12, background: v.bg, color: v.color, fontSize: 12.5 }}>
      <Shield size={15} />
      <span style={{ flex: 1, minWidth: 180, fontWeight: 600 }}>
        {verdict === 'blocked' ? 'This sender is blocked. Their messages go to Spam and get no automatic replies.'
          : verdict === 'spam' ? 'Colvy moved this conversation to Spam. No automatic replies or notifications were sent.'
          : 'Colvy hid a message that may be spam. Automatic replies are paused until you decide.'}
      </span>
      {verdict !== 'blocked' && <button type="button" onClick={onNotSpam} disabled={busy} style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${v.color}55`, background: 'transparent', color: v.color, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{busy ? 'Saving…' : 'Not spam'}</button>}
      {onBlock && !blocked && verdict !== 'blocked' && <button type="button" onClick={onBlock} disabled={busy} style={{ padding: '5px 12px', borderRadius: 999, border: 'none', background: v.color, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Block sender</button>}
    </div>
  )
}
