'use client'

import { S } from '../_shared'
import Link from 'next/link'

const IMPORTS = [
  { name: 'Contacts', href: '/admin/import', available: true, desc: 'Import your contacts from a CSV file.' },
  { name: 'Conversation', href: '/admin/import', available: true, desc: 'Import historical conversations.' },
  { name: 'Phone Calls', href: '#', available: false, desc: 'Import your call history.' },
]

export default function ImportsSettings() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={S.h1}>Imports</h1>
      <p style={S.sub}>Bring your existing data into Colvy.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {IMPORTS.map(im => (
          <div key={im.name} style={{ ...S.card, marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{im.name} {!im.available && <span style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600 }}>(Coming Soon)</span>}</p>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--slate)' }}>{im.desc}</p>
            </div>
            {im.available ? (
              <Link href={im.href} style={{ ...S.btnGhost, textDecoration: 'none', display: 'inline-block', padding: '8px 16px', fontSize: 13 }}>Import</Link>
            ) : (
              <span style={{ ...S.btnGhost, padding: '8px 16px', fontSize: 13, opacity: 0.5, cursor: 'default' }}>Soon</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
