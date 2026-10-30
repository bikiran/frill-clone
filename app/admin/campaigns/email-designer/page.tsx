'use client'

// Email designs: the business's saved campaign emails and the designer
// (components/EmailDesigner). An email campaign in the wizard opens the same
// designer on its Email step (saved against the campaign); this page keeps
// stand-alone designs. Reads and writes go through /api/email-campaigns/designs.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { resolveCompanyUser } from '@/lib/client-cache'
import { authFetch } from '@/lib/auth-fetch'
import { EmailDesigner, TemplatePicker, blankBlock, type DesignDraft, type EmailBrand, type SenderInfo } from '@/components/EmailDesigner'
import { DIcon } from '@/components/EmailDesigner/icons'

type Saved = { id: string; name: string; subject: string | null; campaign_id: string | null; updated_at: string }

const when = (iso: string) => { try { return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '' } }

export default function EmailDesignsPage() {
  return <Suspense fallback={<div style={{ padding: 24, color: 'var(--slate)' }}>Loading…</div>}><EmailDesigns /></Suspense>
}

function EmailDesigns() {
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get('id')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [brand, setBrand] = useState<EmailBrand | null>(null)
  const [sender, setSender] = useState<SenderInfo>(null)
  const [saved, setSaved] = useState<Saved[]>([])
  const [dbReady, setDbReady] = useState(true)
  const [draft, setDraft] = useState<DesignDraft | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const { companyId: cid } = await resolveCompanyUser()
      if (!cid) { setError('No workspace found for your account.'); return }
      setCompanyId(cid)
      const r = await authFetch(`/api/email-campaigns/designs?companyId=${encodeURIComponent(cid)}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Couldn’t load your emails')
      setBrand(j.brand); setSender(j.sender || null); setSaved(j.designs || []); setDbReady(j.dbReady !== false)
    } catch (e: any) { setError(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!id || !companyId) { if (!id) setDraft(null); return }
    ;(async () => {
      const r = await authFetch(`/api/email-campaigns/designs?companyId=${encodeURIComponent(companyId)}&id=${encodeURIComponent(id)}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j?.error || 'Couldn’t open that email'); return }
      const d = j.design
      setDraft({ id: d.id, name: d.name || 'Untitled email', subject: d.subject || '', previewText: d.preview_text || '', design: d.design?.blocks ? d.design : { version: 1, blocks: [blankBlock('footer')] } })
    })()
  }, [id, companyId])

  const initial = useMemo(() => draft, [draft])

  if (error) return <div style={{ padding: 24, color: '#b42318' }}>{error}</div>
  if (!brand || !companyId) return <div style={{ padding: 24, color: 'var(--slate)' }}>Loading…</div>

  if (initial) {
    return (
      <div className="edp">
        <style>{PAGE_CSS}</style>
        <EmailDesigner companyId={companyId} brand={brand} sender={sender} initial={initial}
          onBack={() => { setDraft(null); router.push('/admin/campaigns/email-designer'); load() }}
          onSaved={row => { if (row?.id && row.id !== id) router.replace(`/admin/campaigns/email-designer?id=${row.id}`) }} />
      </div>
    )
  }

  return (
    <div className="edp">
      <style>{PAGE_CSS}</style>
      <div className="edp-head">
        <div>
          <h1>Email designs</h1>
          <p>Design campaign emails in your own branding. Start from a template, add your products, send yourself a test.</p>
        </div>
        <Link href="/admin/crm-settings/channels/sending-domain" className="edp-link"><DIcon name="send" size={15} />Sending domain</Link>
      </div>
      {!dbReady && <div className="edp-note">Saving emails is waiting on a database update (V396). You can design and send tests in the meantime.</div>}
      {sender?.shared && <div className="edp-note">Campaign email goes out from <b>{sender.from}</b> until your own domain is verified. <Link href="/admin/crm-settings/channels/sending-domain">Set up your sending domain</Link> for better delivery.</div>}

      {saved.length > 0 && (
        <section>
          <h2>Your emails</h2>
          <div className="edp-saved">
            {saved.map(s => (
              <button key={s.id} type="button" onClick={() => router.push(`/admin/campaigns/email-designer?id=${s.id}`)}>
                <span className="edp-ic"><DIcon name="text" size={18} /></span>
                <span className="edp-t"><b>{s.name}</b><small>{s.subject || 'No subject yet'}</small></span>
                <span className="edp-when">{s.campaign_id ? 'Campaign · ' : ''}{when(s.updated_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>Start a new email</h2>
        <TemplatePicker brand={brand}
          onBlank={() => setDraft({ id: null, name: 'Untitled email', subject: '', previewText: '', design: { version: 1, blocks: [blankBlock('header'), blankBlock('heading'), blankBlock('text'), blankBlock('footer')] } })}
          onPick={t => setDraft({ id: null, name: t.name, subject: t.subject, previewText: t.previewText, design: t.design() })} />
      </section>
    </div>
  )
}

const PAGE_CSS = `
.edp{padding:22px 24px 40px;display:flex;flex-direction:column;gap:18px;min-width:0}
.edp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.edp h1{font-size:24px;font-weight:800;color:var(--ink);margin:0 0 4px}
.edp-head p{font-size:14px;color:var(--slate);margin:0}
.edp h2{font-size:15px;font-weight:700;color:var(--ink);margin:0 0 10px}
.edp-link{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border:1px solid var(--border);border-radius:10px;background:#fff;color:var(--ink);font-size:13.5px;font-weight:700;text-decoration:none}
.edp-note{padding:11px 14px;border:1px solid #fedf89;background:#fffaeb;color:#93370d;border-radius:12px;font-size:13.5px;line-height:1.5}
.edp-note a{color:#93370d;font-weight:700}
.edp-saved{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px, 100%), 1fr));gap:10px}
.edp-saved button{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border);border-radius:12px;background:#fff;cursor:pointer;text-align:left;font-family:inherit;min-width:0}
.edp-saved button:hover{border-color:var(--coral)}
.edp-ic{width:36px;height:36px;border-radius:10px;background:var(--canvas,#f4f4f5);display:flex;align-items:center;justify-content:center;color:var(--ink);flex-shrink:0}
.edp-t{display:flex;flex-direction:column;min-width:0;flex:1}.edp-t b{font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.edp-t small{font-size:12.5px;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.edp-when{font-size:12px;color:var(--slate);white-space:nowrap}
@media (max-width:767px){.edp{padding:16px}}
`
