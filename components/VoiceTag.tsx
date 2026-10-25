// "Voice typed" / "Voice assisted" on a sent message: how much of it came from
// the dictation mic (the mobile app writes metadata.voice). Team-only.
const LABEL: Record<string, string> = { typed: 'Voice typed', assisted: 'Voice assisted' }

export function VoiceTag({ kind, onColour }: { kind?: string | null; onColour?: boolean }) {
  const label = kind ? LABEL[kind] : null
  if (!label) return null
  const color = onColour ? 'rgba(255,255,255,0.82)' : 'var(--slate)'
  return (
    <span title={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.2, color, whiteSpace: 'nowrap' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><path d="M12 18v4" />
      </svg>
      {label}
    </span>
  )
}
