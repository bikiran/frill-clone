'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, resolveCompanyUser, readStored, writeStored } from '@/lib/client-cache'
import Link from 'next/link'
import AiBuddy from '@/components/AiBuddy'
import AiChatPreview, { type PreviewMsg } from '@/components/agents/AiChatPreview'

const DEFAULTS = {
  enabled: false,
  auto_reply: false,
  auto_reply_sms: false,
  send_delay: 3,
  handoff_after: 3,
  knowledge: { ideas: true, roadmap: true, announcements: true, help: true, website: false, past_chats: false },
  capabilities: {
    coupon: { enabled: false, max_percent: 10, max_amount_cents: 2000, per_customer_limit: 1, expires_days: 7 },
    doa_claim: { enabled: false },
    create_order: { enabled: false, max_order_cents: 50000 },
  },
}

// Saved settings over the defaults, one level deep for the nested groups.
const withDefaults = (ai: any) => ({ ...DEFAULTS, ...ai,
  knowledge: { ...DEFAULTS.knowledge, ...(ai?.knowledge || {}) },
  capabilities: {
    coupon: { ...DEFAULTS.capabilities.coupon, ...(ai?.capabilities?.coupon || {}) },
    doa_claim: { ...DEFAULTS.capabilities.doa_claim, ...(ai?.capabilities?.doa_claim || {}) },
    create_order: { ...DEFAULTS.capabilities.create_order, ...(ai?.capabilities?.create_order || {}) },
  },
})

