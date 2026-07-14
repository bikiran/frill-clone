'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Multi-account email. Two kinds of mailbox:
//   Gmail   — sign in with Google. The ONLY way to use an @gmail.com address.
//   Domain  — mail for an address you own is routed to Colvy by a webhook.
// Each mailbox can belong to an outlet, so every shop has its own inbox.
export default function EmailPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<any[]>([])
  const [rules, setRules] = useState<any[]>([])
  const [signatures, setSignatures] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  const [addingDomain, setAddingDomain] = useState<any>(null)
  const [rulesFor, setRulesFor] = useState<any>(null)
  const [newRule, setNewRule] = useState({ rule_type: 'allow', pattern: '' })
  const [sigEditing, setSigEditing] = useState<any>(null)

  const blankDomain = { inbound_address: '', from_address: '', from_name: '', location_id: '', is_active: true, sync_all: true }

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      let cid: string | null = null
      const { data: owned } = await (supabase as any).from('companies').select('id').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      cid = owned?.[0]?.id || null
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      setCompanyId(cid)
      if (cid) await load(cid)
      setLoading(false)

      const p = new URLSearchParams(window.location.search)
      if (p.get('gmail') === 'connected') setMsg(`Connected ${p.get('address') || 'your Gmail account'}.`)
      if (p.get('gmail') === 'error') setMsg('Google connection failed: ' + (p.get('reason') || 'unknown'))
    })()
  }, [])

  const load = async (cid: string) => {
    const res = await fetch(`/api/email/accounts?companyId=${cid}`)
    const d = await res.json()
    setAccounts(d.accounts || [])
    setRules(d.rules || [])
    setSignatures(d.signatures || [])
    setLocations(d.locations || [])
  }

  const api = async (body: any) => {
    const res = await fetch('/api/email/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, ...body }),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error || 'Request failed')
    return d
  }

  const connectGmail = (locationId?: string) => {
    if (!companyId) return
    const returnTo = window.location.href.split('?')[0]
    window.location.href = `https://colvy.com/api/gmail/start?companyId=${companyId}&locationId=${locationId || ''}&returnTo=${encodeURIComponent(returnTo)}`
  }

  const saveDomain = async () => {
    if (!addingDomain?.inbound_address?.trim()) { setMsg('Enter an inbound address.'); return }
    setBusy('domain')
    try {
      await api({ action: 'save_webhook', ...addingDomain, location_id: addingDomain.location_id || null })
      setAddingDomain(null); setMsg('Mailbox saved.')
      if (companyId) await load(companyId)
    } catch (e: any) { setMsg(e.message) } finally { setBusy('') }
  }

  const syncGmail = async (a: any) => {
    setBusy('sync-' + a.id)
    try {
      const d = await api({ action: 'sync', id: a.id })
      setMsg(`Imported ${d.imported} new email${d.imported === 1 ? '' : 's'} from ${a.inbound_address}.`)
      if (companyId) await load(companyId)
    } catch (e: any) { setMsg(e.message) } finally { setBusy('') }
  }

  const updateAccount = async (id: string, patch: any) => {
    try { await api({ action: 'update_account', id, ...patch }); if (companyId) await load(companyId) }
    catch (e: any) { setMsg(e.message) }
  }

  const deleteAccount = async (a: any) => {
    if (!confirm(`Remove ${a.inbound_address} from Colvy? Existing conversations stay, but no new mail will arrive.`)) return
    try { await api({ action: 'delete_account', id: a.id }); if (companyId) await load(companyId) }
    catch (e: any) { setMsg(e.message) }
  }

  const addRule = async () => {
    if (!newRule.pattern.trim()) { setMsg('Enter a domain or email address.'); return }
    setBusy('rule')
    try {
      await api({ action: 'add_rule', email_channel_id: rulesFor.id, ...newRule })
      setNewRule({ rule_type: 'allow', pattern: '' })
      if (companyId) await load(companyId)
    } catch (e: any) { setMsg(e.message) } finally { setBusy('') }
  }

  const saveSignature = async () => {
    if (!sigEditing?.name?.trim() || !sigEditing?.body?.trim()) { setMsg('Signature needs a name and body.'); return }
    try {
      await api({ action: 'save_signature', id: sigEditing.id, name: sigEditing.name, sigBody: sigEditing.body, email_channel_id: sigEditing.email_channel_id || null })
      setSigEditing(null)
      if (companyId) await load(companyId)
    } catch (e: any) { setMsg(e.message) }
  }

  const locName = (id: string) => {
    const l = locations.find(x => x.id === id)
    return l ? (l.label || l.suburb) : null
  }

  const L: any = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const I: any = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  const webhookUrl = 'https://colvy.com/api/webhooks/email'

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Email</h1>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 20px' }}>
        Connect as many mailboxes as you need — one per outlet if you like. Everything lands in your inbox, and replies go back out from the right address.
      </p>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', fontSize: 13, marginBottom: 16 }}>{msg}</div>}

      {/* Add a mailbox */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => connectGmail()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Connect a Gmail account
        </button>
        <button onClick={() => setAddingDomain({ ...blankDomain })}
          style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          + Add a domain mailbox
        </button>
      </div>

      {/* Add/edit a domain mailbox */}
      {addingDomain && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: '#fff', marginBottom: 20 }}>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Domain mailbox</p>
          <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.5 }}>
            For an address on a domain you control (e.g. <code>info@roxyaquarium.com.au</code>). Your email provider routes the mail to Colvy. For an <strong>@gmail.com</strong> address, use &ldquo;Connect a Gmail account&rdquo; instead — a webhook can&rsquo;t receive Gmail.
          </p>

          <label style={L}>Inbound address</label>
          <input style={I} value={addingDomain.inbound_address}
            placeholder="info@roxyaquarium.com.au"
            onChange={e => setAddingDomain({ ...addingDomain, inbound_address: e.target.value })} />

          <label style={L}>Reply-from address <span style={{ fontWeight: 400, color: 'var(--slate)' }}>(must be on a domain verified in Resend)</span></label>
          <input style={I} value={addingDomain.from_address}
            placeholder="support@updates.colvy.com"
            onChange={e => setAddingDomain({ ...addingDomain, from_address: e.target.value })} />

          <label style={L}>Reply-from name</label>
          <input style={I} value={addingDomain.from_name}
            placeholder="Roxy Aquarium Support"
            onChange={e => setAddingDomain({ ...addingDomain, from_name: e.target.value })} />

          {locations.length > 0 && (
            <>
              <label style={L}>Outlet <span style={{ fontWeight: 400, color: 'var(--slate)' }}>— optional</span></label>
              <select style={I} value={addingDomain.location_id}
                onChange={e => setAddingDomain({ ...addingDomain, location_id: e.target.value })}>
                <option value="">Not tied to an outlet</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.label || l.suburb}</option>)}
              </select>
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveDomain} disabled={busy === 'domain'}
              style={{ padding: '10px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {busy === 'domain' ? 'Saving…' : 'Save mailbox'}
            </button>
            <button onClick={() => setAddingDomain(null)}
              style={{ padding: '10px 20px', borderRadius: 9, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Connected mailboxes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {accounts.length === 0 && !addingDomain && (
          <p style={{ fontSize: 14, color: 'var(--slate)', textAlign: 'center', padding: 30 }}>No mailboxes connected yet.</p>
        )}

        {accounts.map(a => {
          const isGmail = a.provider === 'gmail'
          const myRules = rules.filter(r => r.email_channel_id === a.id)
          return (
            <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: '#fff', opacity: a.is_active ? 1 : 0.65 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: isGmail ? '#fee' : 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isGmail ? (
                    <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 12.7 2.4 6.2A2 2 0 0 1 4 5.4h16a2 2 0 0 1 1.6.8L12 12.7z"/><path fill="#C5221F" d="M2 7.6v9a2 2 0 0 0 2 2h2V10L2 7.6z"/><path fill="#34A853" d="M18 18.6h2a2 2 0 0 0 2-2v-9L18 10v8.6z"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{a.inbound_address}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>
                    {isGmail ? 'Gmail' : 'Domain mailbox'}
                    {a.location_id && locName(a.location_id) ? ` · ${locName(a.location_id)}` : ''}
                    {a.last_synced_at ? ` · synced ${new Date(a.last_synced_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  {isGmail && (
                    <button onClick={() => syncGmail(a)} disabled={busy === 'sync-' + a.id}
                      style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--coral)', background: 'var(--peach)', color: 'var(--coral)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {busy === 'sync-' + a.id ? 'Syncing…' : 'Sync now'}
                    </button>
                  )}
                  <button onClick={() => setRulesFor(a)}
                    style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>
                    Email rules{myRules.length ? ` (${myRules.length})` : ''}
                  </button>
                  <button onClick={() => updateAccount(a.id, { is_active: !a.is_active })}
                    style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: a.is_active ? '#15803d' : 'var(--slate)' }}>
                    {a.is_active ? 'Active' : 'Paused'}
                  </button>
                  <button onClick={() => deleteAccount(a)}
                    style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#dc2626' }}>Remove</button>
                </div>
              </div>

              {a.sync_error && (
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 10px' }}>
                  {a.sync_error} {isGmail && <button onClick={() => connectGmail(a.location_id)} style={{ background: 'none', border: 'none', color: '#b45309', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Reconnect</button>}
                </p>
              )}

              {/* ── What to let through ─────────────────────────────────────
                  A shared mailbox is mostly newsletters, vendor receipts and
                  auto-replies. Without this, all of it lands in the inbox and
                  buries the actual enquiries. */}
              <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--slate)' }}>Keep the inbox clean</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {([
                    ['ignore_noreply', 'Ignore no-reply senders', 'no-reply@, do-not-reply@, mailer-daemon…'],
                    ['ignore_newsletters', 'Ignore newsletters & bulk mail', 'anything with a List-Unsubscribe header'],
                    ['ignore_marketing', 'Ignore marketing campaigns', 'promotional blasts and offers'],
                    ['ignore_autoreply', 'Ignore auto-replies', 'out-of-office and vacation responders'],
                  ] as [string, string, string][]).map(([key, label, hint]) => {
                    const fs = a.filter_settings || {}
                    const on = fs[key] !== false
                    return (
                      <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={on}
                          onChange={e => updateAccount(a.id, { filter_settings: { ...fs, [key]: e.target.checked } })}
                          style={{ width: 15, height: 15, accentColor: 'var(--coral)', marginTop: 1, flexShrink: 0 }} />
                        <span>
                          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)' }}>{label}</span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--slate)' }}>{hint}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                <p style={{ margin: '9px 0 0', fontSize: 11, color: 'var(--slate)', lineHeight: 1.5 }}>
                  A sender you add to the allow list always gets through, whatever these say.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <input type="checkbox" checked={a.sync_all !== false}
                    onChange={e => updateAccount(a.id, { sync_all: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: 'var(--coral)' }} />
                  <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>Bring in all emails</span>
                </label>

                {/* Auto-sync interval. Mail used to arrive ONLY when someone
                    pressed "Sync now", so customer email sat unseen in Gmail. */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>Auto-sync</span>
                  <select value={String(a.sync_interval_minutes ?? 5)}
                    onChange={e => updateAccount(a.id, { sync_interval_minutes: Number(e.target.value) })}
                    style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12.5, background: '#fff' }}>
                    <option value="0">Off</option>
                    <option value="5">Every 5 min</option>
                    <option value="15">Every 15 min</option>
                    <option value="30">Every 30 min</option>
                    <option value="60">Hourly</option>
                  </select>
                </label>

                {locations.length > 0 && (
                  <select value={a.location_id || ''}
                    onChange={e => updateAccount(a.id, { location_id: e.target.value || null })}
                    style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12.5, background: '#fff' }}>
                    <option value="">No outlet</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.label || l.suburb}</option>)}
                  </select>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Email rules modal */}
      {rulesFor && (
        <div onClick={() => setRulesFor(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 620, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 24 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: 'var(--coral)' }}>Email rules</h2>
            <p style={{ margin: '0 0 6px', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>
              Choose which senders sync — or never sync — for <strong>{rulesFor.inbound_address}</strong>. Use <span style={{ color: '#15803d', fontWeight: 700 }}>Allow</span> to bring emails in even when the sender isn&rsquo;t a contact, and <span style={{ color: '#dc2626', fontWeight: 700 }}>Block</span> to drop noisy senders. <strong>Block always wins.</strong>
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--slate)' }}>
              Each rule takes a domain (<code>example.com</code>) or a full address (<code>noreply@example.com</code>).
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: 'var(--canvas)', borderRadius: 8, padding: 3 }}>
                {(['allow', 'block'] as const).map(t => (
                  <button key={t} onClick={() => setNewRule({ ...newRule, rule_type: t })}
                    style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: newRule.rule_type === t ? '#fff' : 'transparent', color: newRule.rule_type === t ? 'var(--ink)' : 'var(--slate)', fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize', boxShadow: newRule.rule_type === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                    {t}
                  </button>
                ))}
              </div>
              <input value={newRule.pattern} onChange={e => setNewRule({ ...newRule, pattern: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') addRule() }}
                placeholder="example.com or user@example.com"
                style={{ flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5 }} />
              <button onClick={addRule} disabled={busy === 'rule'}
                style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Add rule</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rules.filter(r => r.email_channel_id === rulesFor.id).length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'center', padding: 24 }}>
                  No rules yet. Add one above to control which senders sync into Colvy.
                </p>
              )}
              {rules.filter(r => r.email_channel_id === rulesFor.id).map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: r.is_enabled ? '#fff' : 'var(--canvas)' }}>
                  <code style={{ fontSize: 13, color: 'var(--ink)' }}>{r.pattern}</code>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 5, background: r.rule_type === 'allow' ? '#dcfce7' : '#fee2e2', color: r.rule_type === 'allow' ? '#15803d' : '#dc2626' }}>{r.rule_type}</span>
                    <button onClick={async () => { await api({ action: 'toggle_rule', id: r.id, is_enabled: !r.is_enabled }); if (companyId) await load(companyId) }}
                      style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', color: r.is_enabled ? '#15803d' : 'var(--slate)' }}>
                      {r.is_enabled ? 'On' : 'Off'}
                    </button>
                    <button onClick={async () => { await api({ action: 'delete_rule', id: r.id }); if (companyId) await load(companyId) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, padding: 0 }}>×</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setRulesFor(null)}
                style={{ padding: '9px 22px', borderRadius: 9, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Signatures */}
      <div style={{ marginTop: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Email signatures</h2>
          <button onClick={() => setSigEditing({ name: '', body: '', email_channel_id: '' })}
            style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add signature</button>
        </div>

        {sigEditing && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: '#fff', marginBottom: 12 }}>
            <label style={L}>Name</label>
            <input style={I} value={sigEditing.name} placeholder="Roxy Aquarium — Support"
              onChange={e => setSigEditing({ ...sigEditing, name: e.target.value })} />
            <label style={L}>Signature</label>
            <textarea style={{ ...I, minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }} value={sigEditing.body}
              placeholder={'Kind regards,\nThe Roxy Aquarium team\n(03) 1234 5678'}
              onChange={e => setSigEditing({ ...sigEditing, body: e.target.value })} />
            {accounts.length > 0 && (
              <>
                <label style={L}>Use with</label>
                <select style={I} value={sigEditing.email_channel_id || ''}
                  onChange={e => setSigEditing({ ...sigEditing, email_channel_id: e.target.value })}>
                  <option value="">All mailboxes</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.inbound_address}</option>)}
                </select>
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveSignature}
                style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
              <button onClick={() => setSigEditing(null)}
                style={{ padding: '9px 18px', borderRadius: 9, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {signatures.length === 0 && !sigEditing ? (
          <p style={{ fontSize: 13.5, color: 'var(--slate)', textAlign: 'center', padding: 24, border: '1px dashed var(--border)', borderRadius: 12 }}>No email signatures yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signatures.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fff' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{s.name}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--slate)', whiteSpace: 'pre-wrap' }}>{s.body}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setSigEditing({ ...s })}
                    style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>Edit</button>
                  <button onClick={async () => { await api({ action: 'delete_signature', id: s.id }); if (companyId) await load(companyId) }}
                    style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#dc2626' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Domain webhook setup */}
      <div style={{ marginTop: 26, border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: 'var(--canvas)' }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>Setting up a domain mailbox</p>
        <p style={{ fontSize: 13, color: 'var(--slate)', margin: '0 0 12px', lineHeight: 1.6 }}>
          For addresses on a domain you own, point your provider&rsquo;s inbound/parse webhook (Resend, Postmark, Mailgun, SendGrid, or Cloudflare Email Routing) at:
        </p>
        <code style={{ display: 'block', padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid var(--border)', fontSize: 13, wordBreak: 'break-all', marginBottom: 12 }}>{webhookUrl}</code>
        <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: 0, lineHeight: 1.6 }}>
          Colvy matches the address the mail was sent <em>to</em> against your mailboxes, so each address routes to the right outlet. <strong>Gmail accounts don&rsquo;t need this</strong> — they sync over OAuth.
        </p>
      </div>
    </div>
  )
}
