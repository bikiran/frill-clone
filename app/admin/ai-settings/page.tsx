'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DEFAULTS = {
  enabled: false,
  auto_reply: false,
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
  const [indexing, setIndexing] = useState(false)
  const [index, setIndex] = useState<any>(null)
  const [msg, setMsg] = useState('')

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
      const res = await fetch(`/api/ai/index-knowledge?companyId=${cid}`)
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

  const reindex = async () => {
    if (!companyId) return
    setIndexing(true); setMsg('')
    try {
      // Save first, so the indexer honours the sources just ticked.
      await (supabase as any).from('companies').update({ ai_settings: cfg }).eq('id', companyId)
      const res = await fetch('/api/ai/index-knowledge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Indexing failed')
      setMsg(`Learned from ${d.indexed} source${d.indexed === 1 ? '' : 's'}.`)
      await loadIndex(companyId)
    } catch (e: any) { setMsg('Could not index: ' + e.message) }
    finally { setIndexing(false) }
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
              {[
                ['ideas', 'Ideas', 'What customers have asked for'],
                ['roadmap', 'Roadmap', "What's planned and shipped"],
                ['announcements', 'Announcements', 'Your changelog and news'],
                ['help', 'Help centre articles', 'Usually the best source of answers'],
                ['website', 'Your website', 'Reads the pages on your verified domains'],
                ['past_chats', 'Past conversations', 'How your team actually answers — only human replies are learned from'],
              ].map(([k, label, note]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                  <input type="checkbox" checked={!!cfg.knowledge[k as string]}
                    onChange={e => setCfg({ ...cfg, knowledge: { ...cfg.knowledge, [k as string]: e.target.checked } })}
                    style={{ width: 16, height: 16, accentColor: 'var(--coral)', marginTop: 2 }} />
                  <span>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)' }}>{note}</span>
                  </span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={reindex} disabled={indexing}
                style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                {indexing ? 'Learning…' : 'Learn from my content'}
              </button>
              {index?.total > 0 && (
                <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                  {index.total} source{index.total === 1 ? '' : 's'} indexed
                  {index.lastIndexedAt ? ` · ${new Date(index.lastIndexedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                </span>
              )}
            </div>
            {index?.total === 0 && (
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#b45309' }}>
                Nothing indexed yet — the AI can&rsquo;t answer anything about your business until you do this.
              </p>
            )}
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

      <button onClick={save} disabled={saving}
        style={{ padding: '11px 24px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  )
}
