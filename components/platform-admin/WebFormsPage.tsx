'use client'

// Super admin → Web Forms. Whether the shared forms domain (forms.colvy.com)
// really receives mail, exactly which DNS records are missing (with copy
// buttons), a real test email through Resend, and every web-form address.
// Uses /api/platform-admin/web-forms (lib/forms-mail).

import { useEffect, useRef, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'

const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 18, minWidth: 0 }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }
const btn = (color: string, filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})
const Ico = {
  copy: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  check: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  ok: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 9 10.5 15 8 12.5"/></svg>,
  warn: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  send: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  refresh: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400) }} title={`Copy ${text}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: done ? '#10b981' : 'var(--sa-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
      {done ? Ico.check : Ico.copy}{done ? 'Copied' : 'Copy'}
    </button>
  )
}
const Pill = ({ tone, children }: { tone: 'ok' | 'bad' | 'info'; children: React.ReactNode }) => {
  const c = tone === 'ok' ? '#10b981' : tone === 'bad' ? '#ef4444' : '#6366f1'
  return <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: c + '22', color: c, whiteSpace: 'nowrap' }}>{children}</span>
}

type Test = { phase: 'sending' | 'waiting' | 'arrived' | 'missing' | 'error'; secs?: number; text?: string; delivery?: string | null; company?: string }

export default function WebFormsPage({ initial }: { initial?: any } = {}) {
  const [d, setD] = useState<any>(initial || null)
  const [loading, setLoading] = useState(!initial)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [testId, setTestId] = useState('')
  const [test, setTest] = useState<Test | null>(null)
  const stop = useRef(false)

  const load = async () => {
    setLoading(true)
    try { const res = await authFetch('/api/platform-admin/web-forms'); setD(await res.json()) } catch (e: any) { setD({ error: e?.message || 'Could not load' }) } finally { setLoading(false) }
  }
  useEffect(() => { if (!initial) load(); return () => { stop.current = true } }, [])
  const post = async (body: any) => {
    const res = await authFetch('/api/platform-admin/web-forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || 'That didn’t work')
    return j
  }
  const act = async (action: string, extra: any = {}) => {
    setBusy(action); setMsg('')
    try { await post({ action, ...extra }); await load() } catch (e: any) { setMsg(e.message) } finally { setBusy('') }
  }

  const all: any[] = d?.addresses || []
  const active = all.filter(a => a.is_active)
  const chosen = all.find(a => a.id === testId) || active[0] || all[0]

  // Email the address through Resend, then poll for the conversation for ~60s.
  const runTest = async () => {
    if (!chosen) return
    setTest({ phase: 'sending' })
    try {
      const sent = await post({ action: 'test', channelId: chosen.id })
      const started = Date.now()
      let delivery: string | null = null
      while (!stop.current && Date.now() - started < 60_000) {
        await new Promise(r => setTimeout(r, 3000))
        setTest({ phase: 'waiting', secs: Math.round((Date.now() - started) / 1000), delivery })
        const c = await post({ action: 'check', channelId: chosen.id, token: sent.token, emailId: sent.emailId }).catch(() => null)
        if (c?.arrived) { setTest({ phase: 'arrived', company: chosen.company }); return }
        delivery = c?.delivery || delivery
        if (delivery === 'bounced' || delivery === 'failed') break
      }
      setTest({ phase: 'missing', delivery })
    } catch (e: any) { setTest({ phase: 'error', text: e.message }) }
  }

  const h = d?.health
  const shown = all.filter(a => !q.trim() || `${a.address} ${a.company} ${a.location}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>Web Forms</h1>
          <p style={{ fontSize: 13, color: 'var(--sa-muted)', margin: 0, lineHeight: 1.55 }}>
            Each business gets an email address (like <code>2f81ab.all@{d?.formsDomain || 'forms.colvy.com'}</code>) to put in its website contact form, and every submission lands in its Colvy inbox as a conversation. Nothing is needed per business: once the forms domain&apos;s DNS below is right (a one-off job for Colvy), every address works automatically.
          </p>
        </div>
        <button onClick={load} disabled={loading} style={btn('var(--sa-muted)')}>{Ico.refresh} Check again</button>
      </div>

      {loading && !d ? <p style={{ color: 'var(--sa-muted)' }}>Checking DNS and Resend…</p> : d?.error ? <p style={{ color: '#ef4444' }}>{d.error}</p> : h && (
        <>
          {/* Verdict */}
          <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14, borderColor: h.ready ? '#10b98155' : '#f59e0b77', background: h.ready ? '#10b9810d' : '#f59e0b0f' }}>
            <span style={{ color: h.ready ? '#10b981' : '#f59e0b', flexShrink: 0, marginTop: 1 }}>{h.ready ? Ico.ok : Ico.warn}</span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--sa-text)' }}>{h.ready ? 'Receiving mail' : 'Not receiving mail yet'}</p>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--sa-text)', lineHeight: 1.5 }}>{h.summary}</p>
              {h.problems.length > 1 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--sa-muted)', lineHeight: 1.55 }}>
                  {h.problems.slice(1).map((p: any) => <li key={p.code}>{p.text}</li>)}
                </ul>
              )}
            </div>
          </div>

          {msg && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 9, background: '#fee2e2', color: '#b91c1c', fontSize: 12.5 }}>{msg}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14, marginBottom: 14 }}>
            {/* Checks */}
            <div style={card}>
              <p style={label}>Checks</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Row name="Forms domain" value={<code>{h.domain}</code>}
                  pill={<Pill tone="info">{d.usingDefault ? `Using ${h.domain} (default)` : 'Set by NEXT_PUBLIC_FORMS_DOMAIN'}</Pill>} />
                <Row name="MX record"
                  value={h.mx.length
                    ? <>{h.mx.map((m: any) => `${m.priority} ${m.host}`).join(', ')}</>
                    : <>None{h.cname ? <> (only a CNAME to <code>{h.cname}</code>, a web host)</> : null}</>}
                  sub={<>Should be <code>{h.expected.priority} {h.expected.host}</code> · {({ resend: 'from Resend', env: 'from FORMS_INBOUND_MX', 'reply-domain': 'the same Resend inbound server reply.colvy.com already uses', default: 'Resend’s default region' } as any)[h.expected.source]}</>}
                  pill={<Pill tone={h.mxOk ? 'ok' : 'bad'}>{h.mxOk ? 'OK' : h.mx.length ? 'Wrong' : 'Missing'}</Pill>} />
                <Row name="Resend"
                  value={!d.resendKey ? 'RESEND_API_KEY is not set' : h.resend.error ? `Couldn’t ask Resend: ${h.resend.error}` : !h.resend.found ? `${h.domain} hasn’t been added` : <>Added{h.resend.region ? ` (${h.resend.region})` : ''} · receiving {h.resend.receiving || 'unknown'} · {String(h.resend.status || 'unknown').replace(/_/g, ' ')}</>}
                  pill={<Pill tone={h.resend.found && h.resend.receiving === 'enabled' && h.resend.status === 'verified' ? 'ok' : 'bad'}>{h.resend.found ? (h.resend.status === 'verified' ? 'OK' : 'Pending') : 'Missing'}</Pill>}
                  action={d.resendKey && h.resend.checked && !h.resend.found
                    ? <button onClick={() => act('add-to-resend')} disabled={!!busy} style={btn('#ff7a6b', true)}>{busy === 'add-to-resend' ? 'Adding…' : 'Add to Resend'}</button>
                    : h.resend.found && h.resend.status !== 'verified'
                      ? <button onClick={() => act('verify', { id: h.resend.id })} disabled={!!busy} style={btn('var(--sa-text)')}>{busy === 'verify' ? 'Asking…' : 'Verify'}</button>
                      : null} />
                <Row name="Inbound webhook" value={<code style={{ wordBreak: 'break-all' }}>{d.webhookUrl}</code>} sub="Set once in Resend → Webhooks (email.received). It’s shared with reply.colvy.com, so it’s already working." />
              </div>
            </div>

            {/* Test */}
            <div style={card}>
              <p style={label}>Send a test email</p>
              <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>Emails a web-form address through Resend, the way a website form would, and watches for it to land (up to a minute). It’s filed closed and read, so the business isn’t notified.</p>
              {all.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: 0 }}>No web-form addresses yet. A business makes one under Settings → Channels → Web Form.</p> : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={chosen?.id || ''} onChange={e => setTestId(e.target.value)} style={{ flex: '1 1 220px', minWidth: 0, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 12.5 }}>
                    {all.map(a => <option key={a.id} value={a.id}>{a.address} · {a.company}</option>)}
                  </select>
                  <button onClick={runTest} disabled={!!test && (test.phase === 'sending' || test.phase === 'waiting')} style={btn('#ff7a6b', true)}>{Ico.send}{test?.phase === 'sending' ? 'Sending…' : test?.phase === 'waiting' ? `Waiting ${test.secs}s…` : 'Send a test email'}</button>
                </div>
              )}
              {test && test.phase !== 'sending' && (
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5, border: '1px solid var(--sa-border)',
                  background: test.phase === 'arrived' ? '#10b98112' : test.phase === 'waiting' ? 'var(--sa-bg)' : '#ef444410', color: 'var(--sa-text)' }}>
                  {test.phase === 'waiting' ? <>Sent. Waiting for it to arrive… {test.delivery ? `Resend says: ${test.delivery}.` : ''}</>
                    : test.phase === 'arrived' ? <><b style={{ color: '#059669' }}>It arrived.</b> The test landed in {test.company}&apos;s inbox, so form submissions are getting through.</>
                    : test.phase === 'missing' ? <><b style={{ color: '#dc2626' }}>It didn’t arrive.</b> {test.delivery === 'bounced' ? 'Resend says the email bounced: the forms domain isn’t accepting mail.' : test.delivery ? `Resend says: ${test.delivery}.` : ''} {h.ready ? 'DNS looks right, so check Resend → Receiving and the webhook log.' : 'Fix the DNS records below, then try again.'}</>
                    : <span style={{ color: '#dc2626' }}>{test.text}</span>}
                </div>
              )}
            </div>
          </div>

          {/* What to add */}
          {h.records.length > 0 && (
            <div style={{ ...card, marginBottom: 14 }}>
              <p style={label}>Add {h.records.length === 1 ? 'this DNS record' : 'these DNS records'}{h.dnsProvider ? ` in ${h.dnsProvider}` : ''}</p>
              <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                {h.dnsProvider ? `${h.zone}’s DNS is hosted at ${h.dnsProvider}. ` : ''}Open {h.zone} → DNS → Add record, and enter each one exactly as shown.
                {h.cname ? <> {h.domain} currently matches the <code>*.{h.zone}</code> wildcard; an MX record named <code>{h.records[0]?.name}</code> takes priority over it for that name only, so leave the wildcard alone.</> : null}
                {!h.resend.found && d.resendKey ? ' Press “Add to Resend” above too, or Resend will drop the mail.' : ''}
              </p>
              <div style={{ border: '1px solid var(--sa-border)', borderRadius: 12, overflow: 'hidden' }}>
                {h.records.map((r: any, i: number) => (
                  <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', padding: '12px 14px', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                    <Field k="Type" v={r.type} />
                    <Field k="Name" v={r.name} hint={r.host && r.host !== r.name ? r.host : undefined} />
                    <Field k={r.type === 'MX' ? 'Mail server' : 'Value'} v={r.value} wide />
                    {r.priority != null && <Field k="Priority" v={String(r.priority)} />}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '8px 0 0' }}>DNS changes usually show up within a few minutes. Press “Check again”, then send a test email.</p>
            </div>
          )}

          {/* Addresses */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, color: 'var(--sa-muted)', margin: 0 }}>{d.total} address{d.total === 1 ? '' : 'es'} · {d.companies} compan{d.companies === 1 ? 'y' : 'ies'}</p>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search address / company…" style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, flex: '0 1 280px', minWidth: 0 }} />
          </div>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {shown.length === 0 ? <p style={{ padding: 22, color: 'var(--sa-muted)', fontSize: 13, textAlign: 'center', margin: 0 }}>No web-form addresses yet.</p> : shown.map((a: any, i: number) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '6px 14px', padding: '12px 16px', borderTop: i ? '1px solid var(--sa-border)' : 'none', flexWrap: 'wrap' }}>
                <code style={{ flex: '1 1 260px', minWidth: 0, fontSize: 13, color: 'var(--sa-text)', wordBreak: 'break-all' }}>{a.address}</code>
                <span style={{ fontSize: 13, color: 'var(--sa-text)', flex: '0 1 200px' }}>{a.company}</span>
                <span style={{ fontSize: 12.5, color: 'var(--sa-muted)', flex: '0 1 120px' }}>{a.location}</span>
                {!a.onFormsDomain && <Pill tone="bad">Old domain</Pill>}
                <span style={{ fontSize: 11, fontWeight: 700, color: a.is_active ? '#10b981' : 'var(--sa-muted)' }}>{a.is_active ? 'Active' : 'Off'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Row({ name, value, sub, pill, action }: { name: string; value: React.ReactNode; sub?: React.ReactNode; pill?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 220px' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--sa-muted)' }}>{name}</p>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--sa-text)', wordBreak: 'break-word' }}>{value}</p>
        {sub && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--sa-muted)', lineHeight: 1.45, wordBreak: 'break-word' }}>{sub}</p>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{action}{pill}</div>
    </div>
  )
}

function Field({ k, v, hint, wide }: { k: string; v: string; hint?: string; wide?: boolean }) {
  return (
    <div style={{ minWidth: 0, flex: wide ? '3 1 300px' : '1 1 110px' }}>
      <p style={{ margin: '0 0 3px', fontSize: 10.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <code style={{ fontSize: 13, color: 'var(--sa-text)', wordBreak: 'break-all', minWidth: 0 }}>{v}</code>
        <Copy text={v} />
      </div>
      {hint && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--sa-muted)' }}>Full name: {hint}</p>}
    </div>
  )
}
