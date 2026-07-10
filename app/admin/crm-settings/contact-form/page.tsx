'use client'

import { S } from '../_shared'
import Link from 'next/link'

export default function ContactFormSettings() {
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ ...S.h1, margin: 0 }}>Contact Form</h1>
        <Link href="/admin/forms" style={{ ...S.btn, textDecoration: 'none', display: 'inline-block' }}>+ Add form</Link>
      </div>
      <p style={S.sub}>Contact form widgets collect information from your customers. Add multiple forms to your website and customize them to your needs.</p>
      <div style={{ textAlign: 'center', padding: 56, color: 'var(--slate)', border: '1px dashed var(--border)', borderRadius: 14 }}>
        No forms found. Click &ldquo;Add form&rdquo; above to create your first one.
      </div>
    </div>
  )
}
