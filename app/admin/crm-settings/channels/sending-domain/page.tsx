'use client'

// Settings → Channels → Email sending domain. A business sends campaign
// email from its own domain once the DNS records here are added and Resend
// verifies them; until then, from Colvy's shared campaign address under the
// business's name, with replies going to the business. Everything goes
// through /api/email-campaigns/domains (owner / admin to change).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { useCompanyUser, S } from '../../_shared'
import { confirmDialog } from '@/components/ConfirmDialog'
import { DIcon } from '@/components/EmailDesigner/icons'

type Rec = { purpose: string; type: string; fqdn: string; host: string; value: string; priority?: number | null; status: string; required: boolean }
type Dom = { id: string; domain: string; status: 'pending' | 'verified' | 'failed'; provider_status?: string | null; records: Rec[]; from_name: string | null; from_local_part: string; reply_to: string | null; verified_at: string | null; last_checked_at: string | null; last_error?: string | null }
type State = { domains: Dom[]; dbReady: boolean; sender: { from: string; replyTo: string | null; shared: boolean } | null; sharedDomain: string; canEdit: boolean }

const PILL: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  verified: { label: 'Verified', bg: '#ecfdf3', fg: '#067647', dot: '#17b26a' },
  pending: { label: 'Waiting for DNS', bg: '#fffaeb', fg: '#b54708', dot: '#f79009' },
  failed: { label: 'Failed', bg: '#fef3f2', fg: '#b42318', dot: '#f04438' },
  recommended: { label: 'Recommended', bg: '#f4f4f5', fg: '#52525b', dot: '#a1a1aa' },
}
const PURPOSE: Record<string, string> = { DKIM: 'DKIM (signs your email)', MX: 'Bounces (MX)', SPF: 'SPF (who may send)', DMARC: 'DMARC (recommended)', Tracking: 'Tracking', Other: 'Other' }

function Pill({ status }: { status: string }) {
  const p = PILL[status] || PILL.pending
  return <span className="sd-pill" style={{ background: p.bg, color: p.fg }}><span style={{ background: p.dot }} />{p.label}</span>
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className="sd-copy" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch {} }} aria-label="Copy">
      <DIcon name={done ? 'check' : 'copy'} size={14} />{done ? 'Copied' : 'Copy'}
    </button>
  )
}

