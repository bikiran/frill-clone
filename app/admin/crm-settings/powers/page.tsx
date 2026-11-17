'use client'

// Settings → Colvy Powers (owners and admins). One switch turns the whole
// thing on or off for the business; under it: what earns what, the daily
// limits, each power's price and limits, challenges, who takes part, who sees
// the leaderboard, giving or taking back coins (with a reason), and a log of
// those changes. Off by default; off means the app looks exactly as before.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Panel, Toggle } from '@/components/ui/AdminKit'
import { apiRaw } from '@/components/jobs/shared'
import { RULES, POWERS, ROLE_CHOICES, ALL_FEATURES, ruleAvailable, type PowersConfig, type Features, type Feature } from '@/lib/powers/config'
import { Coin, PowerIcon } from '@/components/powers/PowerIcon'
import { refreshPowers } from '@/lib/powers/client'
import { useCompanyUser, SettingsPage } from '../_shared'

type Member = { id: string; name: string; role: string; locationId: string | null; coins: number; xp: number; level: number; title: string }
type Data = { enabled: boolean; enabledAt: string | null; config: PowersConfig; features?: Features; team: Member[]; locations: { id: string; label: string }[]; audit: any[] }

// Why a rule isn't listed: the business doesn't use that part of Colvy (yet).
const WHY_NOT: Record<Feature, string> = { jobs: 'Jobs is off', orders: 'no store connected', calls: 'no business phone line', reviews: 'Google reviews not connected' }