// Small controls for the cards below (top level so inputs keep focus).
const Sw = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`ais-sw${on ? ' on' : ''}`} onClick={() => set(!on)}><span /></button>
)
const Step = ({ value, set, min, max, label }: { value: number; set: (v: number) => void; min: number; max: number; label: string }) => (
  <span className="ais-step" role="group" aria-label={label}>
    <button type="button" onClick={() => set(Math.max(min, value - 1))} disabled={value <= min} aria-label="Fewer">−</button>
    <b>{value}</b>
    <button type="button" onClick={() => set(Math.min(max, value + 1))} disabled={value >= max} aria-label="More">+</button>
  </span>
)
const NumField = ({ value, set, min, max, prefix, suffix, label }: { value: number; set: (v: number) => void; min: number; max?: number; prefix?: string; suffix?: string; label: string }) => (
  <label className="ais-num">{prefix && <span>{prefix}</span>}<input type="number" min={min} max={max} value={value} aria-label={label} onChange={e => set(Number(e.target.value))} />{suffix && <span>{suffix}</span>}</label>
)
export default function AiSettingsPage() {
  const [companyId, setCompanyId] = useState<string | null>(peekCompanyUser()?.companyId || null)
  // Last saved settings kept in this browser: the page shows them at once and
  // the fresh copy replaces them (unless you've already started changing things).
  const cached = readStored<{ ai: any; index: any }>(companyId ? `ai-settings:${companyId}` : null)
  const [loading, setLoading] = useState(!cached)
  const [cfg, setCfgState] = useState<any>(cached ? withDefaults(cached.ai) : DEFAULTS)
  // What's saved, to tell when there are changes to save.
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(cached ? withDefaults(cached.ai) : DEFAULTS))
  const edited = useRef(false)
  const setCfg = (v: any) => { edited.current = true; setCfgState(v) }
  const [saving, setSaving] = useState(false)
  const [index, setIndex] = useState<any>(cached?.index || null)
  const [msg, setMsg] = useState('')
  const [diag, setDiag] = useState<any>(null)
  const [checking, setChecking] = useState(false)

  const runCheck = async () => {
    if (!companyId) return
    setChecking(true)
    try {
      // The check asks the AI a question, which can take a while.
      const res = await authFetch(`/api/ai/reply?companyId=${companyId}`, { signal: AbortSignal.timeout(90_000) })
      setDiag(await res.json())
    } catch (e: any) { setDiag({ ok: false, error: e.message }) }
    finally { setChecking(false) }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cid = peekCompanyUser()?.companyId || (await resolveCompanyUser().catch(() => null))?.companyId || null
      if (cancelled) return
      setCompanyId(cid)
      if (!cid) { setLoading(false); return }
      // The settings and the library summary don't depend on each other.
      const [{ data: co }, idx] = await Promise.all([
        (supabase as any).from('companies').select('ai_settings').eq('id', cid).maybeSingle(),
        authFetch(`/api/ai/index-knowledge?companyId=${cid}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      if (cancelled) return
      if (!edited.current) setCfgState(withDefaults(co?.ai_settings || {}))
      setSavedJson(JSON.stringify(withDefaults(co?.ai_settings || {})))
      if (idx) setIndex(idx)
      writeStored(`ai-settings:${cid}`, { ai: co?.ai_settings || {}, index: idx })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    if (!companyId) return
    setSaving(true)
    try {
      const { error } = await (supabase as any).from('companies').update({ ai_settings: cfg }).eq('id', companyId)
      if (error) throw error
      writeStored(`ai-settings:${companyId}`, { ai: cfg, index })
      setSavedJson(JSON.stringify(cfg))
      setMsg('Saved.')
      setTimeout(() => setMsg(''), 2500)
    } catch (e: any) { setMsg(e.message) }
    finally { setSaving(false) }
  }

  const setCap = (key: string, patch: any) =>
    setCfg((c: any) => ({ ...c, capabilities: { ...c.capabilities, [key]: { ...c.capabilities[key], ...patch } } }))

  const dirty = JSON.stringify(cfg) !== savedJson
  const money = (cents: number) => `$${Math.round((cents || 0) / 100).toLocaleString('en-AU')}`
  const coupon = cfg.capabilities.coupon, order = cfg.capabilities.create_order

  // The conversation the preview plays, from the settings as they are now.
  const preview: PreviewMsg[] = (() => {
    const m: PreviewMsg[] = [{ from: 'them', text: 'Hi! Do you deliver to Geelong?' }]
    if (!cfg.enabled) return [...m, { from: 'sys', text: 'Colvy AI is off · this waits for your team' }]
    const auto = !!cfg.auto_reply
    const say = (text: string, note?: string): PreviewMsg => ({ from: auto ? 'ai' : 'draft', text, note })
    const delay = Number(cfg.send_delay ?? 3)
    m.push(say('Yes! We deliver to Geelong on Tuesdays and Fridays, and it’s free over $99.', auto ? (delay ? `Sent after a ${delay}-second countdown your team can stop` : 'Sent straight away') : undefined))
    if (coupon.enabled) {
      m.push({ from: 'them', text: 'Any chance of a discount? 🙏' })
      m.push(say(`I can do ${coupon.max_percent}% off this order (up to ${money(coupon.max_amount_cents)}). Your code is ROXY-7Q2: single use, valid for ${coupon.expires_days} day${coupon.expires_days === 1 ? '' : 's'}.`))
    }
    if (order.enabled) {
      m.push({ from: 'them', text: 'Great, can I order the 4ft tank?' })
      m.push(say('I’ve put together a draft order with your delivery details. The team will check it and send you a payment link.'))
    }
    m.push({ from: 'sys', text: auto ? `After ${cfg.handoff_after} AI ${cfg.handoff_after === 1 ? 'reply' : 'replies'}, your team takes over` : 'Your team sends, edits or dismisses each draft' })
    return m
  })()

  const CAPS: { key: 'coupon' | 'doa_claim' | 'create_order'; title: string; desc: string; tint: string; icon: React.ReactNode }[] = [
    { key: 'coupon', title: 'Issue discount coupons', desc: 'Single-use WooCommerce codes, within your limits.', tint: '#f59e0b', icon: <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01" /> },
    { key: 'doa_claim', title: 'Start DOA claims', desc: 'Checks the order is theirs and sends a photo upload link.', tint: '#ef4444', icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4" /> },
    { key: 'create_order', title: 'Prepare draft orders', desc: 'Builds a pending order for your team to check and charge.', tint: '#3b82f6', icon: <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0" /> },
  ]
  const ico = (d: React.ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  return (
    <div className="ais">
      <style>{AIS_CSS}</style>
      <div className="ais-head">
        <div>
          <h1>AI assistant</h1>
          <p>Let Colvy AI answer customers from your own material and, if you choose, take a few actions for you. Every limit here is enforced by Colvy, not by the AI.</p>
        </div>
      </div>

      <div className="ais-cols">
        <div className="ais-main">
          {/* Master switch */}
          <section className={`ais-card ais-hero${cfg.enabled ? ' on' : ''}`}>
            <div className="ais-hero-top">
              <span className="ais-face"><AiBuddy size={46} /></span>
              <div className="ais-grow">
                <h2>Colvy AI {cfg.enabled ? <span className="ais-pill on">On</span> : <span className="ais-pill">Off</span>}</h2>
                <p>{cfg.enabled ? (cfg.auto_reply ? 'Answers customers on its own and hands over when it isn’t sure.' : 'Writes a draft for your team on every new message.') : 'Nothing happens until you switch it on.'}</p>
              </div>
              <Sw on={!!cfg.enabled} set={v => setCfg({ ...cfg, enabled: v })} label="Enable the AI assistant" />
            </div>

            {cfg.enabled && (
              <div className="ais-rows">
                <div className="ais-row">
                  <div className="ais-grow"><b>Reply on its own</b><span>It answers without waiting for a person and steps aside as soon as someone replies. Every AI message is labelled as AI to the customer.</span></div>
                  <Sw on={!!cfg.auto_reply} set={v => setCfg({ ...cfg, auto_reply: v })} label="Reply to customers automatically" />
                </div>
                {cfg.auto_reply && (
                  <>
                    <div className="ais-row sub">
                      <div className="ais-grow"><b>Also reply to text messages (SMS)</b><span>Website chat is always on. Keyword auto-replies still go first; the AI answers what they don’t.</span></div>
                      <Sw on={!!cfg.auto_reply_sms} set={v => setCfg({ ...cfg, auto_reply_sms: v })} label="Also reply to SMS" />
                    </div>
                    <div className="ais-row sub col">
                      <div className="ais-grow"><b>Countdown before a reply is sent</b><span>Anyone watching the inbox can send it now, edit it or cancel it.</span></div>
                      <div className="ais-seg" role="radiogroup" aria-label="Countdown before a reply is sent">
                        {[[0, 'None'], [3, '3 sec'], [5, '5 sec'], [10, '10 sec']].map(([v, l]) => (
                          <button key={v} type="button" role="radio" aria-checked={Number(cfg.send_delay ?? 3) === v} className={Number(cfg.send_delay ?? 3) === v ? 'on' : ''} onClick={() => setCfg({ ...cfg, send_delay: v })}>{l}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div className="ais-row">
                  <div className="ais-grow"><b>Hand over to a person after</b><span>AI replies in one conversation</span></div>
                  <Step value={Number(cfg.handoff_after) || 1} min={1} max={10} set={v => setCfg({ ...cfg, handoff_after: v })} label="AI replies before handing over" />
                </div>
              </div>
            )}
          </section>

          {cfg.enabled && (
            <>
              {/* Knowledge */}
              <section className="ais-card">
                <div className="ais-sec">
                  <span className="ais-ic" style={{ ['--t' as any]: '#8b5cf6' }}>{ico(<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />)}</span>
                  <div className="ais-grow">
                    <h2>What it learns from</h2>
                    <p>It answers <b>only</b> from your own material. If the answer isn’t there, it says it’s unsure and fetches a person rather than guessing.</p>
                  </div>
                </div>
                <div className="ais-know">
                  <span className="ais-count"><b>{index?.total > 0 ? index.total : 0}</b>{index?.total === 1 ? 'item' : 'items'} in the library{index?.lastIndexedAt ? ` · updated ${new Date(index.lastIndexedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}</span>
                  <Link href="/admin/crm-settings/ai-knowledge" className="ais-btn ghost">Open AI knowledge <span aria-hidden>→</span></Link>
                </div>
              </section>

              {/* Capabilities */}
              <section className="ais-card">
                <div className="ais-sec">
                  <span className="ais-ic" style={{ ['--t' as any]: '#10b981' }}>{ico(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />)}</span>
                  <div className="ais-grow">
                    <h2>What it’s allowed to do</h2>
                    <p>Each limit is enforced by Colvy in code, <b>not by the AI</b>. A customer can’t talk it past them, and every attempt is logged.</p>
                  </div>
                </div>
                <div className="ais-caps">
                  {CAPS.map(c => {
                    const on = !!cfg.capabilities[c.key].enabled
                    return (
                      <div key={c.key} className={`ais-cap${on ? ' on' : ''}`}>
                        <div className="ais-cap-top">
                          <span className="ais-ic sm" style={{ ['--t' as any]: c.tint }}>{ico(c.icon)}</span>
                          <div className="ais-grow"><b>{c.title}</b><span>{c.desc}</span></div>
                          <Sw on={on} set={v => setCap(c.key, { enabled: v })} label={c.title} />
                        </div>
                        {on && c.key === 'coupon' && (
                          <div className="ais-cap-body">
                            <div className="ais-field"><span>Most it can ever offer</span><div className="ais-inline"><NumField value={coupon.max_percent} min={1} max={100} suffix="%" label="Largest discount in percent" set={v => setCap('coupon', { max_percent: v })} /><em>or</em><NumField value={(coupon.max_amount_cents || 0) / 100} min={1} prefix="$" suffix="AUD" label="Largest discount in dollars" set={v => setCap('coupon', { max_amount_cents: Math.round(v * 100) })} /></div></div>
                            <div className="ais-field"><span>Live coupons per customer</span><Step value={coupon.per_customer_limit} min={1} max={5} set={v => setCap('coupon', { per_customer_limit: v })} label="Live coupons per customer" /></div>
                            <div className="ais-field"><span>Expires after</span><NumField value={coupon.expires_days} min={1} max={90} suffix="days" label="Coupon expiry in days" set={v => setCap('coupon', { expires_days: v })} /></div>
                            <p className="ais-hint">Coupons are created in WooCommerce as <b>single-use, one per customer, with an expiry</b>. A request above your limit is refused and logged, never quietly rounded down.</p>
                          </div>
                        )}
                        {on && c.key === 'doa_claim' && (
                          <div className="ais-cap-body"><p className="ais-hint">It asks for the order number, looks it up in WooCommerce, <b>checks the order belongs to that customer</b>, and sends them a private link for photos. It prepares the claim; <b>a person always decides it</b>.</p></div>
                        )}
                        {on && c.key === 'create_order' && (
                          <div className="ais-cap-body">
                            <div className="ais-field"><span>Largest draft it may build</span><NumField value={(order.max_order_cents || 0) / 100} min={1} prefix="$" suffix="AUD" label="Largest draft order in dollars" set={v => setCap('create_order', { max_order_cents: Math.round(v * 100) })} /></div>
                            <p className="ais-hint">It gathers what they want and their delivery details, then creates a <b>draft (pending) order</b>. Prices come from your store, never from the conversation. <b>It can never take payment</b>: a person reviews the draft and sends the payment link.</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* The honest bit */}
              <section className="ais-card ais-know-list">
                <h2>Good to know</h2>
                <ul>
                  <li><b>Every AI message is labelled as AI</b> to the customer, with a note that it can make mistakes. This isn’t optional.</li>
                  <li><b>AI can be wrong.</b> It will sometimes misread a question or miss nuance, so watch the first days closely.</li>
                  <li>It answers <b>only</b> from what you’ve added. Thin content means it hands over a lot; that’s by design.</li>
                  <li>Every action it takes, and every one that was blocked, is recorded.</li>
                </ul>
              </section>
            </>
          )}

          {/* Is it actually working? */}
          <section className="ais-card">
            <div className="ais-sec" style={{ alignItems: 'center' }}>
              <span className="ais-ic" style={{ ['--t' as any]: '#0ea5e9' }}>{ico(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />)}</span>
              <div className="ais-grow">
                <h2>Status check</h2>
                <p>If the AI isn’t replying, this tells you why.</p>
              </div>
              <button type="button" onClick={runCheck} disabled={checking} className="ais-btn ghost">{checking ? 'Checking…' : 'Check now'}</button>
            </div>
            {diag && (
              <div className="ais-diag">
                <p className={`ais-verdict${diag.verdict === 'Everything looks ready.' ? ' ok' : ''}`}>{diag.verdict || diag.error}</p>
                {diag.checks && (
                  <ul className="ais-checks">
                    {[
                      ['Anthropic API key set on the server', diag.checks.anthropic_key_set],
                      ['AI assistant enabled', diag.checks.ai_enabled],
                      ['Auto-reply switched on', diag.checks.auto_reply_on],
                      [`Content indexed (${diag.checks.knowledge_indexed ?? 0} sources)`, (diag.checks.knowledge_indexed ?? 0) > 0],
                    ].map(([label, ok]: any) => (
                      <li key={label} className={ok ? 'ok' : ''}>
                        <span>{ok ? '✓' : '✕'}</span>{label}
                      </li>
                    ))}
                  </ul>
                )}
                {diag.checks?.recent_ai_activity?.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <p className="ais-cap-label">Recent AI activity</p>
                    {diag.checks.recent_ai_activity.slice(0, 6).map((a: any, i: number) => (
                      <div key={i} className="ais-act"><b className={a.blocked_reason ? 'warn' : ''}>{a.action}</b><span>{a.blocked_reason || 'ok'}</span></div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="ais-side">
          <AiChatPreview messages={preview} />
          <p className="ais-side-note">The preview updates as you change things. Nothing is sent.</p>
        </aside>
      </div>

      {/* Save bar: shows when there's something to save. */}
      <div className={`ais-save${dirty || msg ? ' up' : ''}`} role="status">
        <span>{msg || 'You have unsaved changes'}</span>
        {dirty && <button type="button" className="ais-btn ghost" onClick={() => { setCfgState(JSON.parse(savedJson)); edited.current = false }}>Discard</button>}
        {dirty && <button type="button" className="ais-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>}
      </div>
    </div>
  )
}

const AIS_CSS = `
.ais{max-width:1120px;margin:0 auto;padding:26px 24px 120px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.ais button::before{display:none!important}
.ais-head h1{margin:0 0 6px;font-size:28px;font-weight:800;letter-spacing:-.02em;color:#111}
.ais-head p{margin:0 0 22px;max-width:640px;font-size:15px;line-height:1.5;color:#71717a}
.ais-cols{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
.ais-main{display:flex;flex-direction:column;gap:14px;min-width:0}
.ais-side{position:sticky;top:76px}
.ais-side-note{margin:10px 6px 0;font-size:12px;color:#8e8e93;text-align:center}
.ais-card{background:#fff;border-radius:22px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);padding:20px}
.ais-card h2{display:flex;align-items:center;gap:8px;margin:0;font-size:16px;font-weight:700;color:#111;letter-spacing:-.01em}
.ais-card p{margin:3px 0 0;font-size:13.5px;line-height:1.5;color:#71717a}
.ais-card p b{color:#3f3f46}
.ais-grow{flex:1;min-width:0}
.ais-hero-top{display:flex;align-items:center;gap:14px}
.ais-face{width:58px;height:58px;border-radius:18px;background:color-mix(in srgb,var(--coral) 10%,#fff);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:filter .3s}
.ais-hero:not(.on) .ais-face{filter:grayscale(1);opacity:.7}
.ais-pill{padding:2px 9px;border-radius:999px;background:#f4f4f5;color:#71717a;font-size:11.5px;font-weight:700}
.ais-pill.on{background:#dcfce7;color:#15803d}
.ais-rows{margin-top:16px;border-top:1px solid #f0f0f2}
.ais-row{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid #f4f4f5}
.ais-row:last-child{border-bottom:0;padding-bottom:0}
.ais-row.sub{margin-left:18px;padding-left:16px;border-left:2px solid #f0f0f2}
.ais-row.col{flex-wrap:wrap}
.ais-row b,.ais-cap b{display:block;font-size:14px;font-weight:650;color:#111}
.ais-row .ais-grow>span,.ais-cap-top .ais-grow>span{display:block;margin-top:2px;font-size:12.5px;line-height:1.45;color:#71717a}
.ais-sw{position:relative;width:44px;height:26px;border-radius:999px;border:0;background:#d4d4d8;cursor:pointer;flex-shrink:0;transition:background .2s}
.ais-sw span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.ais-sw.on{background:var(--coral)}
.ais-sw.on span{transform:translateX(18px)}
.ais-sw:focus-visible,.ais-seg button:focus-visible,.ais-step button:focus-visible{outline:2px solid var(--coral);outline-offset:2px}
.ais-seg{display:inline-flex;padding:3px;border-radius:999px;background:#f4f4f5}
.ais-seg button{padding:6px 14px;border:0;border-radius:999px;background:none;font:inherit;font-size:13px;font-weight:600;color:#71717a;cursor:pointer;transition:background .2s,color .2s,box-shadow .2s}
.ais-seg button.on{background:#fff;color:#111;box-shadow:0 1px 3px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.04)}
.ais-step{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:#f4f4f5;flex-shrink:0}
.ais-step button{width:30px;height:30px;border:0;border-radius:50%;background:#fff;font:inherit;font-size:16px;font-weight:600;color:#3f3f46;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.ais-step button:disabled{opacity:.4;cursor:default}
.ais-step b{min-width:30px;text-align:center;font-size:14px;font-variant-numeric:tabular-nums}
.ais-sec{display:flex;align-items:flex-start;gap:12px}
.ais-ic{width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--t) 12%,#fff);color:var(--t);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.ais-ic.sm{width:34px;height:34px;border-radius:11px}
.ais-know{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;padding:12px 14px;border-radius:14px;background:#f7f7f8}
.ais-count{font-size:13px;color:#71717a}
.ais-count b{margin-right:6px;font-size:18px;color:#111;font-variant-numeric:tabular-nums}
.ais-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:999px;border:0;background:var(--coral);color:#fff;font:inherit;font-size:13.5px;font-weight:650;text-decoration:none;cursor:pointer;white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12)}
.ais-btn.ghost{background:#fff;color:#18181b;box-shadow:0 0 0 1.5px #e4e4e7}
.ais-btn:disabled{opacity:.6;cursor:default}
.ais-caps{display:flex;flex-direction:column;gap:10px;margin-top:16px}
.ais-cap{border-radius:16px;background:#f7f7f8;padding:14px;transition:background .2s,box-shadow .2s}
.ais-cap.on{background:#fff;box-shadow:0 0 0 1.5px color-mix(in srgb,var(--coral) 45%,#e4e4e7)}
.ais-cap-top{display:flex;align-items:center;gap:12px}
.ais-cap-body{display:flex;flex-direction:column;gap:12px;margin:14px 0 0 46px;animation:aisIn .35s cubic-bezier(.22,1,.36,1) both}
.ais-field{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.ais-field>span{font-size:13.5px;font-weight:600;color:#3f3f46}
.ais-inline{display:flex;align-items:center;gap:8px}
.ais-inline em{font-style:normal;font-size:13px;color:#8e8e93}
.ais-num{display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:40px;border-radius:12px;background:#f4f4f5;font-size:13px;color:#71717a}
.ais-num input{width:64px;border:0;background:none;font:inherit;font-size:14.5px;font-weight:600;color:#111;outline:none;text-align:right}
.ais-num:focus-within{box-shadow:0 0 0 2px color-mix(in srgb,var(--coral) 45%,transparent);background:#fff}
.ais-hint{margin:0!important;padding:10px 12px;border-radius:12px;background:#f7f7f8;font-size:12.5px!important}
.ais-know-list ul{margin:10px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.ais-know-list li{position:relative;padding-left:22px;font-size:13.5px;line-height:1.5;color:#52525b}
.ais-know-list li::before{content:"";position:absolute;left:4px;top:7px;width:7px;height:7px;border-radius:50%;background:var(--coral)}
.ais-know-list li b{color:#18181b}
.ais-diag{margin-top:14px}
.ais-verdict{margin:0 0 12px!important;padding:10px 12px;border-radius:12px;background:#fffbeb;color:#92400e!important;font-weight:600}
.ais-verdict.ok{background:#dcfce7;color:#15803d!important}
.ais-checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ais-checks li{display:flex;align-items:center;gap:8px;font-size:13px;color:#18181b}
.ais-checks li span{width:18px;height:18px;border-radius:50%;background:#fee2e2;color:#dc2626;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
.ais-checks li.ok span{background:#dcfce7;color:#15803d}
.ais-cap-label{margin:0 0 6px!important;font-size:11.5px!important;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.ais-act{display:flex;gap:8px;font-size:12px;color:#71717a}
.ais-act b{min-width:60px;color:#15803d}
.ais-act b.warn{color:#b45309}
.ais-save{position:fixed;left:50%;bottom:22px;z-index:50;display:flex;align-items:center;gap:10px;padding:8px 8px 8px 18px;border-radius:999px;background:#18181b;color:#fff;font-size:13.5px;box-shadow:0 16px 40px rgba(0,0,0,.25);transform:translate(-50%,140%);opacity:0;pointer-events:none;transition:transform .4s cubic-bezier(.22,1,.36,1),opacity .3s}
.ais-save.up{transform:translate(-50%,0);opacity:1;pointer-events:auto}
.ais-save>span{margin-right:6px;white-space:nowrap}
.ais-save .ais-btn.ghost{background:transparent;color:#fff;box-shadow:0 0 0 1.5px rgba(255,255,255,.25)}
@keyframes aisIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (max-width:1100px){.ais-cols{grid-template-columns:minmax(0,1fr)}.ais-side{position:static;order:-1}}
@media (max-width:560px){.ais{padding:20px 16px 120px}.ais-cap-body{margin-left:0}.ais-row.sub{margin-left:4px;padding-left:12px}.ais-save{left:16px;right:16px;transform:translateY(140%)}.ais-save.up{transform:none}.ais-save>span{flex:1;white-space:normal}}
@media (prefers-reduced-motion:reduce){.ais-sw span,.ais-save,.ais-cap-body{transition:none;animation:none}}
`
