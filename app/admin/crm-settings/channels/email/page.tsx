'use client'

import { withConnectTicket } from '@/lib/oauth-ticket-client'
import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { confirmDialog } from '@/components/ConfirmDialog'
import { currentSetupReturn } from '@/lib/setup-return'
import { gmailErrorMessage } from '@/lib/gmail-oauth'
import GmailConnectExplainer from '@/components/GmailConnectExplainer'
import BrandLogo from '@/components/BrandLogo'
import { CK_ICON, CkHead, CkStyle, CkToggle } from '@/components/calls/CallKit'
import { SkClose, SkStyle } from '@/components/ui/SheetKit'

// Multi-account email. Ways in:
//   Gmail      — sign in with Google (read + send from the Gmail address).
//   Domain     — mail for an address you own is routed to Colvy by a webhook.
//   Forwarding — any mailbox (Gmail included) forwards to the Colvy address;
//                no Google sign-in, replies go out on Colvy's mail service.
// Each mailbox can belong to an outlet, so every shop has its own inbox.
export default function EmailPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<any[]>([])
  const [rules, setRules] = useState<any[]>([])
  const [signatures, setSignatures] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [forwardingAlias, setForwardingAlias] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  const [addingDomain, setAddingDomain] = useState<any>(null)
  // "Connect a Gmail account" first explains Google's screens (unverified-app
  // warning, two unticked boxes); this holds the outlet it's for.
  const [gmailIntro, setGmailIntro] = useState<{ locationId?: string } | null>(null)
  const [gmailBusy, setGmailBusy] = useState(false)
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
      if (p.get('gmail') === 'error') setMsg(gmailErrorMessage(p.get('reason')))
    })()
  }, [])

  const load = async (cid: string) => {
    const res = await authFetch(`/api/email/accounts?companyId=${cid}`)
    const d = await res.json()
    setAccounts(d.accounts || [])
    setRules(d.rules || [])
    setSignatures(d.signatures || [])
    setLocations(d.locations || [])
    setForwardingAlias(d.forwardingAlias || '')
  }

  const api = async (body: any) => {
    const res = await authFetch('/api/email/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, ...body }),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error || 'Request failed')
    return d
  }

  const connectGmail = async (locationId?: string) => {
    if (!companyId) return
    setGmailBusy(true)
    // From the setup checklist: Google sends them straight back to it.
    const setupBack = currentSetupReturn()
    const returnTo = setupBack ? `${window.location.origin}${setupBack}` : window.location.href.split('?')[0]
    try {
      window.location.href = await withConnectTicket(`https://colvy.com/api/gmail/start?companyId=${companyId}&locationId=${locationId || ''}&returnTo=${encodeURIComponent(returnTo)}`, companyId, 'gmail')
    } catch (e: any) { setGmailBusy(false); setGmailIntro(null); setMsg(e.message) }
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
      setMsg(`Imported ${d.imported} new email${d.imported === 1 ? '' : 's'} from ${a.inbound_address}${d.more ? ' — the inbox is busy, press Sync now again to fetch the rest' : ''}.`)
      if (companyId) await load(companyId)
    } catch (e: any) { setMsg(e.message) } finally { setBusy('') }
  }

  const updateAccount = async (id: string, patch: any) => {
    try { await api({ action: 'update_account', id, ...patch }); if (companyId) await load(companyId) }
    catch (e: any) { setMsg(e.message) }
  }

  const deleteAccount = async (a: any) => {
    if (!await confirmDialog(`Remove ${a.inbound_address} from Colvy? Existing conversations stay, but no new mail will arrive.`)) return
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

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  const FILTERS: [string, string, string][] = [
    ['ignore_noreply', 'Ignore no-reply senders', 'no-reply@, do-not-reply@, mailer-daemon…'],
    ['ignore_newsletters', 'Ignore newsletters & bulk mail', 'Anything with a List-Unsubscribe header'],
    ['ignore_marketing', 'Ignore marketing campaigns', 'Promotional blasts and offers'],
    ['ignore_autoreply', 'Ignore auto-replies', 'Out-of-office and vacation responders'],
  ]
  const SYNC_EVERY: [number, string][] = [[0, 'Off'], [5, '5 min'], [15, '15 min'], [30, '30 min'], [60, 'Hourly']]
  const rulesHere = rulesFor ? rules.filter(r => r.email_channel_id === rulesFor.id) : []

  return (
    <div className="w-full max-w-[1200px] mx-auto md:px-8 py-1 md:py-8 em">
      <CkStyle />
      <style>{EM_CSS}</style>
      <div className="em-head">
        <BrandLogo brand="gmail" size={52} />
        <div className="em-head-t">
          <h1>Email</h1>
          <p>Connect as many mailboxes as you need, one per outlet if you like. Everything lands in your inbox, and replies go back out from the right address.</p>
        </div>
        {accounts.length > 0 && <span className="em-count"><i aria-hidden />{accounts.length} {accounts.length === 1 ? 'mailbox' : 'mailboxes'}</span>}
      </div>

      {msg && <p className="em-msg" role="status">{CK_ICON.info}<span>{msg}</span><button type="button" onClick={() => setMsg('')} aria-label="Dismiss">{CK_ICON.x}</button></p>}

      {/* Add a mailbox: the three ways in, side by side. */}
      <div className="em-ways">
        <button type="button" className="em-way" onClick={() => setGmailIntro({})}>
          <span className="em-way-ic g" aria-hidden>{GOOGLE}</span>
          <b>Connect a Gmail account</b>
          <small>Sign in with Google. Colvy reads and sends from your Gmail address.</small>
          <span className="em-way-go" aria-hidden>{CHEVRON}</span>
        </button>
        <button type="button" className="em-way" onClick={() => setAddingDomain({ ...blankDomain })}>
          <span className="em-way-ic" aria-hidden>{MAIL}</span>
          <b>Add a domain mailbox</b>
          <small>An address on your own domain, with any email host. No Google sign-in.</small>
          <span className="em-way-go" aria-hidden>{CHEVRON}</span>
        </button>
        <button type="button" className="em-way" onClick={() => document.getElementById('email-forwarding')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <span className="em-way-ic f" aria-hidden>{FORWARD}</span>
          <b>Forward email instead</b>
          <small>Keep your mailbox as it is and forward a copy of new mail to Colvy.</small>
          <span className="em-way-go" aria-hidden>{CHEVRON}</span>
        </button>
      </div>

      {gmailIntro && (
        <GmailConnectExplainer
          busy={gmailBusy}
          forwardingAlias={forwardingAlias}
          onContinue={() => connectGmail(gmailIntro.locationId)}
          onCancel={() => { setGmailIntro(null); setGmailBusy(false) }}
          onAddDomain={() => { setGmailIntro(null); setAddingDomain({ ...blankDomain }) }}
          onCopyAlias={() => { navigator.clipboard?.writeText(forwardingAlias); setMsg('Forwarding address copied.') }}
        />
      )}

      {/* Add/edit a domain mailbox */}
      {addingDomain && (
        <section className="ck-card em-add">
          <CkHead icon={MAIL} tone="#ea580c" title="Domain mailbox">
            For an address on a domain you control (e.g. <code>info@roxyaquarium.com.au</code>). Your email provider routes the mail to Colvy. For an <strong>@gmail.com</strong> address, connect Gmail instead, or forward it to your Colvy address (below).
          </CkHead>
          <div className="em-grid">
            <div>
              <label className="ck-lbl" htmlFor="em-in">Inbound address</label>
              <input id="em-in" className="ck-in" value={addingDomain.inbound_address} placeholder="info@roxyaquarium.com.au"
                onChange={e => setAddingDomain({ ...addingDomain, inbound_address: e.target.value })} />
            </div>
            <div>
              <label className="ck-lbl" htmlFor="em-from">Reply-from name</label>
              <input id="em-from" className="ck-in" value={addingDomain.from_name} placeholder="Roxy Aquarium Support"
                onChange={e => setAddingDomain({ ...addingDomain, from_name: e.target.value })} />
            </div>
          </div>
          <p className="ck-hint">The name customers see on your replies. Colvy sets up and manages the sending address for you, so there&rsquo;s nothing to configure or verify.</p>
          {locations.length > 0 && (
            <>
              <label className="ck-lbl" htmlFor="em-loc" style={{ marginTop: 16 }}>Outlet <span className="em-opt">optional</span></label>
              <select id="em-loc" className="ck-in" value={addingDomain.location_id}
                onChange={e => setAddingDomain({ ...addingDomain, location_id: e.target.value })}>
                <option value="">Not tied to an outlet</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.label || l.suburb}</option>)}
              </select>
            </>
          )}
          <div className="ck-foot">
            <button type="button" className="ck-btn" onClick={saveDomain} disabled={busy === 'domain'}>{busy === 'domain' ? 'Saving…' : 'Save mailbox'}</button>
            <button type="button" className="ck-btn ghost" onClick={() => setAddingDomain(null)}>Cancel</button>
          </div>
        </section>
      )}

      {/* Connected mailboxes */}
      <div className="em-sec-h">
        <div>
          <h2>Your mailboxes</h2>
          <p>Choose what comes in, how often it syncs and how replies are signed.</p>
        </div>
      </div>
      {accounts.length === 0 && !addingDomain && (
        <div className="ck-card em-empty">
          <span className="em-way-ic" aria-hidden>{MAIL}</span>
          <b>No mailboxes connected yet</b>
          <span>Pick one of the ways above to bring your email into Colvy.</span>
        </div>
      )}

      {accounts.map(a => {
        const isGmail = a.provider === 'gmail'
        const myRules = rules.filter(r => r.email_channel_id === a.id)
        const fs = a.filter_settings || {}
        const every = Number(a.sync_interval_minutes ?? 5)
        return (
          <section key={a.id} className={`ck-card em-box${a.is_active ? '' : ' paused'}`}>
            <div className="em-box-top">
              <span className={`em-box-ic${isGmail ? ' g' : ''}`} aria-hidden>{isGmail ? GMAIL : MAIL}</span>
              <div className="em-box-t">
                <b>{a.inbound_address}</b>
                <small>
                  {isGmail ? 'Gmail' : 'Domain mailbox'}
                  {a.location_id && locName(a.location_id) ? ` · ${locName(a.location_id)}` : ''}
                  {a.last_synced_at ? ` · synced ${new Date(a.last_synced_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
                </small>
              </div>
              <div className="em-box-acts">
                {isGmail ? (
                  <button type="button" className="ck-btn soft sm" onClick={() => syncGmail(a)} disabled={busy === 'sync-' + a.id}>
                    {SYNC}{busy === 'sync-' + a.id ? 'Syncing…' : 'Sync now'}
                  </button>
                ) : (
                  // Domain mailboxes are push (real-time): nothing to sync, so
                  // say it's live instead of leaving a gap where Sync would be.
                  <span className="em-live" title="Mail arrives in real time, nothing to sync"><i aria-hidden />Live</span>
                )}
                <button type="button" className="ck-btn soft sm" onClick={() => setRulesFor(a)}>Email rules{myRules.length ? <span className="em-n">{myRules.length}</span> : null}</button>
                <button type="button" className="em-active" role="switch" aria-checked={!!a.is_active} onClick={() => updateAccount(a.id, { is_active: !a.is_active })}>
                  <span className="ck-sw" aria-hidden style={{ pointerEvents: 'none' }} data-on={a.is_active ? '1' : '0'} />{a.is_active ? 'Active' : 'Paused'}
                </button>
                <button type="button" className="em-remove" onClick={() => deleteAccount(a)} aria-label={`Remove ${a.inbound_address}`} title="Remove">{TRASH}</button>
              </div>
            </div>

            {a.sync_error && (
              <p className="ck-note">{CK_ICON.warn}<span>{a.sync_error} {isGmail && <button type="button" className="em-link" onClick={() => setGmailIntro({ locationId: a.location_id || undefined })}>Reconnect</button>}</span></p>
            )}

            <div className="em-cols">
              <div>
                {/* Per-mailbox signature, appended to outgoing email. */}
                <label className="ck-lbl" htmlFor={`em-sig-${a.id}`}>Email signature</label>
                <textarea id={`em-sig-${a.id}`} className="ck-in" defaultValue={a.signature || ''} rows={4}
                  onBlur={e => { if (e.target.value !== (a.signature || '')) updateAccount(a.id, { signature: e.target.value }) }}
                  placeholder={'Kind regards,\nRoxy Aquarium\n(03) 1234 5678'} />
                <p className="ck-hint">Added to replies from this mailbox. Saved when you click away.</p>

                <span className="ck-lbl" style={{ marginTop: 18 }}>Auto-sync</span>
                {isGmail ? (
                  <div className="ck-chips" role="radiogroup" aria-label="Auto-sync">
                    {(SYNC_EVERY.some(([v]) => v === every) ? SYNC_EVERY : [...SYNC_EVERY, [every, `${every} min`] as [number, string]]).map(([v, label]) => (
                      <button key={v} type="button" role="radio" aria-checked={every === v} className={`ck-chip${every === v ? ' on' : ''}`} onClick={() => updateAccount(a.id, { sync_interval_minutes: v })}>{label}</button>
                    ))}
                  </div>
                ) : (
                  <p className="ck-hint" style={{ marginTop: 0 }}>Not needed: mail to this address arrives the moment it&rsquo;s sent.</p>
                )}

                {locations.length > 0 && (
                  <>
                    <label className="ck-lbl" htmlFor={`em-out-${a.id}`} style={{ marginTop: 18 }}>Outlet</label>
                    <select id={`em-out-${a.id}`} className="ck-in" value={a.location_id || ''} onChange={e => updateAccount(a.id, { location_id: e.target.value || null })}>
                      <option value="">No outlet</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.label || l.suburb}</option>)}
                    </select>
                  </>
                )}
              </div>

              {/* ── What to let through ─────────────────────────────────────
                  A shared mailbox is mostly newsletters, vendor receipts and
                  auto-replies. Without this, all of it lands in the inbox and
                  buries the actual enquiries. */}
              <div>
                <span className="ck-lbl">Keep the inbox clean</span>
                <CkToggle on={a.sync_all !== false} onChange={v => updateAccount(a.id, { sync_all: v })} title="Bring in all emails"
                  sub={a.sync_all !== false ? 'Every new email comes in, except what the filters below drop.' : 'Only email from existing contacts and allowed senders comes in.'} />
                {FILTERS.map(([key, label, hint]) => (
                  <CkToggle key={key} on={fs[key] !== false} onChange={v => updateAccount(a.id, { filter_settings: { ...fs, [key]: v } })} title={label} sub={hint} />
                ))}
                <p className="ck-hint">A sender you add to the allow list in Email rules always gets through, whatever these say.</p>
              </div>
            </div>
          </section>
        )
      })}

      {/* Email rules */}
      {rulesFor && (
        <div className="sk-scrim" style={{ '--sk-z': 300 } as React.CSSProperties} onClick={() => setRulesFor(null)}>
          <SkStyle />
          <div className="sk" role="dialog" aria-modal="true" aria-labelledby="em-rules-t" style={{ '--sk-w': '560px' } as React.CSSProperties}
            onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setRulesFor(null) }}>
            <div className="sk-head">
              <span className="sk-badge" aria-hidden>{FILTER}</span>
              <div style={{ minWidth: 0 }}>
                <h2 id="em-rules-t">Email rules</h2>
                <p className="sk-sub">Which senders come in, or never do, for <b style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{rulesFor.inbound_address}</b>. Allow brings mail in even from people who aren&rsquo;t contacts; Block drops noisy senders. Block always wins.</p>
              </div>
              <SkClose onClick={() => setRulesFor(null)} />
            </div>

            <span className="sk-lbl">New rule</span>
            <div className="em-rule-new">
              <div className="sk-seg" role="radiogroup" aria-label="Rule type">
                {(['allow', 'block'] as const).map(t => (
                  <button key={t} type="button" role="radio" aria-checked={newRule.rule_type === t} className={newRule.rule_type === t ? 'on' : ''} onClick={() => setNewRule({ ...newRule, rule_type: t })}>{t === 'allow' ? 'Allow' : 'Block'}</button>
                ))}
              </div>
              <input className="sk-in" autoFocus value={newRule.pattern} onChange={e => setNewRule({ ...newRule, pattern: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') addRule() }} placeholder="example.com or user@example.com" aria-label="Domain or address" />
              <button type="button" className="sk-btn primary sm" onClick={addRule} disabled={busy === 'rule' || !newRule.pattern.trim()}>Add</button>
            </div>
            <p className="sk-note">A domain (<code>example.com</code>) or a full address (<code>noreply@example.com</code>).</p>

            <span className="sk-lbl">Rules{rulesHere.length ? ` (${rulesHere.length})` : ''}</span>
            {rulesHere.length === 0 ? (
              <p className="sk-card" style={{ margin: 0, fontSize: 13.5, color: 'var(--sk-muted)', textAlign: 'center' }}>No rules yet. Add one above to control which senders sync into Colvy.</p>
            ) : (
              <div>
                {rulesHere.map(r => (
                  <div key={r.id} className={`sk-item em-rule${r.is_enabled ? '' : ' off'}`}>
                    <span className={`em-rule-k ${r.rule_type}`}>{r.rule_type === 'allow' ? 'Allow' : 'Block'}</span>
                    <div className="sk-item-t"><b>{r.pattern}</b></div>
                    <button type="button" role="switch" aria-checked={!!r.is_enabled} aria-label={`${r.is_enabled ? 'Turn off' : 'Turn on'} ${r.pattern}`} className="em-sw"
                      onClick={async () => { await api({ action: 'toggle_rule', id: r.id, is_enabled: !r.is_enabled }); if (companyId) await load(companyId) }} />
                    <button type="button" className="sk-icon-btn danger" aria-label={`Delete ${r.pattern}`}
                      onClick={async () => { await api({ action: 'delete_rule', id: r.id }); if (companyId) await load(companyId) }}>{TRASH}</button>
                  </div>
                ))}
              </div>
            )}
            <div className="sk-actions">
              <button type="button" className="sk-btn" onClick={() => setRulesFor(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Signatures */}
      <div className="em-sec-h em-sec-gap">
        <div>
          <h2>Email signatures</h2>
          <p>Reusable sign-offs your team can pick when replying.</p>
        </div>
        <button type="button" className="em-add-btn" onClick={() => setSigEditing({ name: '', body: '', email_channel_id: '' })}>{PLUS}Add signature</button>
      </div>

      {sigEditing && (
        <section className="ck-card">
          <div className="em-grid">
            <div>
              <label className="ck-lbl" htmlFor="em-sig-name">Name</label>
              <input id="em-sig-name" className="ck-in" value={sigEditing.name} placeholder="Roxy Aquarium — Support"
                onChange={e => setSigEditing({ ...sigEditing, name: e.target.value })} />
            </div>
            {accounts.length > 0 && (
              <div>
                <label className="ck-lbl" htmlFor="em-sig-use">Use with</label>
                <select id="em-sig-use" className="ck-in" value={sigEditing.email_channel_id || ''}
                  onChange={e => setSigEditing({ ...sigEditing, email_channel_id: e.target.value })}>
                  <option value="">All mailboxes</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.inbound_address}</option>)}
                </select>
              </div>
            )}
          </div>
          <label className="ck-lbl" htmlFor="em-sig-body" style={{ marginTop: 16 }}>Signature</label>
          <textarea id="em-sig-body" className="ck-in" rows={4} value={sigEditing.body}
            placeholder={'Kind regards,\nThe Roxy Aquarium team\n(03) 1234 5678'}
            onChange={e => setSigEditing({ ...sigEditing, body: e.target.value })} />
          <div className="ck-foot">
            <button type="button" className="ck-btn" onClick={saveSignature}>Save signature</button>
            <button type="button" className="ck-btn ghost" onClick={() => setSigEditing(null)}>Cancel</button>
          </div>
        </section>
      )}

      {signatures.length === 0 && !sigEditing ? (
        <div className="ck-card em-empty">
          <span className="em-way-ic" aria-hidden>{PEN}</span>
          <b>No email signatures yet</b>
          <span>Add one so every reply ends the same way.</span>
        </div>
      ) : (
        <div className="em-sigs">
          {signatures.map(s => (
            <div key={s.id} className="em-sig">
              <div className="em-sig-top">
                <b>{s.name}</b>
                <span className="em-sig-use">{s.email_channel_id ? (accounts.find(a => a.id === s.email_channel_id)?.inbound_address || 'One mailbox') : 'All mailboxes'}</span>
              </div>
              <p>{s.body}</p>
              <div className="em-sig-acts">
                <button type="button" className="ck-btn soft sm" onClick={() => setSigEditing({ ...s })}>Edit</button>
                <button type="button" className="em-remove" aria-label={`Delete ${s.name}`} title="Delete"
                  onClick={async () => { await api({ action: 'delete_signature', id: s.id }); if (companyId) await load(companyId) }}>{TRASH}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Forwarding: no Google sign-in, nothing to verify. */}
      <section id="email-forwarding" className="ck-card em-fwd">
        <CkHead icon={FORWARD} tone="#0d9488" title="Forward your email to Colvy">
          Keep your existing mailbox exactly as it is. Add <strong>one forwarding rule</strong>{' '}at your email host so a copy of mail to your support address comes to your Colvy address. No MX or DNS changes and nothing to verify; sending goes through Colvy&rsquo;s own secure mail service.
        </CkHead>
        {forwardingAlias ? (
          <>
            <span className="ck-lbl">Your Colvy forwarding address</span>
            <div className="em-alias">
              <code>{forwardingAlias}</code>
              <button type="button" className="ck-btn sm" onClick={() => { navigator.clipboard?.writeText(forwardingAlias); setMsg('Forwarding address copied.') }}>{COPY}Copy</button>
            </div>
            <div className="em-how">
              <div>
                <b>Gmail</b>
                <span>Settings, See all settings, Forwarding and POP/IMAP, Add a forwarding address, then paste this address. Google emails a code to it, which shows up in your Colvy inbox; enter it in Gmail and choose &ldquo;Forward a copy&rdquo;.</span>
              </div>
              <div>
                <b>Outlook / Microsoft 365</b>
                <span>Settings, Mail, Forwarding, then paste this address and save.</span>
              </div>
            </div>
            <p className="ck-hint">Set your support address (e.g. <code>info@roxyaquarium.com.au</code>) to forward here. Customers&rsquo; replies already come straight back to the right ticket; this is only for brand-new emails they send to your address.</p>
          </>
        ) : (
          <p className="ck-note info" style={{ marginTop: 0 }}>{CK_ICON.info}<span>Your Colvy forwarding address will appear here once inbound email is switched on for your workspace.</span></p>
        )}
      </section>
    </div>
  )
}

const ic = (d: React.ReactNode, size = 20) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const MAIL = ic(<><rect x="2.5" y="4.5" width="19" height="15" rx="3" /><path d="m3 7 9 6 9-6" /></>)
const FORWARD = ic(<><path d="M15 17l5-5-5-5" /><path d="M4 18v-2a4 4 0 0 1 4-4h12" /></>)
const FILTER = ic(<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z" />, 21)
const PEN = ic(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>)
const SYNC = ic(<><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>, 14)
const COPY = ic(<><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>, 14)
const TRASH = ic(<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />, 16)
const PLUS = ic(<path d="M12 5v14M5 12h14" />, 15)
const CHEVRON = ic(<path d="m9 6 6 6-6 6" />, 18)
const GOOGLE = <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" /><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
const GMAIL = <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path fill="#EA4335" d="M12 12.7 2.4 6.2A2 2 0 0 1 4 5.4h16a2 2 0 0 1 1.6.8L12 12.7z" /><path fill="#C5221F" d="M2 7.6v9a2 2 0 0 0 2 2h2V10L2 7.6z" /><path fill="#34A853" d="M18 18.6h2a2 2 0 0 0 2-2v-9L18 10v8.6z" /><path fill="#4285F4" d="M6 18.6h12V10l-6 4.3L6 10z" opacity=".9" /></svg>

const EM_CSS = `
.em{--ck-fill:#f4f4f5;--ck-fill-2:#ececef;--ck-soft:#f7f7f8;--ck-muted:#71717a;--ck-line:#f0f0f2}
[data-theme="dark"] .em{--ck-fill:#2a2a2e;--ck-fill-2:#333337;--ck-soft:#242428;--ck-muted:#9a9aa0;--ck-line:#2c2c31}
.em-head{display:flex;align-items:center;gap:16px;margin-bottom:22px}
.em-head-t{flex:1;min-width:0}
.em-head h1{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:clamp(26px,3vw,32px);font-weight:700;letter-spacing:-.04em;line-height:1.1;color:var(--ink)}
.em-head p{margin:5px 0 0;font-size:14.5px;line-height:1.5;color:#71717a;max-width:720px}
.em-count{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:13px;font-weight:650;white-space:nowrap}
.em-count i{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px color-mix(in srgb,#22c55e 25%,transparent)}
.em-msg{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:11px 14px;border-radius:16px;background:color-mix(in srgb,var(--coral) 9%,var(--card,#fff));font-size:13.5px;color:var(--ink)}
.em-msg span{flex:1;min-width:0}
.em-msg svg{flex-shrink:0;color:var(--coral)}
.em-msg button{display:inline-flex;padding:4px;border:0;background:none;color:#71717a;cursor:pointer}
.em button::before{display:none!important}
.em-ways{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;margin-bottom:22px}
.em-way{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:18px 44px 18px 18px;border:0;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);font:inherit;text-align:left;cursor:pointer;transition:box-shadow .2s,transform .2s}
.em-way:hover{box-shadow:0 0 0 1.5px color-mix(in srgb,var(--coral) 50%,transparent),0 12px 28px -16px rgba(16,24,40,.25);transform:translateY(-1px)}
.em-way b{margin-top:8px;font-size:15px;font-weight:650;color:var(--ink)}
.em-way small{font-size:13px;line-height:1.5;color:#71717a}
.em-way-go{position:absolute;top:18px;right:16px;color:#a1a1aa;transition:transform .2s,color .2s}
.em-way:hover .em-way-go{transform:translateX(2px);color:var(--coral)}
.em-way-ic{width:44px;height:44px;flex-shrink:0;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:#fff7ed;color:#ea580c}
.em-way-ic.g{background:#f4f4f5}
.em-way-ic.f{background:#f0fdfa;color:#0d9488}
.em-sec-h{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:6px 0 14px}
.em-sec-h h2{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:21px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.em-sec-h p{margin:3px 0 0;font-size:13.5px;color:#71717a}
.em-sec-gap{margin-top:34px}
.em-add-btn{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 18px;border:0;border-radius:999px;background:var(--ink);color:var(--card,#fff);font:inherit;font-size:13.5px;font-weight:650;cursor:pointer}
.em-add-btn:hover{filter:brightness(1.15)}
.em-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px}
.em-opt{font-weight:400;color:#71717a}
.em-add code,.em-fwd code{font-size:12.5px;padding:1px 6px;border-radius:6px;background:var(--ck-fill)}
.em-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:34px 20px;text-align:center}
.em-empty b{margin-top:6px;font-size:15.5px;font-weight:650;color:var(--ink)}
.em-empty span:last-child{font-size:13.5px;color:#71717a}
.em-box.paused .em-box-top,.em-box.paused .em-cols{opacity:.6}
.em-box-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.em-box-ic{width:48px;height:48px;flex-shrink:0;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;background:#fff7ed;color:#ea580c}
.em-box-ic.g{background:#fef2f2}
.em-box-t{flex:1 1 220px;min-width:0}
.em-box-t b{display:block;font-family:var(--font-display),-apple-system,sans-serif;font-size:18px;font-weight:700;letter-spacing:-.02em;color:var(--ink);overflow-wrap:anywhere}
.em-box-t small{display:block;margin-top:3px;font-size:13px;color:#71717a}
.em-box-acts{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.em-n{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--ink);color:var(--card,#fff);font-size:11.5px;font-weight:700}
.em-live{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:13px;font-weight:650}
.em-live i{width:7px;height:7px;border-radius:50%;background:#22c55e;animation:emPulse 2s ease-in-out infinite}
.em-active{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px 0 8px;border:0;border-radius:999px;background:var(--ck-fill);font:inherit;font-size:13px;font-weight:650;color:var(--ink);cursor:pointer}
.em-active .ck-sw{width:34px;height:20px;margin:0}
.em-active .ck-sw::after{top:2px;left:2px;width:16px;height:16px}
.em-active .ck-sw[data-on="1"]{background:var(--coral)}
.em-active .ck-sw[data-on="1"]::after{transform:translateX(14px)}
.em-remove{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:0;border-radius:999px;background:transparent;color:#a1a1aa;cursor:pointer}
.em-remove:hover{background:#fef2f2;color:#dc2626}
.em-link{padding:0;border:0;background:none;font:inherit;font-weight:700;color:inherit;text-decoration:underline;cursor:pointer}
.em-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;margin-top:4px}
.em-cols .ck-row{padding:12px 14px}
.em-cols .ck-row+.ck-row{margin-top:6px}
.em-rule-new{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.em-rule-new .sk-seg{flex:0 0 170px}
.em-rule-new .sk-in{flex:1 1 200px;width:auto}
.em-rule .sk-item-t b{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13.5px;font-weight:600}
.em-rule.off .sk-item-t,.em-rule.off .em-rule-k{opacity:.5}
.em-rule-k{padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700}
.em-rule-k.allow{background:#dcfce7;color:#15803d}
.em-rule-k.block{background:#fee2e2;color:#dc2626}
.em-sw{position:relative;flex-shrink:0;width:36px;height:22px;padding:0;border:0;border-radius:999px;background:#d4d4d8;cursor:pointer;transition:background .2s}
.em-sw::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s}
.sk .em-sw[aria-checked="true"]{background:var(--coral)}
.em-sw[aria-checked="true"]::after{transform:translateX(14px)}
.em-sigs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.em-sig{display:flex;flex-direction:column;gap:8px;min-width:0;padding:18px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.em-sig-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.em-sig-top b{font-size:15px;font-weight:650;color:var(--ink)}
.em-sig-use{padding:3px 10px;border-radius:999px;background:#f4f4f5;font-size:12px;font-weight:600;color:#52525b;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.em-sig p{flex:1;margin:0;padding:12px 14px;border-radius:14px;background:#f7f7f8;font-size:13.5px;line-height:1.55;color:#3f3f46;white-space:pre-wrap;overflow-wrap:anywhere}
.em-sig-acts{display:flex;align-items:center;justify-content:space-between}
.em-fwd{margin-top:34px}
.em-alias{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 6px 6px 16px;border-radius:18px;background:var(--ck-fill)}
.em-alias code{flex:1 1 220px;min-width:0;padding:0!important;background:none!important;font-size:14.5px!important;font-weight:600;color:var(--ink);word-break:break-all}
.em-how{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:10px;margin-top:14px}
.em-how>div{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border-radius:18px;background:var(--ck-soft)}
.em-how b{font-size:13.5px;font-weight:650;color:var(--ink)}
.em-how span{font-size:13px;line-height:1.55;color:#71717a}
[data-theme="dark"] .em-head p,[data-theme="dark"] .em-sec-h p,[data-theme="dark"] .em-way small,[data-theme="dark"] .em-box-t small,[data-theme="dark"] .em-how span{color:#a1a1aa}
[data-theme="dark"] .em-way-ic,[data-theme="dark"] .em-box-ic{background:rgba(234,88,12,.16);color:#fdba74}
[data-theme="dark"] .em-way-ic.g{background:#2a2a2e}
[data-theme="dark"] .em-way-ic.f{background:rgba(13,148,136,.18);color:#5eead4}
[data-theme="dark"] .em-box-ic.g{background:rgba(234,67,53,.14)}
[data-theme="dark"] .em-sig-use{background:#2a2a2e;color:#d4d4d8}
[data-theme="dark"] .em-sig p{background:#242428;color:#d4d4d8}
@keyframes emPulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}50%{box-shadow:0 0 0 4px rgba(34,197,94,0)}}
@media (max-width:820px){.em-cols{grid-template-columns:minmax(0,1fr)}}
@media (max-width:560px){.em-head{gap:12px}.em-box-top{gap:12px}.em-box-acts{width:100%}}
@media (prefers-reduced-motion:reduce){.em-live i{animation:none}.em-way,.em-way-go{transition:none}}
`