export default function PowersSettings() {
  const { companyId, loading } = useCompanyUser()
  const [d, setD] = useState<Data | null>(null)
  const [draft, setDraft] = useState<PowersConfig | null>(null)
  const [err, setErr] = useState('')
  const [setup, setSetup] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    const r = await apiRaw(`/api/powers/settings?companyId=${companyId}`)
    if (!r.ok) { if (r.data?.setup) setSetup(r.data.error); else setErr(r.data?.error || 'Could not load the settings.'); return }
    setD(r.data); setDraft(r.data.config)
  }
  useEffect(() => { if (companyId) void load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => !!d && !!draft && JSON.stringify(d.config) !== JSON.stringify(draft), [d, draft])
  const save = async (patch: { enabled?: boolean; config?: PowersConfig }) => {
    setSaving(true); setErr('')
    const r = await apiRaw('/api/powers/settings', { method: 'PATCH', json: { companyId, ...patch } })
    setSaving(false)
    if (!r.ok) { setErr(r.data?.error || 'Could not save.'); return false }
    setD(x => x ? { ...x, enabled: r.data.enabled, enabledAt: r.data.enabledAt, config: r.data.config, features: r.data.features || x.features } : x)
    setDraft(r.data.config)
    setSaved(true); setTimeout(() => setSaved(false), 1800)
    void refreshPowers(true)
    return true
  }
  const set = (fn: (c: PowersConfig) => PowersConfig) => setDraft(c => (c ? fn(structuredClone(c)) : c))
  const features = d?.features || ALL_FEATURES
  const hidden = RULES.filter(r => !ruleAvailable(r.id, features))

  return (
    <SettingsPage title="Colvy Powers" sub="Coins and XP for real work, and small, friendly powers to spend them on. Serious about work, playful about teamwork.">
      <style>{CSS}</style>
      {setup && <div className="ak-note warn" role="alert">{setup}</div>}
      {err && <div className="ak-note bad" role="alert">{err}</div>}
      {(loading || (!d && !setup && !err)) && <Panel><div className="pws-sk"><span /><span /><span /></div></Panel>}

      {d && draft && (
        <>
          <Panel>
            <div className="pws-on">
              <span className={`pws-on-ic${d.enabled ? ' on' : ''}`}><PowerIcon name="bolt" size={22} stroke={2} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2>Colvy Powers for your team</h2>
                <p>{d.enabled
                  ? <>On{d.enabledAt ? ` since ${new Date(d.enabledAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}. Your team sees a small coin chip in the top bar. <Link href="/admin/powers">Open Colvy Powers</Link></>
                  : 'Off. Nothing changes in the app until you turn it on. Work done before you turn it on doesn’t earn anything.'}</p>
              </div>
              <Toggle on={d.enabled} label="Colvy Powers" disabled={saving} onChange={v => void save({ enabled: v })} />
            </div>
            <div className="pws-promise">
              <span>✓ No real money: coins are earned, never bought or cashed out</span>
              <span>✓ Nothing grants access or permissions</span>
              <span>✓ Customer messages and real alerts are never held back</span>
              <span>✓ Anything aimed at someone can be dismissed</span>
            </div>
          </Panel>

          <Panel title="What earns what" sub="Rewards come from the work itself, checked on the server. The same piece of work pays once, and undoing it (reopening a task, cancelling an order) takes the reward back. Per day is per person; 0 means no limit beyond the daily limits below.">
            <div className="pws-rows">
              <div className="pws-row pws-hrow"><span /><span>Coins</span><span>XP</span><span>Per day</span><span /></div>
              {RULES.filter(r => ruleAvailable(r.id, features)).map(r => {
                const v = draft.rules[r.id]
                return (
                  <div key={r.id} className={`pws-row${v.on ? '' : ' off'}`}>
                    <div className="pws-row-t">
                      <b>{r.label}</b><small>{r.hint}</small>
                      {r.id === 'time' && (
                        <span className="pws-every">Every <Num value={v.every || 60} min={15} max={480} onChange={n => set(c => { c.rules.time.every = n; return c })} /> minutes of active use</span>
                      )}
                    </div>
                    <Num value={v.coins} max={500} onChange={n => set(c => { c.rules[r.id].coins = n; return c })} />
                    <Num value={v.xp} max={500} onChange={n => set(c => { c.rules[r.id].xp = n; return c })} />
                    {r.id === 'active' ? <span className="pws-fixed" title="Once a day">1</span>
                      : <Num value={v.max} max={500} onChange={n => set(c => { c.rules[r.id].max = n; return c })} />}
                    <Toggle on={v.on} label={r.label} onChange={on => set(c => { c.rules[r.id].on = on; return c })} />
                  </div>
                )
              })}
            </div>
            {hidden.length > 0 && (
              <p className="pws-hidden">Not shown, because your business doesn’t use them yet: {hidden.map(r => `${r.label} (${WHY_NOT[r.needs!]})`).join(', ')}. They appear here, and start paying, once you do.</p>
            )}
          </Panel>

          <Panel title="Daily limits" sub="Per person, per day in your business’s time zone. Keeps it fair and stops anyone farming.">
            <div className="pws-caps">
              <Cap label="Coins from rewards" value={draft.caps.coins} max={5000} onChange={n => set(c => { c.caps.coins = n; return c })} />
              <Cap label="XP from rewards" value={draft.caps.xp} max={10000} onChange={n => set(c => { c.caps.xp = n; return c })} />
              <Cap label="Thanks each person can give" value={draft.caps.thanks} max={20} onChange={n => set(c => { c.caps.thanks = n; return c })} />
              <Cap label="Coins each person can gift" value={draft.caps.gift} max={5000} onChange={n => set(c => { c.caps.gift = n; return c })} />
              <Cap label="Powers aimed at one person, per hour" value={draft.caps.targetHourly} min={1} max={20} onChange={n => set(c => { c.caps.targetHourly = n; return c })} />
            </div>
          </Panel>

          <Panel title="Powers" sub="Turn any off, or change the price and how often each can be used (minutes between uses, uses per day; 0 = no limit).">
            <div className="pws-rows">
              <div className="pws-row pws-prow pws-hrow"><span /><span>Price</span><span>Every (min)</span><span>Per day</span><span /></div>
              {POWERS.map(p => {
                const v = draft.powers[p.id]
                return (
                  <div key={p.id} className={`pws-row pws-prow${v.on ? '' : ' off'}`} style={{ ['--pc' as any]: p.color }}>
                    <div className="pws-row-t pws-pname"><span className="pws-pic"><PowerIcon name={p.icon} size={15} stroke={2.1} /></span><div><b>{p.name}</b><small>{p.blurb}</small></div></div>
                    <Num value={v.price} min={1} max={10000} coin onChange={n => set(c => { c.powers[p.id].price = n; return c })} />
                    <Num value={v.cooldown} max={10080} onChange={n => set(c => { c.powers[p.id].cooldown = n; return c })} />
                    <Num value={v.daily} max={50} onChange={n => set(c => { c.powers[p.id].daily = n; return c })} />
                    <Toggle on={v.on} label={p.name} onChange={on => set(c => { c.powers[p.id].on = on; return c })} />
                  </div>
                )
              })}
            </div>
          </Panel>

          <ChallengesAdmin companyId={companyId!} features={features} />

          <div className="ak-grid2">
            <Panel title="Leaderboard" sub="Names, levels and counts only. Never customers or messages.">
              <div className="pws-radio">
                {([['everyone', 'Everyone ranked', 'A podium and a list, by week or month.'], ['team', 'Team totals only', 'One number for the whole team, no names.'], ['off', 'Off', 'No leaderboard at all.']] as const).map(([v, t, s]) => (
                  <button type="button" key={v} className={draft.leaderboard === v ? 'on' : ''} onClick={() => set(c => { c.leaderboard = v; return c })}>
                    <i /><span><b>{t}</b><small>{s}</small></span>
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Who takes part" sub="Leave both empty for everyone on the team. The owner always takes part.">
              <span className="ak-label">Roles</span>
              <div className="pws-chips">
                {ROLE_CHOICES.map(r => {
                  const on = draft.who.roles.includes(r)
                  return <button type="button" key={r} className={`ak-chip${on ? ' on' : ''}`} onClick={() => set(c => { c.who.roles = on ? c.who.roles.filter(x => x !== r) : [...c.who.roles, r]; return c })}>{r === 'editor' ? 'Team members' : r[0].toUpperCase() + r.slice(1) + 's'}</button>
                })}
              </div>
              {d.locations.length > 1 && (
                <>
                  <span className="ak-label" style={{ marginTop: 14 }}>Locations</span>
                  <div className="pws-chips">
                    {d.locations.map(l => {
                      const on = draft.who.locations.includes(l.id)
                      return <button type="button" key={l.id} className={`ak-chip${on ? ' on' : ''}`} onClick={() => set(c => { c.who.locations = on ? c.who.locations.filter(x => x !== l.id) : [...c.who.locations, l.id]; return c })}>{l.label}</button>
                    })}
                  </div>
                </>
              )}
            </Panel>
          </div>

          <Coins d={d} companyId={companyId!} onDone={load} />

          <Panel title="Coin changes" sub="Coins given or taken back by an admin, and rewards taken back when their work was undone." flush>
            {d.audit.length === 0 ? <div className="ak-empty">Nothing yet.</div> : (
              <table className="ak-table">
                <thead><tr><th>When</th><th>Who</th><th>Change</th><th>Reason</th></tr></thead>
                <tbody>
                  {d.audit.map(a => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                      <td>{a.name}</td>
                      <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{a.coins > 0 ? '+' : ''}{a.coins} coins{a.xp ? ` · ${a.xp} XP` : ''}</td>
                      <td>{a.kind === 'reversal' ? `Taken back: ${a.reason || ''}` : `${a.reason || ''}${a.by ? ` (by ${a.by})` : ''}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {dirty && (
            <div className="pws-bar">
              <span>You have unsaved changes</span>
              <button type="button" className="ak-btn ghost sm" onClick={() => setDraft(d.config)}>Discard</button>
              <button type="button" className="ak-btn go sm" disabled={saving} onClick={() => void save({ config: draft })}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          )}
          {saved && !dirty && <div className="pws-saved" role="status">Saved</div>}
        </>
      )}
    </SettingsPage>
  )
}

function Num({ value, onChange, min = 0, max, coin }: { value: number; onChange: (n: number) => void; min?: number; max: number; coin?: boolean }) {
  const [t, setT] = useState(String(value))
  useEffect(() => { setT(String(value)) }, [value])
  return (
    <label className="pws-num">
      {coin && <Coin size={13} />}
      <input inputMode="numeric" value={t} onChange={e => setT(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
        onBlur={() => { const n = Math.min(max, Math.max(min, Number(t) || 0)); setT(String(n)); if (n !== value) onChange(n) }} />
    </label>
  )
}
function Cap({ label, value, onChange, min = 0, max }: { label: string; value: number; onChange: (n: number) => void; min?: number; max: number }) {
  return <div className="pws-cap"><span>{label}</span><Num value={value} min={min} max={max} onChange={onChange} /></div>
}

function Coins({ d, companyId, onDone }: { d: Data; companyId: string; onDone: () => void }) {
  const [who, setWho] = useState('')
  const [mode, setMode] = useState<'grant' | 'revoke'>('grant')
  const [amount, setAmount] = useState('50')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const go = async () => {
    setBusy(true); setMsg(null)
    const r = await apiRaw('/api/powers/adjust', { method: 'POST', json: { companyId, userId: who, mode, amount: Number(amount), reason } })
    setBusy(false)
    if (!r.ok) { setMsg({ ok: false, t: r.data?.error || 'Could not change the coins.' }); return }
    setMsg({ ok: true, t: `${mode === 'grant' ? 'Gave' : 'Took back'} ${Math.abs(r.data.coins)} coins.` }); setReason('')
    onDone()
  }
  const sorted = [...d.team].sort((a, b) => b.xp - a.xp)
  return (
    <Panel title="Team wallets" sub="Give or take back coins with a reason. It’s kept with the change and in the Activity log. XP can’t be handed out: it’s only earned.">
      <div className="pws-wallets">
        {sorted.map(m => (
          <button type="button" key={m.id} className={who === m.id ? 'on' : ''} onClick={() => setWho(m.id)}>
            <b>{m.name}</b><small>Level {m.level} · {m.title}</small>
            <span><Coin size={13} />{m.coins.toLocaleString()}</span>
          </button>
        ))}
      </div>
      {who && (
        <div className="pws-adj">
          <div className="ak-seg"><button className={mode === 'grant' ? 'on' : ''} onClick={() => setMode('grant')}>Give</button><button className={mode === 'revoke' ? 'on' : ''} onClick={() => setMode('revoke')}>Take back</button></div>
          <input className="ak-field sm" style={{ width: 90 }} inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} aria-label="Coins" />
          <input className="ak-field sm" style={{ flex: 1, minWidth: 180 }} value={reason} maxLength={200} onChange={e => setReason(e.target.value)} placeholder="Reason (kept with the change)" />
          <button type="button" className="ak-btn dark sm" disabled={busy || !Number(amount) || reason.trim().length < 3} onClick={go}>{busy ? 'Saving…' : mode === 'grant' ? 'Give coins' : 'Take back'}</button>
        </div>
      )}
      {msg && <p className={`pws-msg${msg.ok ? ' ok' : ''}`}>{msg.t}</p>}
    </Panel>
  )
}

const SCOPE_LABEL: Record<string, string> = { daily: 'Each person, daily', weekly: 'Each person, weekly', team: 'Whole team, weekly' }
const METRIC_LABEL: Record<string, string> = { resolve: 'Conversations resolved', reply: 'Customer replies', call: 'Calls answered', task: 'Tasks completed', job: 'Jobs completed', order: 'Orders fulfilled', thanks: 'Thanks received', feedback: 'Happy reviews' }
function ChallengesAdmin({ companyId, features }: { companyId: string; features: Features }) {
  const metrics = Object.entries(METRIC_LABEL).filter(([k]) => ruleAvailable(k, features))
  const [list, setList] = useState<any[] | null>(null)
  const [f, setF] = useState({ title: '', scope: 'daily', metric: 'resolve', target: '10', rewardCoins: '50', rewardXp: '50' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => apiRaw(`/api/powers/challenges?companyId=${companyId}&all=1`).then(r => setList(r.ok ? r.data.challenges : []))
  useEffect(() => { void load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    setBusy(true); setErr('')
    const r = await apiRaw('/api/powers/challenges', { method: 'POST', json: { companyId, ...f, target: Number(f.target), rewardCoins: Number(f.rewardCoins), rewardXp: Number(f.rewardXp) } })
    setBusy(false)
    if (!r.ok) { setErr(r.data?.error || 'Could not add it.'); return }
    setF(x => ({ ...x, title: '' })); void load()
  }
  const toggle = async (c: any) => { await apiRaw('/api/powers/challenges', { method: 'PATCH', json: { companyId, id: c.id, active: !c.active } }); void load() }
  const del = async (c: any) => { await apiRaw(`/api/powers/challenges?companyId=${companyId}&id=${c.id}`, { method: 'DELETE' }); void load() }
  return (
    <Panel id="challenges" title="Challenges" sub="Goals your team works toward. Progress counts the same checked rewards, so they can’t be gamed either.">
      <div className="pws-chform">
        <input className="ak-field sm" value={f.title} maxLength={80} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Close 10 conversations today" />
        <select className="ak-select sm" value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })}>{Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="ak-select sm" value={f.metric} onChange={e => setF({ ...f, metric: e.target.value })}>{metrics.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="pws-mini">Target<input className="ak-field sm" inputMode="numeric" value={f.target} onChange={e => setF({ ...f, target: e.target.value.replace(/\D/g, '').slice(0, 5) })} /></label>
        <label className="pws-mini">Coins<input className="ak-field sm" inputMode="numeric" value={f.rewardCoins} onChange={e => setF({ ...f, rewardCoins: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
        <label className="pws-mini">XP<input className="ak-field sm" inputMode="numeric" value={f.rewardXp} onChange={e => setF({ ...f, rewardXp: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
        <button type="button" className="ak-btn dark sm" disabled={busy || f.title.trim().length < 3 || !Number(f.target)} onClick={add}>Add</button>
      </div>
      {err && <p className="pws-msg">{err}</p>}
      {list && list.length > 0 && (
        <div className="ak-list" style={{ marginTop: 10 }}>
          {list.map(c => (
            <div key={c.id} className="ak-row">
              <div className="ak-row-t"><b style={{ opacity: c.active && ruleAvailable(c.metric, features) ? 1 : .55 }}>{c.title}</b><small>{SCOPE_LABEL[c.scope]} · {c.target} {METRIC_LABEL[c.metric]?.toLowerCase()} · {c.reward_coins} coins, {c.reward_xp} XP{ruleAvailable(c.metric, features) ? '' : ' · hidden: your business doesn’t use this now'}</small></div>
              <Toggle on={c.active} label={c.active ? 'Pause' : 'Resume'} onChange={() => void toggle(c)} />
              <button type="button" className="ak-icon-btn danger" aria-label="Remove" onClick={() => void del(c)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

const CSS = `
.pws-sk{display:flex;flex-direction:column;gap:10px}.pws-sk span{height:18px;border-radius:9px;background:var(--f)}
.pws-on{display:flex;align-items:center;gap:14px}
.pws-on h2{margin:0;font-family:var(--font-display),sans-serif;font-size:18px;font-weight:700;letter-spacing:-.025em}
.pws-on p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--mut)}
.pws-on p a{color:var(--coral);font-weight:650}
.pws-on-ic{width:46px;height:46px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:16px;background:var(--f);color:var(--soft);transition:background .3s,color .3s,transform .4s cubic-bezier(.2,1.4,.4,1)}
.pws-on-ic.on{background:var(--coral);color:#fff;transform:rotate(-8deg)}
.pws-promise{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:14px;padding-top:12px;box-shadow:0 -1px 0 var(--line);font-size:12.5px;color:var(--mut)}
.pws-rows{display:flex;flex-direction:column}
.pws-row{display:grid;grid-template-columns:minmax(0,1fr) 76px 76px 76px 44px;align-items:center;gap:10px;padding:10px 0;transition:opacity .2s}
.pws-row+.pws-row{box-shadow:0 -1px 0 var(--line)}
.pws-row.off .pws-row-t,.pws-row.off .pws-num{opacity:.45}
.pws-hrow{padding:0 0 4px;font-size:12px;font-weight:600;color:var(--soft)}
.pws-hrow+.pws-row{box-shadow:none}
.pws-prow{grid-template-columns:minmax(0,1fr) 90px 84px 70px 44px}
.pws-row-t b{display:block;font-size:14px}
.pws-row-t small{display:block;margin-top:2px;font-size:12px;line-height:1.4;color:var(--soft)}
.pws-every{display:inline-flex;align-items:center;gap:6px;margin-top:7px;font-size:12.5px;font-weight:600;color:var(--mut)}
.pws-every .pws-num{width:64px;height:30px}
.pws-fixed{display:flex;align-items:center;height:36px;padding:0 10px;border-radius:11px;font-size:14px;font-weight:650;color:var(--soft)}
.pws-hidden{margin:12px 0 0;padding:10px 12px;border-radius:14px;background:color-mix(in srgb,var(--f) 60%,transparent);font-size:12.5px;line-height:1.5;color:var(--mut)}
.pws-pname{display:flex;gap:10px;align-items:flex-start}
.pws-pic{width:28px;height:28px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;background:var(--pc);color:#fff}
.pws-num{display:flex;align-items:center;gap:4px;height:36px;padding:0 10px;border-radius:11px;background:var(--f)}
.pws-num input{width:100%;min-width:0;border:none;background:none;outline:none;font:inherit;font-size:14px;font-weight:650;color:var(--ink);font-variant-numeric:tabular-nums}
.pws-caps{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px}
.pws-cap{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:16px;background:color-mix(in srgb,var(--f) 55%,transparent)}
.pws-cap span{font-size:13.5px;font-weight:600}
.pws-cap .pws-num{width:96px;background:var(--card,#fff)}
.pws-radio{display:flex;flex-direction:column;gap:6px}
.pws-radio button{display:flex;align-items:flex-start;gap:10px;padding:11px 12px;border:none;border-radius:14px;background:var(--f);color:var(--ink);font:inherit;text-align:left;cursor:pointer}
.pws-radio button::before{display:none!important}
.pws-radio i{width:18px;height:18px;flex-shrink:0;margin-top:1px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--soft);transition:box-shadow .2s}
.pws-radio button.on{background:color-mix(in srgb,var(--coral) 9%,var(--card,#fff));box-shadow:0 0 0 1.5px var(--coral)}
.pws-radio button.on i{box-shadow:inset 0 0 0 5.5px var(--coral)}
.pws-radio b{display:block;font-size:14px}
.pws-radio small{display:block;font-size:12.5px;color:var(--mut)}
.pws-chips{display:flex;flex-wrap:wrap;gap:6px}
.pws-wallets{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,200px),1fr));gap:8px}
.pws-wallets button{display:grid;grid-template-columns:1fr auto;align-items:center;gap:0 8px;padding:11px 13px;border:none;border-radius:16px;background:var(--f);color:var(--ink);font:inherit;text-align:left;cursor:pointer}
.pws-wallets button::before{display:none!important}
.pws-wallets button.on{box-shadow:0 0 0 2px var(--ink);background:var(--card,#fff)}
.pws-wallets b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pws-wallets small{grid-column:1;font-size:12px;color:var(--soft)}
.pws-wallets span{grid-row:1/3;grid-column:2;display:inline-flex;align-items:center;gap:4px;font-weight:800;font-variant-numeric:tabular-nums}
.pws-adj{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;padding:12px;border-radius:16px;background:color-mix(in srgb,var(--f) 55%,transparent);animation:akIn .3s cubic-bezier(.22,1,.36,1)}
.pws-msg{margin:10px 0 0;font-size:13px;color:#b42318}.pws-msg.ok{color:#067647}
.pws-chform{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.pws-chform>.ak-field{flex:1 1 220px}
.pws-chform>.ak-select{flex:0 1 190px}
.pws-mini{display:flex;flex-direction:column;gap:3px;width:74px;font-size:11.5px;font-weight:600;color:var(--soft)}
.pws-bar{position:sticky;bottom:16px;z-index:5;display:flex;align-items:center;gap:8px;margin-top:10px;padding:10px 10px 10px 18px;border-radius:999px;background:var(--ink);color:var(--card,#fff);box-shadow:0 18px 40px -16px rgba(10,12,20,.5);animation:akIn .3s cubic-bezier(.22,1,.36,1)}
.pws-bar span{flex:1;font-size:14px;font-weight:600}
.pws-bar .ak-btn.ghost{background:rgba(255,255,255,.14);color:inherit}
.pws-saved{position:sticky;bottom:16px;margin:10px auto 0;width:max-content;padding:9px 16px;border-radius:999px;background:#16a34a;color:#fff;font-size:13.5px;font-weight:650;animation:akIn .3s cubic-bezier(.22,1,.36,1)}
@media (max-width:760px){
  .pws-row{grid-template-columns:minmax(0,1fr) 54px 54px 54px 44px;gap:5px}
  .pws-row .pws-num{padding:0 8px}
  .pws-prow{grid-template-columns:minmax(0,1fr) 72px 44px;}
  .pws-prow .pws-num:nth-of-type(2),.pws-prow .pws-num:nth-of-type(3),.pws-prow.pws-hrow span:nth-child(3),.pws-prow.pws-hrow span:nth-child(4){display:none}
  .pws-row-t small{display:none}
  .pws-bar{border-radius:20px}
}
`