const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} hr ago` : new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function SendingDomainPage() {
  const { companyId, loading } = useCompanyUser()
  const [st, setSt] = useState<State | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [domainInput, setDomainInput] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    const r = await authFetch(`/api/email-campaigns/domains?companyId=${encodeURIComponent(companyId)}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j?.error || 'Couldn’t load your sending domain'); return }
    setSt(j)
  }, [companyId])
  useEffect(() => { load() }, [load])

  const act = async (action: string, extra: any, label: string) => {
    if (!companyId) return
    setBusy(label); setErr('')
    try {
      const r = await authFetch('/api/email-campaigns/domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action, ...extra }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'That didn’t work')
      setSt(j)
      if (action === 'add') setDomainInput('')
    } catch (e: any) { setErr(e.message) }
    setBusy('')
  }

  if (loading || (!st && !err)) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  const canEdit = !!st?.canEdit
  return (
    <div className="sd">
      <style>{CSS}</style>
      <h1 style={S.h1}>Email sending domain</h1>
      <p style={S.sub}>Send campaign emails from your own domain, so they arrive from your business and reach more inboxes. Add a few DNS records once; we check them for you.</p>

      {err && <div className="sd-err" role="alert">{err}</div>}
      {st && !st.dbReady && <div className="sd-note"><span>Sending domains are waiting on a database update (V396). Campaign email uses Colvy’s shared address until then.</span></div>}

      {st?.sender && (
        <div className="sd-card sd-now">
          <div className="sd-now-ic"><DIcon name="send" size={18} /></div>
          <div className="sd-now-main">
            <span className="sd-k">Campaign emails are sent from</span>
            <b className="sd-from">{st.sender.from}</b>
            <span className="sd-k">Replies go to {st.sender.replyTo || 'your business email (add one in Business settings)'}</span>
          </div>
          <span className="sd-pill" style={st.sender.shared ? { background: '#fffaeb', color: '#b54708' } : { background: '#ecfdf3', color: '#067647' }}>
            <span style={{ background: st.sender.shared ? '#f79009' : '#17b26a' }} />{st.sender.shared ? 'Colvy shared address' : 'Your own domain'}
          </span>
        </div>
      )}
      {st?.sender?.shared && (
        <div className="sd-note"><DIcon name="warning" size={16} /><span>Until your own domain is verified, campaigns go out from <b>{st.sender.from}</b> with your business name. That works, but email from your own domain is trusted more by Gmail and Outlook and is less likely to land in spam.</span></div>
      )}

      {canEdit && st?.dbReady && (
        <div className="sd-card">
          <h2 style={S.h2}>{st.domains.length ? 'Add another domain' : 'Add your domain'}</h2>
          <form className="sd-add" onSubmit={e => { e.preventDefault(); act('add', { domain: domainInput }, 'add') }}>
            <input style={S.input} value={domainInput} onChange={e => setDomainInput(e.target.value)} placeholder="mail.yourshop.com.au" aria-label="Domain" autoCapitalize="none" spellCheck={false} />
            <button type="submit" style={S.btn} disabled={busy === 'add' || !domainInput.trim()}>{busy === 'add' ? 'Adding…' : 'Add domain'}</button>
          </form>
          <p style={S.hint}>We recommend a subdomain such as <b>mail.yourshop.com.au</b>: your website’s and mailbox’s existing email settings stay exactly as they are.</p>
        </div>
      )}
      {!canEdit && <p style={S.hint}>Only the owner or an admin can add or change the sending domain.</p>}

      {(st?.domains || []).map(d => (
        <div key={d.id} className="sd-card">
          <div className="sd-dom-head">
            <div className="sd-dom-title"><b>{d.domain}</b><Pill status={d.status} /></div>
            <div className="sd-dom-actions">
              <span className="sd-k">Checked {ago(d.last_checked_at)}</span>
              {canEdit && <button type="button" style={S.btnGhost} className="sd-btn" disabled={!!busy} onClick={() => act('check', { id: d.id }, 'check' + d.id)}>{busy === 'check' + d.id ? 'Checking…' : 'Check again'}</button>}
            </div>
          </div>
          {d.status === 'verified'
            ? <p className="sd-ok"><DIcon name="check" size={15} /> Verified. Campaign emails now go out from this domain.</p>
            : d.status === 'failed'
              ? <p className="sd-bad">Resend couldn’t find all the records. Check each one below matches exactly, then press Check again. DNS changes can take up to 24 hours (usually under an hour).</p>
              : <p className="sd-k" style={{ margin: '4px 0 0' }}>Add these records where your domain’s DNS is managed, then press Check again. DNS changes usually show up within an hour.</p>}
          {d.last_error && <p className="sd-bad">{d.last_error}</p>}

          <SenderFields d={d} canEdit={canEdit} busy={busy} onSave={patch => act('update', { id: d.id, ...patch }, 'save' + d.id)} />

          <h3 className="sd-h3">DNS records</h3>
          <div className="sd-table" role="table">
            <div className="sd-tr sd-th" role="row"><span>Type</span><span>Name / Host</span><span>Value</span><span>Priority</span><span>Status</span></div>
            {d.records.map((r, i) => (
              <div key={i} className="sd-tr" role="row">
                <span data-l="Type"><b>{r.type}</b><small>{PURPOSE[r.purpose] || r.purpose}</small></span>
                <span data-l="Name / Host"><code>{r.host}</code><Copy text={r.host} /><small>Full name: {r.fqdn}</small></span>
                <span data-l="Value"><code className="sd-val">{r.value}</code><Copy text={r.value} /></span>
                <span data-l="Priority">{r.priority ?? '–'}</span>
                <span data-l="Status"><Pill status={r.status} /></span>
              </div>
            ))}
          </div>

          <details className="sd-tips">
            <summary>Where do I add these? Cloudflare, GoDaddy and VentraIP</summary>
            <div className="sd-tips-grid">
              <div><b>Cloudflare</b><ul><li>Open your domain, then DNS, then Records, and Add record for each row.</li><li>Type the Name / Host exactly as shown; Cloudflare adds your domain itself.</li><li>Leave Proxy status off (grey cloud, DNS only) for every record.</li></ul></div>
              <div><b>GoDaddy</b><ul><li>My Products, then DNS next to your domain, then Add New Record.</li><li>Use the Name / Host as shown (GoDaddy adds the domain). For MX, set Priority to 10.</li><li>Leave TTL at the default (1 hour).</li></ul></div>
              <div><b>VentraIP</b><ul><li>VIPcontrol, then My Services, Domain Names, Manage, then DNS Records.</li><li>Enter the Name / Host as shown, choose the type, paste the value.</li><li>For the MX record, enter 10 as the priority.</li></ul></div>
            </div>
            <p style={S.hint}>Someone else looks after your website? Send them this page’s records. If the domain already has an SPF record, don’t add a second one at the same name: these records sit on their own sub-names, so normally there’s no clash.</p>
          </details>

          {canEdit && (
            <div className="sd-remove">
              <button type="button" className="sd-link" disabled={!!busy} onClick={async () => {
                if (await confirmDialog({ title: `Remove ${d.domain}?`, message: 'Campaign emails will go out from Colvy’s shared address until you add a domain again.', confirmLabel: 'Remove', tone: 'danger' })) act('remove', { id: d.id }, 'remove' + d.id)
              }}>Remove this domain</button>
            </div>
          )}
        </div>
      ))}

      <p style={S.hint}>Design your campaign emails in <Link href="/admin/campaigns/email-designer" style={{ color: 'var(--coral)', fontWeight: 600 }}>Email designs</Link>.</p>
    </div>
  )
}

