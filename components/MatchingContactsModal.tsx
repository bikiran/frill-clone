'use client'

import { useState } from 'react'
import type { MatchableContact } from '@/lib/contact-matching'

const SOURCE_COLORS: Record<string, string> = {
  widget: '#dbeafe', woocommerce: '#ede9fe', import: '#dcfce7',
  manual: '#fef9c3', email: '#ffedd5', inbox: '#e0f2fe',
}

const LABEL: Record<string, string> = {
  customer: 'Customer', supplier: 'Supplier',
  wholesaler: 'Wholesaler', business: 'Business contact',
}

/**
 * Shown after changing someone's relationship type when other records look like
 * the same person. Applying is opt-in and every match is listed — reclassifying
 * records silently would be hard to notice and harder to undo.
 */
export default function MatchingContactsModal({
  matches, relationship, onClose, onApply,
}: {
  matches: MatchableContact[]
  relationship: string
  onClose: () => void
  onApply: (ids: string[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(matches.map(m => m.id)))
  const [working, setWorking] = useState(false)

  const toggle = (id: string) => setSelected(s => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const label = LABEL[relationship] || relationship

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ padding: '20px 22px 14px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>
            {matches.length} other record{matches.length === 1 ? '' : 's'} match
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
            These share an email or phone number with this contact. Mark them as <strong style={{ color: 'var(--ink)' }}>{label}</strong> too?
          </p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
          {matches.map(m => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 22px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)}
                style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name || 'Unnamed'}
                  </span>
                  {m.source && (
                    <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: SOURCE_COLORS[m.source] || '#f3f4f6', color: '#374151', textTransform: 'capitalize' }}>
                      {m.source}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[m.email, m.phone].filter(Boolean).join(' · ') || '—'}
                  {m.relationship_type && m.relationship_type !== relationship && (
                    <span style={{ color: '#9ca3af' }}> · currently {LABEL[m.relationship_type] || m.relationship_type}</span>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={onClose} disabled={working}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            Leave them
          </button>
          <button type="button" disabled={working || selected.size === 0}
            onClick={async () => { setWorking(true); await onApply(Array.from(selected)); setWorking(false) }}
            style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: working || selected.size === 0 ? 0.6 : 1 }}>
            {working ? 'Updating…' : `Mark ${selected.size} as ${label}`}
          </button>
        </div>
      </div>
    </div>
  )
}
