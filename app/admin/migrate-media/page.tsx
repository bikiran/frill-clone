'use client'

import { useState } from 'react'

type Prog = { running: boolean; processed: number; remaining: number; done: boolean; error?: string }

export default function MigrateMediaPage() {
  const [prog, setProg] = useState<Record<string, Prog>>({})

  const run = async (table: string, label: string) => {
    setProg(p => ({ ...p, [table]: { running: true, processed: 0, remaining: 0, done: false } }))
    let total = 0
    try {
      for (let i = 0; i < 500; i++) { // safety cap
        const res = await fetch('/api/admin/migrate-media', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, limit: 20 }),
        })
        const d = await res.json()
        if (d.error) { setProg(p => ({ ...p, [table]: { ...p[table], running: false, error: d.error } })); return }
        total += d.processed || 0
        setProg(p => ({ ...p, [table]: { running: !d.done, processed: total, remaining: d.remaining ?? 0, done: !!d.done } }))
        if (d.done) break
        if ((d.processed || 0) === 0 && (d.remaining || 0) > 0) break // nothing moved but some remain → stop to avoid a loop
      }
    } catch (e: any) {
      setProg(p => ({ ...p, [table]: { ...(p[table] || { processed: 0, remaining: 0 }), running: false, done: false, error: e.message } as Prog }))
    }
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 }
  const btn: React.CSSProperties = { padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }

  const Row = ({ table, label, desc }: { table: string; label: string; desc: string }) => {
    const p = prog[table]
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{label}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--slate)' }}>{desc}</p>
          </div>
          <button style={{ ...btn, opacity: p?.running ? 0.6 : 1 }} disabled={p?.running} onClick={() => run(table, label)}>
            {p?.running ? 'Migrating…' : p?.done ? 'Run again' : 'Migrate'}
          </button>
        </div>
        {p && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--slate)' }}>
            {p.error ? <span style={{ color: '#dc2626' }}>Error: {p.error}</span>
              : p.done ? <span style={{ color: '#059669', fontWeight: 700 }}>✓ Done — {p.processed} migrated, none remaining.</span>
                : <span>Migrated {p.processed} so far · {p.remaining} remaining…</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Migrate media to R2</h1>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '6px 0 20px' }}>
        Copies existing files from Supabase storage to Cloudflare R2 and rewrites their links to <code>media.colvy.com</code>.
        Runs in batches — safe to leave open, re-run, or stop and resume. Original Supabase files are left untouched as a backup.
      </p>
      <Row table="media_items" label="Gallery media" desc="Photos & videos in your media gallery." />
      <Row table="messages" label="Chat attachments" desc="Images & files sent in conversations." />
      <p style={{ fontSize: 12, color: 'var(--slate)', marginTop: 8 }}>
        Tip: run each once. If "remaining" stops dropping, a few files may be missing from storage (already deleted) — those are skipped safely.
      </p>
    </div>
  )
}