function SenderFields({ d, canEdit, busy, onSave }: { d: Dom; canEdit: boolean; busy: string; onSave: (p: any) => void }) {
  const [name, setName] = useState(d.from_name || '')
  const [local, setLocal] = useState(d.from_local_part || 'hello')
  const [reply, setReply] = useState(d.reply_to || '')
  useEffect(() => { setName(d.from_name || ''); setLocal(d.from_local_part || 'hello'); setReply(d.reply_to || '') }, [d.from_name, d.from_local_part, d.reply_to])
  const changed = name !== (d.from_name || '') || local !== (d.from_local_part || 'hello') || reply !== (d.reply_to || '')
  return (
    <div className="sd-sender">
      <div><label style={S.label}>From name</label><input style={S.input} value={name} disabled={!canEdit} onChange={e => setName(e.target.value)} placeholder="Your business name" /></div>
      <div><label style={S.label}>From address</label><div className="sd-addr"><input style={{ ...S.input, borderTopRightRadius: 0, borderBottomRightRadius: 0 }} value={local} disabled={!canEdit} onChange={e => setLocal(e.target.value)} /><span>@{d.domain}</span></div></div>
      <div><label style={S.label}>Replies go to</label><input style={S.input} value={reply} disabled={!canEdit} onChange={e => setReply(e.target.value)} placeholder="you@yourshop.com.au" type="email" /></div>
      {canEdit && <div className="sd-sender-save"><button type="button" style={S.btn} disabled={!changed || !!busy} onClick={() => onSave({ from_name: name, from_local_part: local, reply_to: reply })}>{busy === 'save' + d.id ? 'Saving…' : 'Save'}</button></div>}
    </div>
  )
}

