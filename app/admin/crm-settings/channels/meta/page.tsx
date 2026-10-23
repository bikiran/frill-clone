'use client'

import { withConnectTicket } from '@/lib/oauth-ticket-client'
import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import { confirmDialog } from '@/components/ConfirmDialog'
import { currentSetupReturn, addQuery } from '@/lib/setup-return'

// Whether Meta is sending this account's messages to Colvy, asked live from
// Meta (GET /{page-id}/subscribed_apps) each time the page opens. Colvy
// subscribes a Page automatically when it's connected; this shows the result,
// lets you subscribe again, and shows Meta's response as returned.
type SubStatus = { subscribed: boolean; fields: string[]; app: { id: string | null; name: string | null } | null; raw: any; error?: string; subscribeError?: string | null; checkedAt?: string; endpoint?: string; via?: string }
function WebhookStatus({ channelId, active, onChanged }: { channelId: string; active: boolean; onChanged: () => void }) {
  const [st, setSt] = useState<SubStatus | null>(null)
  const [busy, setBusy] = useState<'' | 'check' | 'subscribe'>('check')
  const [showRaw, setShowRaw] = useState(false)
  const run = async (action: 'webhook_status' | 'resubscribe') => {
    setBusy(action === 'resubscribe' ? 'subscribe' : 'check')
    try {
      const r = await authFetch('/api/meta/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: channelId }) })
      const d = await r.json().catch(() => ({}))
      setSt(r.ok ? d : { subscribed: false, fields: [], app: null, raw: d, error: d?.error || 'Could not check' })
      onChanged()   // the row's error line follows what Meta just said
    } catch (e: any) { setSt({ subscribed: false, fields: [], app: null, raw: null, error: e?.message || 'Could not reach Colvy' }) } finally { setBusy('') }
  }
  useEffect(() => { run('webhook_status') }, [channelId])   // eslint-disable-line react-hooks/exhaustive-deps
  const time = st?.checkedAt ? new Date(st.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''
  const tone = busy === 'check' && !st ? 'wait' : st?.subscribed ? 'ok' : st?.error ? 'warn' : 'bad'
  const C = { ok: { bg: '#ecfdf3', bd: '#abefc6', fg: '#067647', dot: '#12b76a' }, bad: { bg: '#fef3f2', bd: '#fecdca', fg: '#b42318', dot: '#f04438' }, warn: { bg: '#fffaeb', bd: '#fedf89', fg: '#b54708', dot: '#f79009' }, wait: { bg: 'var(--canvas, #f8f8fa)', bd: 'var(--border)', fg: 'var(--slate)', dot: '#98a2b3' } }[tone]
  const link: React.CSSProperties = { background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }
  return (
    <div style={{ flexBasis: '100%', marginTop: 4, padding: '10px 12px', borderRadius: 10, background: C.bg, border: `1px solid ${C.bd}` }} aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: C.dot, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.fg }}>
          {tone === 'wait' ? 'Checking webhook subscription with Meta…'
            : tone === 'ok' ? 'Webhook subscribed'
            : tone === 'warn' ? 'Couldn’t check the webhook subscription'
            : 'Not subscribed to webhooks: new messages won’t arrive'}
        </span>
        {tone === 'ok' && st?.app?.name && <span style={{ fontSize: 12, color: C.fg }}>· app “{st.app.name}”</span>}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 12, alignItems: 'center' }}>
          {(tone === 'bad' || tone === 'warn') && active && (
            <button type="button" onClick={() => run('resubscribe')} disabled={!!busy} style={{ padding: '5px 11px', borderRadius: 8, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{busy === 'subscribe' ? 'Subscribing…' : 'Subscribe now'}</button>
          )}
          {st && <button type="button" onClick={() => run('webhook_status')} disabled={!!busy} style={link}>{busy === 'check' ? 'Checking…' : 'Re-check'}</button>}
          {st?.raw && <button type="button" onClick={() => setShowRaw(v => !v)} style={link}>{showRaw ? 'Hide API response' : 'View API response'}</button>}
        </span>
      </div>
      {st && (
        <p style={{ margin: '5px 0 0 16px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.5 }}>
          {tone === 'ok'
            ? <>Receiving: <b style={{ color: 'var(--ink)' }}>{st.fields.length ? st.fields.join(', ') : 'all events'}</b>{st.via === 'page' ? ' (through the linked Facebook Page)' : ''}. </>
            : st.error ? <>{st.error}. </> : <>Colvy’s app isn’t in this account’s webhook subscriptions. </>}
          {time && <>Checked with Meta at {time}.</>}
          {st.subscribeError && <span style={{ color: '#b42318' }}> Subscribing failed: {st.subscribeError}</span>}
        </p>
      )}
      {showRaw && st?.raw && (
        <div style={{ marginTop: 8 }}>
          {st.endpoint && <p style={{ margin: '0 0 4px', fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--slate)' }}>{st.endpoint}</p>}
          <pre style={{ margin: 0, padding: 10, borderRadius: 8, background: '#0f1119', color: '#e6e8ef', fontSize: 11.5, lineHeight: 1.5, overflowX: 'auto', maxHeight: 260 }}>{JSON.stringify(st.raw, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

export default function MetaChannelsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [metaRootOrigin, setMetaRootOrigin] = useState('')
  const [igLoginConfigured, setIgLoginConfigured] = useState(false)
  const [igRootOrigin, setIgRootOrigin] = useState('')
  const [channels, setChannels] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [inboxSettings, setInboxSettings] = useState<any>({})

  useEffect(() => {
    ;(async () => {
      // The admin already knows the company (no extra sign-in check needed).
      let cid: string | null = peekCompanyUser()?.companyId || null
      const user = cid ? null : (await supabase.auth.getUser()).data.user
      if (!cid && !user) { setLoading(false); return }
      const { data: owned } = cid ? { data: null } : await (supabase as any).from('companies').select('id').eq('owner_id', user!.id).order('created_at', { ascending: true }).limit(1)
      cid = cid || owned?.[0]?.id || null
      if (!cid && user) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      setCompanyId(cid)
      if (cid) {
        // Connected channels and inbox settings side by side.
        const [, { data: co }] = await Promise.all([
          load(cid),
          (supabase as any).from('companies').select('inbox_settings').eq('id', cid).maybeSingle(),
        ])
        setInboxSettings(co?.inbox_settings || {})
      }
      setLoading(false)

      const p = new URLSearchParams(window.location.search)
      if (p.get('connected') === '0') setMsg('Connection failed: Facebook didn’t give Colvy access to any Pages. Check you manage the Page, then connect again and pick it.')
      else if (p.get('connected')) setMsg(`Connected ${p.get('connected')} channel(s). Map each to an outlet below.`)
      if (p.get('error')) setMsg('Connection failed: ' + p.get('error'))
    })()
  }, [])

  const load = async (cid: string) => {
    const res = await authFetch(`/api/meta/channels?companyId=${cid}`)
    const d = await res.json().catch(() => ({}))
    setConfigured(d.configured !== false)
    setMetaRootOrigin(d.rootOrigin || '')
    setIgLoginConfigured(!!d.igLoginConfigured)
    setIgRootOrigin(d.igRootOrigin || d.rootOrigin || '')
    setChannels(d.channels || [])
    setLocations(d.locations || [])
  }

  const api = async (body: any) => {
    await authFetch('/api/meta/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (companyId) await load(companyId)
  }

  const locLabel = (l: any) => l.label || l.suburb || 'Outlet'

  // Opened from the setup checklist: once connected, land back on it.
  const setupHref = (href: string) => {
    const back = currentSetupReturn()
    return back ? addQuery(href, `returnTo=${encodeURIComponent(back)}`) : href
  }

  // Merged into the settings as saved now, not as they were when this page
  // opened, so a setting changed elsewhere meanwhile (missed-call texts
  // switched off in Calls & SMS) isn't put back.
  const saveInboxSetting = async (patch: Record<string, boolean>) => {
    setInboxSettings((s: any) => ({ ...(s || {}), ...patch }))
    if (!companyId) return
    const { data, error } = await (supabase as any).from('companies').select('inbox_settings').eq('id', companyId).maybeSingle()
    if (error || !data) return
    const next = { ...(data?.inbox_settings || {}), ...patch }
    await (supabase as any).from('companies').update({ inbox_settings: next }).eq('id', companyId)
    setInboxSettings(next)
  }

  // Company-wide display preference: render Instagram conversations in the inbox
  // with an Instagram-style theme (gradient outgoing bubbles + header).
  const setIgTheme = (on: boolean) => saveInboxSetting({ instagram_theme: on })

  // The Messenger equivalent: render Facebook Messenger conversations with the
  // signature Messenger blue on outgoing bubbles, header + Send button.
  const setMsgrTheme = (on: boolean) => saveInboxSetting({ messenger_theme: on })

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  const fbChannels = channels.filter(c => c.platform === 'facebook')
  const igChannels = channels.filter(c => c.platform === 'instagram')

  return (
    <div style={{ maxWidth: 820, padding: '8px 4px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>Instagram &amp; Messenger</h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--slate)', lineHeight: 1.55 }}>
        Connect each outlet's Facebook Page and Instagram account, then map it to that outlet so its DMs land in the right inbox.
      </p>

      {msg && (
        <div style={{ marginBottom: 18, padding: '11px 14px', borderRadius: 10, background: msg.includes('failed') ? '#fee2e2' : '#dcfce7', color: msg.includes('failed') ? '#dc2626' : '#15803d', fontSize: 13.5 }}>
          {msg}
        </div>
      )}

      {!configured && (
        <div style={{ marginBottom: 18, padding: 14, borderRadius: 12, background: '#fef3c7', border: '1px solid #fde68a' }}>
          <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: '#92400e' }}>Meta app not configured yet</p>
          <p style={{ margin: 0, fontSize: 12.5, color: '#92400e', lineHeight: 1.55 }}>
            Set <code>META_APP_ID</code>, <code>META_APP_SECRET</code> and <code>META_REDIRECT_URI</code> in Vercel, then reload.
            See <code>META_SETUP.md</code> for the full checklist and which permissions to request in App Review.
          </p>
        </div>
      )}

      {/* Connect — one card per way to connect. Side by side on desktop, stacked
          on mobile; the button sits at the foot of each card so they align. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 28 }}>
        {/* Facebook Page (+ linked Instagram) */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: 18, borderRadius: 16, border: '1px solid var(--border)', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: '#1877F2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Facebook &amp; Instagram</p>
              <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--slate)' }}>via a Facebook Page</p>
            </div>
          </div>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5, flex: 1 }}>
            Connect a Facebook Page — its linked Instagram business account comes along automatically.
          </p>
          <a href={configured && companyId ? `${metaRootOrigin}/api/meta/connect?companyId=${companyId}&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}` : undefined}
            onClick={async e => {
              e.preventDefault()
              if (!configured) { setMsg('Configure the Meta app first (see above).'); return }
              const href = setupHref((e.currentTarget as HTMLAnchorElement).href)
              try { window.location.href = await withConnectTicket(href, companyId!, 'meta') } catch (er: any) { setMsg(er.message) }
            }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 16px', borderRadius: 10, background: '#1877F2', color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none', opacity: configured ? 1 : 0.6 }}>
            Connect Facebook &amp; Instagram
          </a>
        </div>

        {/* Instagram Login — direct sign-in, no Page (only when configured) */}
        {igLoginConfigured && (
          <div style={{ display: 'flex', flexDirection: 'column', padding: 18, borderRadius: 16, border: '1px solid var(--border)', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(45deg,#feda75,#d62976,#4f5bd5)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 3.68a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z"/></svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Instagram</p>
                <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--slate)' }}>direct sign-in</p>
              </div>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5, flex: 1 }}>
              Sign in with Instagram — no Facebook Page needed. Best for Instagram-only businesses.
            </p>
            <a href={companyId ? `${igRootOrigin}/api/instagram/connect?companyId=${companyId}&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}` : undefined}
              onClick={async e => {
                e.preventDefault()
                const raw = (e.currentTarget as HTMLAnchorElement).href
                if (!raw || !companyId) return
                try { window.location.href = await withConnectTicket(setupHref(raw), companyId, 'instagram') } catch (er: any) { setMsg(er.message) }
              }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 16px', borderRadius: 10, background: 'linear-gradient(45deg,#feda75,#d62976,#4f5bd5)', color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>
              Connect Instagram directly
            </a>
          </div>
        )}
      </div>

      {(igChannels.length > 0 || igLoginConfigured) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 14, border: '1px solid var(--border)', background: '#fff', marginBottom: 20 }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(45deg,#feda75,#d62976,#4f5bd5)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 3.68a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z"/></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>Apply Instagram theme</p>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>Style Instagram conversations in the inbox to look like Instagram — the signature gradient on your replies and the thread header.</p>
          </div>
          <button type="button" role="switch" aria-checked={!!inboxSettings.instagram_theme}
            onClick={() => setIgTheme(!inboxSettings.instagram_theme)}
            style={{ position: 'relative', width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background .15s', background: inboxSettings.instagram_theme ? 'linear-gradient(45deg,#feda75,#d62976,#4f5bd5)' : '#d1d5db' }}>
            <span style={{ position: 'absolute', top: 3, left: inboxSettings.instagram_theme ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
          </button>
        </div>
      )}

      {fbChannels.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 14, border: '1px solid var(--border)', background: '#fff', marginBottom: 20 }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#00B2FF,#006AFF)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.15.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.35-.09.53-.04 1 .27 2.06.42 3.13.42 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6 7.46l-2.94 4.66c-.47.74-1.47.93-2.18.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.94-4.66c.47-.74 1.47-.93 2.18-.4l2.34 1.75c.21.16.51.16.72 0l3.16-2.4c.42-.32.97.18.69.63z"/></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>Apply Messenger theme</p>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>Style Facebook Messenger conversations in the inbox to look like Messenger — the signature blue on your replies and the thread header.</p>
          </div>
          <button type="button" role="switch" aria-checked={!!inboxSettings.messenger_theme}
            onClick={() => setMsgrTheme(!inboxSettings.messenger_theme)}
            style={{ position: 'relative', width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background .15s', background: inboxSettings.messenger_theme ? 'linear-gradient(135deg,#00B2FF,#006AFF)' : '#d1d5db' }}>
            <span style={{ position: 'absolute', top: 3, left: inboxSettings.messenger_theme ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
          </button>
        </div>
      )}

      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--slate)' }}>Connected accounts</p>
      {channels.length > 0 && (
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.5 }}>
          When you connect a Facebook Page, Colvy subscribes it to Meta’s webhooks automatically, so new Messenger and Instagram messages arrive in your shared inbox. The status under each account is checked live with Meta.
        </p>
      )}
      {channels.length === 0 ? (
        <div style={{ padding: '34px 28px', borderRadius: 14, border: '1px dashed var(--border)', textAlign: 'center', background: 'var(--canvas, #fafafa)' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fff', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>No accounts connected yet</p>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Connect a Facebook Page or an Instagram account above to start receiving DMs in your inbox.</p>
        </div>
      ) : (
        <>
          {[['Facebook Messenger', fbChannels], ['Instagram', igChannels]].map(([title, list]: any) => list.length > 0 && (
            <div key={title} style={{ marginBottom: 22 }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--slate)' }}>{title}</p>
              {list.map((c: any) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 8, background: '#fff', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                      {c.platform === 'instagram' ? (c.ig_username ? `@${c.ig_username}` : 'Instagram account') : c.page_name}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>
                      {c.platform === 'instagram'
                        ? (String(c.page_id || '').startsWith('iglogin:') ? 'via Instagram Login' : `via Page ${c.page_name}`)
                        : `Page ID ${c.page_id}`}
                    </p>
                    {c.last_error && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#dc2626' }}>{c.last_error}</p>}
                  </div>

                  {/* Per-location mapping */}
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 3 }}>Outlet</label>
                    <select value={c.location_id || ''} onChange={e => api({ action: 'map_location', id: c.id, location_id: e.target.value || null })}
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, background: '#fff', minWidth: 150 }}>
                      <option value="">Unassigned</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{locLabel(l)}</option>)}
                    </select>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={c.is_active !== false}
                      onChange={e => api({ action: 'toggle', id: c.id, is_active: e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: 'var(--coral)' }} />
                    <span style={{ fontSize: 12, color: 'var(--ink)' }}>Active</span>
                  </label>

                  <button type="button" onClick={async () => { if (await confirmDialog('Disconnect this account?')) api({ action: 'disconnect', id: c.id }) }}
                    style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Disconnect
                  </button>
                  <WebhookStatus channelId={c.id} active={c.is_active !== false} onChanged={() => companyId && load(companyId)} />
                </div>
              ))}
            </div>
          ))}
          {locations.length === 0 && (
            <p style={{ fontSize: 12.5, color: '#b45309' }}>
              You have no outlets yet — add locations first, then map each connected account to one.
            </p>
          )}
        </>
      )}
    </div>
  )
}
