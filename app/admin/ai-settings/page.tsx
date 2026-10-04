'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

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

export default function AiSettingsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [cfg, setCfg] = useState<any>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [index, setIndex] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const [diag, setDiag] = useState<any>(null)
  const [checking, setChecking] = useState(false)

  const runCheck = async () => {
    if (!companyId) return
    setChecking(true)
    try {
      const res = await fetch(`/api/ai/reply?companyId=${companyId}`)
      setDiag(await res.json())
    } catch (e: any) { setDiag({ ok: false, error: e.message }) }
    finally { setChecking(false) }
  }

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      let cid: string | null = null
      const { data: owned } = await (supabase as any).from('companies').select('id, ai_settings').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      cid = owned?.[0]?.id || null
      if (owned?.[0]?.ai_settings && Object.keys(owned[0].ai_settings).length) {
        setCfg({ ...DEFAULTS, ...owned[0].ai_settings,
          knowledge: { ...DEFAULTS.knowledge, ...(owned[0].ai_settings.knowledge || {}) },
          capabilities: {
            coupon: { ...DEFAULTS.capabilities.coupon, ...(owned[0].ai_settings.capabilities?.coupon || {}) },
            doa_claim: { ...DEFAULTS.capabilities.doa_claim, ...(owned[0].ai_settings.capabilities?.doa_claim || {}) },
            create_order: { ...DEFAULTS.capabilities.create_order, ...(owned[0].ai_settings.capabilities?.create_order || {}) },
          },
        })
      }
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      setCompanyId(cid)
      if (cid) await loadIndex(cid)
      setLoading(false)
    })()
  }, [])

  const loadIndex = async (cid: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/ai/index-knowledge?companyId=${cid}`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} })
      setIndex(await res.json())
    } catch {}
  }

  const save = async () => {
    if (!companyId) return
    setSaving(true)
    try {
      await (supabase as any).from('companies').update({ ai_settings: cfg }).eq('id', companyId)
      setMsg('Saved.')
      setTimeout(() => setMsg(''), 2500)
    } catch (e: any) { setMsg(e.message) }
    finally { setSaving(false) }
  }

  const setCap = (key: string, patch: any) =>
    setCfg((c: any) => ({ ...c, capabilities: { ...c.capabilities, [key]: { ...c.capabilities[key], ...patch } } }))

  const Card = ({ children }: any) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: '#fff', marginBottom: 16 }}>{children}</div>
  )
  const L: any = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const num: any = { width: 110, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13.5 }

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>AI assistant</h1>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 20px', lineHeight: 1.5 }}>
        Let AI answer customers using your own material — and, if you choose, take a few actions on your behalf. Every limit you set here is enforced by Colvy, not by the AI.
      </p>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', fontSize: 13, marginBottom: 16 }}>{msg}</div>}

      {/* Master switch */}
      <Card>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: cfg.enabled ? 16 : 0 }}>
          <input type="checkbox" checked={!!cfg.enabled}
            onChange={e => setCfg({ ...cfg, enabled: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: 'var(--coral)', marginTop: 2 }} />
          <span>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Enable the AI assistant</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginTop: 2 }}>Nothing happens until you switch this on.</span>
          </span>
        </label>

        {cfg.enabled && (
          <>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <input type="checkbox" checked={!!cfg.auto_reply}
                onChange={e => setCfg({ ...cfg, auto_reply: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--coral)', marginTop: 2 }} />
              <span>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Reply to customers automatically</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginTop: 2 }}>
                  The AI answers without waiting for a person. It steps aside as soon as a human replies, and every AI message is labelled as AI to the customer.
                </span>
              </span>
            </label>

            {cfg.auto_reply && (
              <>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '0 0 16px 28px' }}>
                  <input type="checkbox" checked={!!cfg.auto_reply_sms}
                    onChange={e => setCfg({ ...cfg, auto_reply_sms: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: 'var(--coral)', marginTop: 2 }} />
                  <span>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Also reply to text messages (SMS)</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginTop: 2 }}>Website chat is always on. Keyword auto-replies still go first; the AI answers what they don&rsquo;t.</span>
                  </span>
                </label>

                <label style={L}>Countdown before an AI reply is sent</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <select value={String(cfg.send_delay ?? 3)} onChange={e => setCfg({ ...cfg, send_delay: Number(e.target.value) })}
                    style={{ ...num, width: 'auto', paddingRight: 28 }}>
                    <option value="0">No countdown</option>
                    <option value="3">3 seconds</option>
                    <option value="5">5 seconds</option>
                    <option value="10">10 seconds</option>
                  </select>
                  <span style={{ fontSize: 13, color: 'var(--slate)' }}>Anyone watching the inbox can send it now, edit it or cancel it.</span>
                </div>
              </>
            )}

            <label style={L}>Hand to a person after</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" min={1} max={10} value={cfg.handoff_after}
                onChange={e => setCfg({ ...cfg, handoff_after: Number(e.target.value) })}
                style={num} />
              <span style={{ fontSize: 13, color: 'var(--slate)' }}>AI replies in one conversation</span>
            </div>
          </>
        )}
      </Card>

      {cfg.enabled && (
        <>
          {/* Knowledge */}
          <Card>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>What the AI learns from</p>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.5 }}>
              The AI answers <strong>only</strong> from your own material. If the answer isn&rsquo;t here, it says it&rsquo;s unsure and fetches a person rather than guessing.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/admin/crm-settings/ai-knowledge"
                style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>
                Open AI knowledge
              </Link>
              <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                {index?.total > 0
                  ? `${index.total} item${index.total === 1 ? '' : 's'} in the library${index.lastIndexedAt ? ` · updated ${new Date(index.lastIndexedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}`
                  : 'Choose sources, add facts and files, and test answers there.'}
              </span>
            </div>
          </Card>

          {/* Capabilities */}
          <Card>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>What the AI is allowed to do</p>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.5 }}>
              Each limit below is enforced by Colvy in code — <strong>not by the AI</strong>. A customer can&rsquo;t talk it into exceeding them, and every attempt is logged.
            </p>

            {/* Coupons */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: cfg.capabilities.coupon.enabled ? 14 : 0 }}>
                <input type="checkbox" checked={!!cfg.capabilities.coupon.enabled}
                  onChange={e => setCap('coupon', { enabled: e.target.checked })}
                  style={{ width: 17, height: 17, accentColor: 'var(--coral)' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Issue discount coupons</span>
              </label>

              {cfg.capabilities.coupon.enabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink)', minWidth: 150 }}>Most it can ever offer</span>
                    <input type="number" min={1} max={100} value={cfg.capabilities.coupon.max_percent}
                      onChange={e => setCap('coupon', { max_percent: Number(e.target.value) })} style={num} />
                    <span style={{ fontSize: 13, color: 'var(--slate)' }}>% or</span>
                    <input type="number" min={1} value={(cfg.capabilities.coupon.max_amount_cents || 0) / 100}
                      onChange={e => setCap('coupon', { max_amount_cents: Math.round(Number(e.target.value) * 100) })} style={num} />
                    <span style={{ fontSize: 13, color: 'var(--slate)' }}>AUD</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink)', minWidth: 150 }}>Live coupons per customer</span>
                    <input type="number" min={1} max={5} value={cfg.capabilities.coupon.per_customer_limit}
                      onChange={e => setCap('coupon', { per_customer_limit: Number(e.target.value) })} style={num} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink)', minWidth: 150 }}>Expires after</span>
                    <input type="number" min={1} max={90} value={cfg.capabilities.coupon.expires_days}
                      onChange={e => setCap('coupon', { expires_days: Number(e.target.value) })} style={num} />
                    <span style={{ fontSize: 13, color: 'var(--slate)' }}>days</span>
                  </div>

                  <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', lineHeight: 1.5, background: 'var(--canvas)', padding: 10, borderRadius: 8 }}>
                    Coupons are created in WooCommerce as <strong>single-use, one per customer, with an expiry</strong>. A request above your limit is refused and logged — it is never quietly rounded down.
                  </p>
                </div>
              )}
            </div>

            {/* DOA */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: cfg.capabilities.doa_claim.enabled ? 12 : 0 }}>
                <input type="checkbox" checked={!!cfg.capabilities.doa_claim.enabled}
                  onChange={e => setCap('doa_claim', { enabled: e.target.checked })}
                  style={{ width: 17, height: 17, accentColor: 'var(--coral)' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Start DOA claims</span>
              </label>
              {cfg.capabilities.doa_claim.enabled && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.55, background: 'var(--canvas)', padding: 10, borderRadius: 8 }}>
                  The AI asks for the order number, looks it up in WooCommerce, <strong>checks the order actually belongs to that customer</strong>, and sends them a private upload link for photos. It prepares the claim — <strong>a person always decides it</strong>.
                </p>
              )}
            </div>

            {/* Orders */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: cfg.capabilities.create_order.enabled ? 14 : 0 }}>
                <input type="checkbox" checked={!!cfg.capabilities.create_order.enabled}
                  onChange={e => setCap('create_order', { enabled: e.target.checked })}
                  style={{ width: 17, height: 17, accentColor: 'var(--coral)' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Prepare draft orders</span>
              </label>

              {cfg.capabilities.create_order.enabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink)', minWidth: 150 }}>Largest draft it may build</span>
                    <input type="number" min={1} value={(cfg.capabilities.create_order.max_order_cents || 0) / 100}
                      onChange={e => setCap('create_order', { max_order_cents: Math.round(Number(e.target.value) * 100) })} style={num} />
                    <span style={{ fontSize: 13, color: 'var(--slate)' }}>AUD</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.55, background: 'var(--canvas)', padding: 10, borderRadius: 8 }}>
                    The AI gathers what they want and their delivery details, then creates a <strong>draft (pending) order</strong>. Prices come from your store, never from the conversation. <strong>The AI can never take payment</strong> — a person reviews the draft and sends the payment link.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* The honest bit */}
          <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700, color: '#92400e' }}>Before you switch this on</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#92400e', lineHeight: 1.65 }}>
              <li>Every AI message is <strong>labelled as AI</strong> to the customer, with a note that it can make mistakes. This isn&rsquo;t optional.</li>
              <li><strong>AI can be wrong.</strong> It will occasionally misread a question or miss nuance — watch the first days closely.</li>
              <li>It answers <strong>only</strong> from what you&rsquo;ve indexed. Thin content means it hands off a lot; that&rsquo;s by design, not a bug.</li>
              <li>Every action it takes — and every one that was blocked — is recorded.</li>
            </ul>
          </div>
        </>
      )}

      {/* Is it actually working? */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: '0 0 3px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Status check</p>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>If the AI isn&rsquo;t replying, this tells you why.</p>
          </div>
          <button onClick={runCheck} disabled={checking}
            style={{ padding: '9px 16px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', border: '1px solid var(--coral)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {checking ? 'Checking…' : 'Check now'}
          </button>
        </div>

        {diag && (
          <div style={{ marginTop: 14 }}>
            <p style={{
              margin: '0 0 12px', padding: '10px 12px', borderRadius: 9, fontSize: 13.5, fontWeight: 600, lineHeight: 1.45,
              background: diag.verdict === 'Everything looks ready.' ? '#dcfce7' : '#fffbeb',
              color: diag.verdict === 'Everything looks ready.' ? '#15803d' : '#92400e',
            }}>
              {diag.verdict || diag.error}
            </p>

            {diag.checks && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  ['Anthropic API key set on the server', diag.checks.anthropic_key_set],
                  ['AI assistant enabled', diag.checks.ai_enabled],
                  ['Auto-reply switched on', diag.checks.auto_reply_on],
                  [`Content indexed (${diag.checks.knowledge_indexed ?? 0} sources)`, (diag.checks.knowledge_indexed ?? 0) > 0],
                ].map(([label, ok]: any) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)' }}>
                    <span style={{ color: ok ? '#15803d' : '#dc2626', display: 'inline-flex' }}>
                      {ok ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      )}
                    </span>
                    {label}
                  </div>
                ))}
              </div>
            )}

            {diag.checks?.recent_ai_activity?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: '0 0 6px', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>Recent AI activity</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {diag.checks.recent_ai_activity.slice(0, 6).map((a: any, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--slate)', display: 'flex', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: a.blocked_reason ? '#b45309' : '#15803d', minWidth: 60 }}>{a.action}</span>
                      <span>{a.blocked_reason || 'ok'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <button onClick={save} disabled={saving}
        style={{ padding: '11px 24px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  )
}