const CSS = `
.sd{min-width:0}
.sd-card{border:1px solid var(--border);border-radius:14px;padding:20px;background:#fff;margin-bottom:16px;min-width:0}
.sd-note{display:flex;gap:8px;align-items:flex-start;padding:11px 14px;border:1px solid #fedf89;background:#fffaeb;color:#93370d;border-radius:12px;font-size:13.5px;line-height:1.5;margin-bottom:16px}
.sd-note svg{flex-shrink:0;margin-top:2px}
.sd-err{padding:11px 14px;border:1px solid #fecdca;background:#fef3f2;color:#b42318;border-radius:12px;font-size:13.5px;margin-bottom:16px}
.sd-now{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.sd-now-ic{width:40px;height:40px;border-radius:11px;background:var(--canvas,#f4f4f5);display:flex;align-items:center;justify-content:center;color:var(--ink);flex-shrink:0}
.sd-now-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:200px}
.sd-from{font-size:15px;color:var(--ink);word-break:break-all}
.sd-k{font-size:12.5px;color:var(--slate)}
.sd-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}
.sd-pill span{width:7px;height:7px;border-radius:50%}
.sd-add{display:flex;gap:10px;flex-wrap:wrap}.sd-add input{flex:1 1 260px}
.sd-dom-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.sd-dom-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}.sd-dom-title b{font-size:17px;color:var(--ink);word-break:break-all}
.sd-dom-actions{display:flex;align-items:center;gap:10px}
.sd-btn{padding:8px 16px !important;font-size:13px !important}
.sd-ok{display:flex;align-items:center;gap:6px;color:#067647;font-size:13.5px;margin:8px 0 0}
.sd-bad{color:#b42318;font-size:13.5px;margin:8px 0 0;line-height:1.5}
.sd-sender{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr) minmax(0,1fr) auto;gap:12px;align-items:end;margin:18px 0 6px;padding:14px;border:1px solid var(--border);border-radius:12px;background:#fafafa}
.sd-addr{display:flex;align-items:stretch}.sd-addr input{min-width:0}
.sd-addr span{display:flex;align-items:center;padding:0 10px;border:1px solid var(--border);border-left:none;border-radius:0 10px 10px 0;background:#fff;font-size:13px;color:var(--slate);white-space:nowrap;max-width:75%;overflow:hidden;text-overflow:ellipsis}
.sd-h3{font-size:14px;font-weight:700;color:var(--ink);margin:18px 0 8px}
.sd-table{border:1px solid var(--border);border-radius:12px;overflow:hidden}
.sd-tr{display:grid;grid-template-columns:140px minmax(210px,1.2fr) minmax(240px,2.2fr) 70px 150px;gap:12px;padding:12px 14px;border-top:1px solid var(--border);align-items:start;font-size:13px;color:var(--ink)}
.sd-tr:first-child{border-top:none}
.sd-th{background:#fafafa;font-size:12px;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.04em}
.sd-tr > span{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0}
.sd-tr small{flex-basis:100%;font-size:11.5px;color:var(--slate);word-break:break-all}
.sd-tr code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;background:var(--canvas,#f4f4f5);padding:3px 6px;border-radius:6px;word-break:break-all;min-width:0}
.sd-val{max-height:66px;overflow:auto;display:block;flex:1 1 160px}
.sd-copy{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);background:#fff;border-radius:7px;padding:3px 8px;font-size:12px;font-weight:600;color:var(--ink);cursor:pointer;font-family:inherit}
.sd-tips{margin-top:14px;border:1px solid var(--border);border-radius:12px;padding:12px 14px}
.sd-tips summary{cursor:pointer;font-size:13.5px;font-weight:700;color:var(--ink)}
.sd-tips-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:12px}
.sd-tips-grid b{font-size:13.5px;color:var(--ink)}.sd-tips-grid ul{margin:6px 0 0;padding-left:18px;font-size:13px;color:var(--slate);line-height:1.55}
.sd-remove{margin-top:14px;text-align:right}
.sd-link{background:none;border:none;color:#b42318;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline;font-family:inherit}
@media (max-width:1100px){.sd-sender{grid-template-columns:1fr 1fr}.sd-sender-save{grid-column:1/-1}.sd-tips-grid{grid-template-columns:1fr}}
@media (max-width:900px){
  .sd-th{display:none}
  .sd-tr{grid-template-columns:1fr;gap:8px}
  .sd-tr > span::before{content:attr(data-l);flex-basis:100%;font-size:11px;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.04em}
}
@media (max-width:600px){.sd-sender{grid-template-columns:1fr}.sd-card{padding:16px}}
`
