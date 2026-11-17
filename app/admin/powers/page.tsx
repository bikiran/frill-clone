'use client'

// Colvy Powers: your level and coins, the Power Shop, challenges, the
// leaderboard and badges. Serious about work, playful about teamwork: it all
// sits here and in a small chip in the top bar, never in the way of the work
// itself. Shows a short note when the business has it off.

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AdminPage, Panel } from '@/components/ui/AdminKit'
import { useCompanyUser } from '@/app/admin/crm-settings/_shared'
import { usePowers, powersApi, refreshPowers, pingTeam, type PowersMe } from '@/lib/powers/client'
import { POWERS, powerDef } from '@/lib/powers/config'
import { Coin, LevelRing, PowerIcon } from '@/components/powers/PowerIcon'
import UseSheet from '@/components/powers/UseSheet'
import PowerPreview from '@/components/powers/PowerPreview'

type Tab = 'overview' | 'shop' | 'challenges' | 'leaderboard' | 'badges'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'shop', label: 'Power Shop' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'badges', label: 'Badges' },
]

export default function PowersPage() {
  return <Suspense fallback={null}><Powers /></Suspense>
}

function Powers() {
  const { companyId, loading } = useCompanyUser()
  const p = usePowers(companyId)
  const sp = useSearchParams()
  const router = useRouter()
  const want = sp.get('tab')
  const [tab, setTab] = useState<Tab>(want === 'thanks' ? 'overview' : (TABS.some(t => t.id === want) ? want as Tab : 'overview'))
  useEffect(() => { if (want && TABS.some(t => t.id === want)) setTab(want as Tab) }, [want])
  const go = (t: Tab) => { setTab(t); router.replace(`/admin/powers${t === 'overview' ? '' : `?tab=${t}`}`, { scroll: false }) }

  if (loading || !p) {
    return (
      <AdminPage title="Colvy Powers" width="lg">
        <style>{CSS}</style>
        <div className="pw-sk"><span /><span /><span /></div>
      </AdminPage>
    )
  }
  if (!p.enabled) {
    return (
      <AdminPage title="Colvy Powers" sub="Serious about work. Playful about teamwork." width="md">
        <style>{CSS}</style>
        <Panel>
          <div className="pw-off">
            <span className="pw-off-ic"><PowerIcon name="bolt" size={26} stroke={2} /></span>
            <b>Colvy Powers is off for this workspace</b>
            <p>When it’s on, your team earns coins and XP for real work (answering and resolving conversations, finishing tasks, a teammate’s thanks) and spends coins on small, friendly powers. No real money, nothing that changes who can see what.</p>
            {p.isAdmin
              ? <Link href="/admin/crm-settings/powers" className="ak-btn go">Set it up</Link>
              : <p className="pw-fine">Ask the owner or an admin to turn it on in Settings.</p>}
            {p.setup && <p className="pw-fine">{p.setup}</p>}
          </div>
        </Panel>
      </AdminPage>
    )
  }
  if (!p.eligible) {
    return (
      <AdminPage title="Colvy Powers" width="md">
        <style>{CSS}</style>
        <Panel><div className="pw-off"><b>You’re not taking part here</b><p>This workspace has Colvy Powers on for some roles or locations only.</p></div></Panel>
      </AdminPage>
    )
  }

  const tabs = TABS.filter(t => t.id !== 'leaderboard' || p.leaderboard !== 'off')
  return (
    <AdminPage title="Colvy Powers" sub="Serious about work. Playful about teamwork." width="lg"
      actions={p.isAdmin ? <Link href="/admin/crm-settings/powers" className="ak-btn">Settings</Link> : undefined}>
      <style>{CSS}</style>
      <div className="pw-tabs ak-seg" role="tablist">
        {tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>{t.label}</button>)}
      </div>
      <div key={tab} className="ak-in">
        {tab === 'overview' && <Overview p={p} companyId={companyId!} focusThanks={want === 'thanks'} />}
        {tab === 'shop' && <Shop p={p} companyId={companyId!} onEarn={() => { go('overview'); window.setTimeout(() => document.getElementById('pw-earn')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250) }} />}
        {tab === 'challenges' && <Challenges companyId={companyId!} isAdmin={!!p.isAdmin} />}
        {tab === 'leaderboard' && <Leaderboard p={p} companyId={companyId!} />}
        {tab === 'badges' && <Badges p={p} />}
      </div>
    </AdminPage>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────
const RULE_LABEL: Record<string, string> = {
  resolve: 'Resolved a conversation', reply: 'Replied to a customer', call: 'Answered a call', task: 'Completed a task', job: 'Completed a job',
  order: 'Fulfilled an order', feedback: 'Named in a happy review', thanks: 'A teammate said thanks', active: 'Active on Colvy today',
  time: 'Time in Colvy', challenge: 'Finished a challenge',
}
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m} min`)
function ledgerLine(r: any): { text: string; sub?: string } {
  if (r.kind === 'reward') {
    if (r.rule === 'thanks') return { text: `${r.meta?.from || 'A teammate'} said thanks`, sub: r.meta?.note }
    if (r.rule === 'time' && r.meta?.minutes) return { text: `${mins(Number(r.meta.minutes))} in Colvy today` }
    if (r.rule === 'challenge') return { text: 'Finished a challenge', sub: r.meta?.title }
    return { text: RULE_LABEL[r.rule] || 'Reward' }
  }
  if (r.kind === 'purchase') return { text: powerDef(r.rule)?.name || 'Power' }
  if (r.kind === 'gift_out') return { text: 'Sent a coin gift', sub: r.reason }
  if (r.kind === 'gift_in') return { text: `Gift from ${r.actor || 'a teammate'}`, sub: r.reason }
  if (r.kind === 'grant') return { text: `Coins from ${r.actor || 'an admin'}`, sub: r.reason }
  if (r.kind === 'revoke') return { text: `Coins taken back by ${r.actor || 'an admin'}`, sub: r.reason }
  if (r.kind === 'reversal') return { text: 'Taken back', sub: r.reason }
  return { text: r.kind }
}
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
const left = (iso: string) => {
  const m = Math.max(0, (Date.parse(iso) - Date.now()) / 60000)
  return m < 60 ? `${Math.ceil(m)} min left` : `${Math.round(m / 60)}h left`
}

function Overview({ p, companyId, focusThanks }: { p: PowersMe; companyId: string; focusThanks: boolean }) {
  const w = p.wallet!
  const live = p.live || {}
  const me = p.me!.id
  const mine: { id?: string; label: string; ends: string; power: string; end?: boolean }[] = []
  if (live.crowns?.[me]) mine.push({ label: 'VIP Crown', ends: live.crowns[me], power: 'vip_crown' })
  if (live.statuses?.[me]) mine.push({ label: `Status: ${live.statuses[me].emoji} ${live.statuses[me].text}`.trim(), ends: '', power: 'custom_status' })
  if (live.focusUntil) mine.push({ label: 'Focus Shield', ends: live.focusUntil, power: 'focus_shield' })
  if (live.doubleXpUntil) mine.push({ label: 'Double XP', ends: live.doubleXpUntil, power: 'double_xp' })
  if (live.teamBoostUntil) mine.push({ label: 'Team Boost (everyone)', ends: live.teamBoostUntil, power: 'team_boost' })
  const capPct = p.today && p.today.capCoins ? Math.min(1, p.today.coins / p.today.capCoins) : 0

  return (
    <div className="pw-ov">
      <div className="pw-hero">
        <div className="pw-hero-ring"><LevelRing level={w.level} progress={w.progress} size={92} stroke={6} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="pw-kicker">Level {w.level}</span>
          <h2>{w.title}</h2>
          <div className="pw-xp"><i style={{ width: `${Math.round(w.progress * 100)}%` }} /></div>
          <span className="pw-xp-t">{w.xp.toLocaleString()} XP{w.level < 50 ? ` · ${(w.to - w.xp).toLocaleString()} to level ${w.level + 1}` : ''}</span>
        </div>
      </div>

      <div className="ak-tiles">
        <div className="ak-tile"><span className="ak-tile-l">Coins</span><span className="ak-tile-v pw-v"><Coin size={20} />{w.coins.toLocaleString()}</span><span className="ak-tile-s">{w.earned.toLocaleString()} earned in total</span></div>
        <div className="ak-tile"><span className="ak-tile-l">Streak</span><span className="ak-tile-v">🔥 {w.streak} {w.streak === 1 ? 'day' : 'days'}</span><span className="ak-tile-s">Best {w.bestStreak}{w.savers ? ` · ${w.savers} Streak Saver${w.savers > 1 ? 's' : ''}` : ''}</span></div>
        <div className="ak-tile"><span className="ak-tile-l">Today</span><span className="ak-tile-v pw-v"><Coin size={20} />+{p.today?.coins ?? 0}</span>
          <span className="pw-cap"><i style={{ width: `${Math.round(capPct * 100)}%` }} /></span><span className="ak-tile-s">Daily limit {p.today?.capCoins ?? 0} coins</span></div>
      </div>

      <div className="ak-grid2">
        <Thanks p={p} companyId={companyId} focus={focusThanks} />
        <div id="pw-earn">
          <Panel title="How you earn" sub="Real work only. The same piece of work pays once.">
            <div className="pw-rules">
              {(p.rules || []).map(r => (
                <div key={r.id} title={r.hint}>
                  <span className="pw-rule-l">{r.label}{r.max ? <small>{r.max === 1 ? 'Once a day' : `Up to ${r.max} a day`}</small> : null}</span>
                  <b><Coin size={13} />{r.coins}<small>· {r.xp} XP</small></b>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {mine.length > 0 && (
        <Panel title="On now">
          <div className="pw-live">
            {mine.map(m => (
              <div key={m.power} style={{ ['--pc' as any]: powerDef(m.power)?.color }}>
                <span className="pw-live-ic"><PowerIcon name={powerDef(m.power)?.icon || 'spot'} size={16} stroke={2} /></span>
                <b>{m.label}</b>{m.ends && <small>{left(m.ends)}</small>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Recent" flush>
        {(p.recent || []).length === 0
          ? <div className="ak-empty"><b>Nothing yet</b>Resolve a conversation or finish an assigned task and it shows up here.</div>
          : (
            <div className="ak-list pw-recent">
              {(p.recent || []).map((r: any) => {
                const l = ledgerLine(r)
                return (
                  <div key={r.id} className="ak-row">
                    <div className="ak-row-t"><b>{l.text}</b><small>{l.sub ? `${l.sub} · ` : ''}{ago(r.created_at)}</small></div>
                    {r.xp !== 0 && <span className={`pw-amt xp${r.xp < 0 ? ' neg' : ''}`}>{r.xp > 0 ? '+' : ''}{r.xp} XP</span>}
                    {r.coins !== 0 && <span className={`pw-amt${r.coins < 0 ? ' neg' : ''}`}><Coin size={13} />{r.coins > 0 ? '+' : ''}{r.coins}</span>}
                  </div>
                )
              })}
            </div>
          )}
      </Panel>
    </div>
  )
}

function Thanks({ p, companyId, focus }: { p: PowersMe; companyId: string; focus: boolean }) {
  const team = (p.team || []).filter(t => t.id !== p.me?.id)
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const on = (p.rules || []).some(r => r.id === 'thanks')
  if (!on) return <Panel title="Say thanks"><p className="pw-fine">Thanks rewards are switched off here.</p></Panel>
  const send = async () => {
    if (!to || note.trim().length < 3 || busy) return
    setBusy(true); setMsg(null)
    const r = await powersApi('/api/powers/thanks', { companyId, to, note: note.trim() })
    setBusy(false)
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || 'Could not send that.' }); return }
    setMsg({ ok: true, text: `Sent. ${r.data.to.name.split(' ')[0]} got +${r.data.coins} coins.` }); setNote(''); setTo('')
    void refreshPowers(true)
    pingTeam()
  }
  return (
    <Panel title="Say thanks" sub="Thank a teammate for something they did. They earn the reward, not you." className={focus ? 'pw-thanks-hl' : ''}>
      {team.length === 0 ? <p className="pw-fine">No teammates are taking part yet.</p> : (
        <>
          <div className="pw-people">
            {team.map(t => (
              <button key={t.id} type="button" className={to === t.id ? 'on' : ''} onClick={() => setTo(t.id)}>
                <Avatar name={t.name} src={t.avatar} cosm={p.live?.cosmetics?.[t.id]} size={28} />{t.name.split(' ')[0]}
              </button>
            ))}
          </div>
          <div className="pw-thx">
            <input className="ak-field" value={note} onChange={e => setNote(e.target.value)} maxLength={140} placeholder="Covered my calls while I was at the dentist" onKeyDown={e => { if (e.key === 'Enter') void send() }} />
            <button type="button" className="ak-btn dark" disabled={!to || note.trim().length < 3 || busy} onClick={send}>
              <PowerIcon name="thanks" size={16} stroke={2.2} />{busy ? 'Sending…' : 'Thank'}
            </button>
          </div>
          {msg && <p className={`pw-msg${msg.ok ? ' ok' : ''}`} role="status">{msg.ok && <span className="pw-heart">💛</span>}{msg.text}</p>}
        </>
      )}
    </Panel>
  )
}

// ── Shop ──────────────────────────────────────────────────────────────────────
function Shop({ p, companyId, onEarn }: { p: PowersMe; companyId: string; onEarn: () => void }) {
  const [use, setUse] = useState<string | null>(null)
  const [peek, setPeek] = useState<string | null>(null)
  const coins = p.wallet?.coins ?? 0
  const list = (p.powers || []).map(x => ({ ...powerDef(x.id)!, price: x.price, cooldown: x.cooldown, daily: x.daily })).filter(x => x.id)
  const shown = list.find(x => x.id === peek)
  // The example uses real first names: you, and a teammate.
  const names = { me: p.me?.name || '', mate: (p.team || []).find(t => t.id !== p.me?.id)?.name || '' }
  return (
    <>
      <div className="pw-shop">
        {list.map(pw => {
          const short = pw.id === 'gift' ? coins < 1 : pw.price > coins
          return (
            <div key={pw.id} className={`pw-card${short ? ' short' : ''}`} style={{ ['--pc' as any]: pw.color }} role="button" tabIndex={0}
              aria-label={`${pw.name}: how it works`} onClick={() => setPeek(pw.id)}
              onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setPeek(pw.id) } }}>
              <span className="pw-card-ic"><PowerIcon name={pw.icon} size={22} stroke={2} /></span>
              <b>{pw.name}</b>
              <p>{pw.blurb}</p>
              <div className="pw-card-f">
                <span className="pw-price"><Coin size={15} />{pw.id === 'gift' ? `up to ${pw.price}` : pw.price}</span>
                {short
                  ? <button type="button" className="ak-btn sm pw-more" onClick={e => { e.stopPropagation(); setPeek(pw.id) }}>{pw.id === 'gift' ? 'Earn coins first' : `${pw.price - coins} more`}</button>
                  : <button type="button" className="ak-btn sm dark" onClick={e => { e.stopPropagation(); setUse(pw.id) }}>Use</button>}
              </div>
              <span className="pw-card-meta"><span>{pw.minutes ? (pw.minutes >= 60 ? `${pw.minutes / 60}h` : `${pw.minutes} min`) : 'Instant'}{pw.cooldown ? ` · every ${pw.cooldown >= 60 ? `${Math.round(pw.cooldown / 60)}h` : `${pw.cooldown} min`}` : ''}{pw.daily ? ` · ${pw.daily}/day` : ''}</span>
                <span className="pw-how"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2.5 1.5v7l6-3.5z" fill="currentColor" /></svg>How it works</span></span>
            </div>
          )
        })}
      </div>
      <p className="pw-note">Coins are earned, never bought, and can’t be cashed out. Powers are just for fun: none of them change what anyone can see or do at work, and anything aimed at someone can be dismissed.</p>
      {shown && (
        <PowerPreview power={shown.id} price={shown.price} cooldown={shown.cooldown} daily={shown.daily} coins={coins} names={names}
          onClose={() => setPeek(null)} onUse={() => { setPeek(null); setUse(shown.id) }} onEarn={() => { setPeek(null); onEarn() }} />
      )}
      {use && <UseSheet power={use} companyId={companyId} me={p} onClose={() => setUse(null)} />}
    </>
  )
}

// ── Challenges ────────────────────────────────────────────────────────────────
const METRIC: Record<string, string> = { resolve: 'conversations resolved', reply: 'customer replies', call: 'calls answered', task: 'tasks completed', job: 'jobs completed', order: 'orders fulfilled', thanks: 'thanks received', feedback: 'happy reviews' }
function Challenges({ companyId, isAdmin }: { companyId: string; isAdmin: boolean }) {
  const [list, setList] = useState<any[] | null>(null)
  useEffect(() => { powersApi(`/api/powers/challenges?companyId=${companyId}`, undefined, 'GET').then(r => setList(r.ok ? r.data.challenges || [] : [])) }, [companyId])
  if (!list) return <div className="pw-sk"><span /><span /></div>
  if (!list.length) return (
    <Panel><div className="ak-empty"><b>No challenges right now</b>{isAdmin ? <>Set daily, weekly or team goals in <Link href="/admin/crm-settings/powers#challenges">Settings</Link>.</> : 'When your team sets some, they show up here.'}</div></Panel>
  )
  const until = (d: string) => {
    const h = Math.max(0, (Date.parse(d + 'T00:00:00') - Date.now()) / 3600e3)
    return h < 24 ? `${Math.max(1, Math.ceil(h))}h left` : `${Math.ceil(h / 24)} days left`
  }
  return (
    <div className="pw-chs">
      {list.map(c => {
        const pct = Math.min(1, c.progress / c.target)
        return (
          <div key={c.id} className={`pw-ch${c.done ? ' done' : ''}`}>
            <div className="pw-ch-h">
              <span className={`ak-tag ${c.scope === 'team' ? 'violet' : c.scope === 'weekly' ? 'blue' : 'amber'}`}>{c.scope === 'team' ? 'Team' : c.scope === 'weekly' ? 'This week' : 'Today'}</span>
              <small>{c.done ? 'Done' : until(c.ends)}</small>
            </div>
            <b>{c.title}</b>
            <span className="pw-ch-m">{c.progress} of {c.target} {METRIC[c.metric] || ''}{c.scope === 'team' ? ` · you: ${c.mine || 0}` : ''}</span>
            <div className="pw-ch-bar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
            <span className="pw-ch-r">{c.done ? <><span className="pw-check">✓</span>Reward paid</> : <>Reward <Coin size={13} />{c.rewardCoins} · {c.rewardXp} XP</>}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
const BOARDS = [
  { id: 'xp', label: 'XP' }, { id: 'resolve', label: 'Resolved' }, { id: 'reply', label: 'Replies' }, { id: 'call', label: 'Calls' },
  { id: 'task', label: 'Tasks' }, { id: 'job', label: 'Jobs' }, { id: 'order', label: 'Orders' }, { id: 'thanks', label: 'Thanks' },
]
function Leaderboard({ p, companyId }: { p: PowersMe; companyId: string }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [board, setBoard] = useState('xp')
  // Only boards for rules that are on here and about something the business
  // uses: no Jobs board without the Jobs module, no Calls without a phone line.
  const boards = BOARDS.filter(b => b.id === 'xp' || (p.rules || []).some(r => r.id === b.id))
  useEffect(() => { if (!boards.some(b => b.id === board)) setBoard('xp') }, [boards, board])
  const [data, setData] = useState<any>(null)
  const [who, setWho] = useState<string | null>(null)
  useEffect(() => {
    setData(null)
    powersApi(`/api/powers/leaderboard?companyId=${companyId}&period=${period}&board=${board}`, undefined, 'GET').then(r => setData(r.ok ? r.data : { error: r.data?.error }))
  }, [companyId, period, board])
  const unit = board === 'xp' ? 'XP' : ''
  const live = p.live || {}
  const rows = data?.rows || []
  const podium = rows.slice(0, 3)
  const order = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium
  return (
    <>
      <div className="pw-lb-bar">
        <div className="ak-seg">
          <button className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>This week</button>
          <button className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>This month</button>
        </div>
        <div className="pw-boards">{boards.map(b => <button key={b.id} className={`ak-chip${board === b.id ? ' on' : ''}`} onClick={() => setBoard(b.id)}>{b.label}</button>)}</div>
      </div>
      {!data ? <div className="pw-sk"><span /><span /></div> : data.error ? <div className="ak-note bad">{data.error}</div> : data.mode === 'team' ? (
        <Panel>
          <div className="pw-team">
            <span className="pw-kicker">The whole team, {period === 'week' ? 'this week' : 'this month'}</span>
            <b>{Number(data.team.total).toLocaleString()} {unit || boards.find(b => b.id === board)?.label.toLowerCase()}</b>
            <p>Together, across {data.team.people} {data.team.people === 1 ? 'person' : 'people'}. This workspace shows team totals only.</p>
          </div>
        </Panel>
      ) : rows.every((r: any) => !r.score) ? (
        <Panel><div className="ak-empty"><b>The board is wide open</b>Nobody has scored {period === 'week' ? 'this week' : 'this month'} yet.</div></Panel>
      ) : (
        <>
          <div className="pw-podium">
            {order.map((r: any) => (
              <button type="button" key={r.id} className={`pw-pod r${r.rank}${r.me ? ' me' : ''}`} onClick={() => setWho(r.id)}>
                <span className="pw-pod-who">
                  {live.crowns?.[r.id] && <span className="pw-crown" title="VIP Crown">👑</span>}
                  <Avatar name={r.name} src={r.avatar} cosm={live.cosmetics?.[r.id]} size={r.rank === 1 ? 58 : 48} />
                </span>
                <b style={{ color: live.cosmetics?.[r.id]?.name || undefined }}>{r.name.split(' ')[0]}</b>
                <small>{Number(r.score).toLocaleString()} {unit}</small>
                <span className="pw-pod-bar"><i>{r.rank}</i></span>
              </button>
            ))}
          </div>
          {rows.length > 3 && (
            <Panel flush>
              <div className="ak-list">
                {rows.slice(3).map((r: any) => (
                  <button type="button" key={r.id} className={`ak-row pw-lb-row${r.me ? ' on' : ''}`} onClick={() => setWho(r.id)}>
                    <span className="pw-rank">{r.rank}</span>
                    <Avatar name={r.name} src={r.avatar} cosm={live.cosmetics?.[r.id]} size={32} />
                    <div className="ak-row-t"><b style={{ color: live.cosmetics?.[r.id]?.name || undefined }}>{r.name}{live.crowns?.[r.id] ? ' 👑' : ''}{live.statuses?.[r.id] ? ` ${live.statuses[r.id].emoji}` : ''}</b><small>Level {r.level}</small></div>
                    <span className="pw-score">{Number(r.score).toLocaleString()} {unit}</span>
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
      {who && <Profile companyId={companyId} userId={who} live={live} onClose={() => setWho(null)} />}
    </>
  )
}

function Profile({ companyId, userId, live, onClose }: { companyId: string; userId: string; live: any; onClose: () => void }) {
  const [d, setD] = useState<any>(null)
  useEffect(() => { powersApi(`/api/powers/member?companyId=${companyId}&userId=${userId}`, undefined, 'GET').then(r => setD(r.ok ? r.data : { error: r.data?.error })) }, [companyId, userId])
  const status = live.statuses?.[userId]
  return (
    <div className="pw-prof-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pw-prof" role="dialog" aria-label="Teammate">
        <button type="button" className="pw-prof-x" aria-label="Close" onClick={onClose}>×</button>
        {!d ? <div className="pw-sk"><span /></div> : d.error ? <p className="pw-fine">{d.error}</p> : (
          <>
            <div className="pw-prof-top">
              <span className="pw-pod-who">{live.crowns?.[userId] && <span className="pw-crown">👑</span>}<Avatar name={d.name} src={d.avatar} cosm={live.cosmetics?.[userId]} size={64} /></span>
              <b style={{ color: live.cosmetics?.[userId]?.name || undefined }}>{d.name}</b>
              {status && <span className="pw-status">{status.emoji} {status.text}</span>}
              <span className="pw-sub2">Level {d.level} · {d.title}</span>
            </div>
            <div className="pw-prof-stats"><div><b>{d.xp.toLocaleString()}</b><span>XP</span></div><div><b>🔥 {d.streak}</b><span>day streak</span></div><div><b>{d.badges.length}</b><span>badges</span></div></div>
            {d.badges.length > 0 && <div className="pw-prof-badges">{d.badges.map((b: any) => <span key={b.code} title={b.name}>{b.icon}</span>)}</div>}
          </>
        )}
      </div>
    </div>
  )
}

// ── Badges ────────────────────────────────────────────────────────────────────
function Badges({ p }: { p: PowersMe }) {
  const list = p.achievements || []
  const got = list.filter(a => a.earned).length
  return (
    <>
      <p className="pw-note" style={{ marginTop: 0 }}>{got} of {list.length} earned. Badges are just for show: they never unlock anything at work.</p>
      <div className="pw-badges">
        {list.map(a => (
          <div key={a.code} className={`pw-badge${a.earned ? ' got' : ''}`}>
            <span className="pw-badge-ic">{a.icon}</span>
            <b>{a.name}</b>
            <small>{a.earned && a.at ? `Earned ${new Date(a.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : a.hint}</small>
          </div>
        ))}
      </div>
    </>
  )
}

function Avatar({ name, src, cosm, size }: { name: string; src?: string | null; cosm?: { ring?: string; name?: string }; size: number }) {
  const ring = cosm?.ring
  return (
    <span className="pw-av" style={{ width: size, height: size, padding: ring ? 2.5 : 0, background: ring || 'transparent' }}>
      <span className="pw-av-in">{src ? <img src={src} alt="" /> : <b style={{ fontSize: size * 0.38 }}>{name.slice(0, 1).toUpperCase()}</b>}</span>
    </span>
  )
}

const CSS = `
.pw-tabs{margin-bottom:16px}
.pw-ov .pw-ring{position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--ink)}
.pw-ov .pw-ring svg{position:absolute;inset:0}
.pw-ov .pw-ring b{position:relative;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.pw-sk{display:flex;flex-direction:column;gap:12px}
.pw-sk span{display:block;height:120px;border-radius:22px;background:linear-gradient(90deg,rgba(127,127,140,.08),rgba(127,127,140,.15),rgba(127,127,140,.08));background-size:200% 100%;animation:pwSk 1.3s ease-in-out infinite}
@keyframes pwSk{to{background-position:-200% 0}}
.pw-off{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:28px 12px}
.pw-off-ic{width:58px;height:58px;display:inline-flex;align-items:center;justify-content:center;border-radius:20px;background:color-mix(in srgb,var(--coral) 14%,transparent);color:var(--coral)}
.pw-off b{font-family:var(--font-display),sans-serif;font-size:20px;letter-spacing:-.03em}
.pw-off p{max-width:520px;margin:0;font-size:14.5px;line-height:1.55;color:var(--mut)}
.pw-fine{margin:0;font-size:13px;color:var(--soft)}
.pw-hero{display:flex;align-items:center;gap:22px;margin-bottom:14px;padding:22px 24px;border-radius:26px;background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,var(--coral) 14%,var(--card,#fff)),var(--card,#fff) 60%);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04)}
.pw-hero-ring{animation:pwRingIn .7s cubic-bezier(.2,1.2,.4,1)}
@keyframes pwRingIn{from{opacity:0;transform:scale(.7) rotate(-40deg)}to{opacity:1;transform:none}}
.pw-kicker{font-size:12.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--coral)}
.pw-hero h2{margin:2px 0 10px;font-family:var(--font-display),sans-serif;font-size:clamp(26px,3vw,34px);font-weight:700;letter-spacing:-.04em;line-height:1.05}
.pw-xp{height:8px;border-radius:999px;background:rgba(127,127,140,.16);overflow:hidden;max-width:420px}
.pw-xp i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff6a4d,#ffa25c);animation:pwGrow 1s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
@keyframes pwGrow{from{transform:scaleX(0)}}
.pw-xp-t{display:block;margin-top:7px;font-size:13px;color:var(--mut);font-variant-numeric:tabular-nums}
.pw-v{display:flex;align-items:center;gap:7px}
.pw-cap{display:block;height:4px;margin:4px 0 3px;border-radius:999px;background:rgba(127,127,140,.15);overflow:hidden}
.pw-cap i{display:block;height:100%;background:#22c55e;border-radius:inherit}
.pw-rules{display:flex;flex-direction:column}
.pw-rules div{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;font-size:14px}
.pw-rules div+div{box-shadow:0 -1px 0 var(--line)}
.pw-rule-l{display:flex;flex-direction:column;min-width:0}
.pw-rule-l small{margin:1px 0 0!important;font-size:12px}
.pw-rules b{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums;white-space:nowrap}
.pw-rules small{font-weight:500;color:var(--soft);margin-left:3px}
.pw-people{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.pw-people button{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 13px 0 5px;border:none;border-radius:999px;background:var(--f);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:box-shadow .15s,background .15s}
.pw-people button.on{background:color-mix(in srgb,#e11d48 10%,var(--card,#fff));box-shadow:0 0 0 2px #e11d48}
.pw-thx{display:flex;gap:8px}
.pw-thx .ak-field{flex:1}
.pw-msg{margin:10px 0 0;font-size:13.5px;color:#b42318}
.pw-msg.ok{color:#067647;display:flex;align-items:center;gap:6px}
.pw-heart{display:inline-block;animation:pwHeart .7s cubic-bezier(.2,1.5,.4,1)}
@keyframes pwHeart{0%{transform:scale(.2)}60%{transform:scale(1.35)}100%{transform:none}}
.ak-panel.pw-thanks-hl{box-shadow:0 0 0 2px color-mix(in srgb,#e11d48 45%,transparent),0 1px 2px rgba(16,24,40,.04)}
.pw-live{display:flex;flex-wrap:wrap;gap:8px}
.pw-live div{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px 0 6px;border-radius:999px;background:color-mix(in srgb,var(--pc) 10%,var(--card,#fff));box-shadow:0 0 0 1px color-mix(in srgb,var(--pc) 25%,transparent)}
.pw-live-ic{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--pc);color:#fff}
.pw-live b{font-size:13.5px}
.pw-live small{font-size:12px;color:var(--mut)}
.pw-amt{display:inline-flex;align-items:center;gap:4px;font-size:13.5px;font-weight:700;color:#b07800;font-variant-numeric:tabular-nums;white-space:nowrap}
.pw-amt.xp{color:var(--mut);font-weight:600;font-size:12.5px}
.pw-amt.neg{color:var(--soft)}
.pw-recent{padding:0 8px 8px}
.pw-shop{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:12px}
.pw-card{position:relative;display:flex;flex-direction:column;gap:6px;padding:18px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04);transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s}
.pw-card:hover{transform:translateY(-2px);box-shadow:0 0 0 1px color-mix(in srgb,var(--pc) 30%,transparent),0 14px 30px -18px color-mix(in srgb,var(--pc) 70%,transparent)}
.pw-card-ic{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:4px;border-radius:15px;background:var(--pc);color:#fff;box-shadow:0 8px 18px -10px var(--pc);transition:transform .3s cubic-bezier(.2,1.4,.4,1)}
.pw-card:hover .pw-card-ic{transform:rotate(-8deg) scale(1.06)}
.pw-card b{font-size:16px;letter-spacing:-.015em}
.pw-card p{flex:1;margin:0;font-size:13.5px;line-height:1.5;color:var(--mut)}
.pw-card-f{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px}
.pw-price{display:inline-flex;align-items:center;gap:5px;font-weight:800;font-variant-numeric:tabular-nums}
.pw-card{cursor:pointer;outline:none}
.pw-card:focus-visible{box-shadow:0 0 0 2px var(--pc)}
.pw-card-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--soft)}
.pw-how{display:inline-flex;align-items:center;gap:4px;font-weight:650;color:var(--pc);opacity:.85;white-space:nowrap;transition:opacity .15s}
.pw-card:hover .pw-how{opacity:1}
.pw-card.short .pw-card-ic{filter:saturate(.75)}
.ak-btn.pw-more{background:var(--f);box-shadow:none;color:var(--mut)}
.ak-btn.pw-more:hover{color:var(--ink)}
.pw-note{margin:16px 2px 0;font-size:13px;line-height:1.55;color:var(--soft)}
.pw-chs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.pw-ch{display:flex;flex-direction:column;gap:6px;padding:18px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04)}
.pw-ch.done{box-shadow:0 0 0 1.5px #22c55e}
.pw-ch-h{display:flex;align-items:center;justify-content:space-between}
.pw-ch-h small{font-size:12px;color:var(--soft)}
.pw-ch b{font-size:16px;letter-spacing:-.015em}
.pw-ch-m{font-size:13px;color:var(--mut)}
.pw-ch-bar{height:8px;border-radius:999px;background:rgba(127,127,140,.15);overflow:hidden}
.pw-ch-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7c5cff,#a78bfa);animation:pwGrow .9s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
.pw-ch.done .pw-ch-bar i{background:#22c55e}
.pw-ch-r{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:650;color:var(--mut)}
.pw-check{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#22c55e;color:#fff;font-size:11px;margin-right:2px}
.pw-lb-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.pw-boards{display:flex;gap:6px;flex-wrap:wrap}
.pw-team{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;padding:26px 10px}
.pw-team b{font-family:var(--font-display),sans-serif;font-size:44px;letter-spacing:-.04em}
.pw-team p{margin:0;color:var(--mut);font-size:14px}
.pw-podium{display:flex;align-items:flex-end;justify-content:center;gap:12px;margin:8px 0 16px;padding-top:10px}
.pw-pod{display:flex;flex-direction:column;align-items:center;gap:4px;width:min(150px,30%);padding:0;border:none;background:none;color:var(--ink);font:inherit;cursor:pointer}
.pw-pod::before,.pw-lb-row::before,.pw-prof-x::before{display:none!important}
.pw-pod b{font-size:14.5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pw-pod small{font-size:12.5px;color:var(--mut);font-variant-numeric:tabular-nums}
.pw-pod-who{position:relative;display:inline-flex}
.pw-crown{position:absolute;top:-15px;left:50%;transform:translateX(-50%) rotate(-8deg);font-size:18px;z-index:1;animation:pwCrown 2.6s ease-in-out infinite}
@keyframes pwCrown{0%,100%{transform:translateX(-50%) rotate(-8deg)}50%{transform:translateX(-50%) translateY(-2px) rotate(6deg)}}
.pw-pod-bar{display:flex;align-items:flex-start;justify-content:center;width:100%;margin-top:6px;border-radius:16px 16px 6px 6px;background:linear-gradient(180deg,color-mix(in srgb,var(--c) 30%,var(--card,#fff)),color-mix(in srgb,var(--c) 10%,var(--card,#fff)));box-shadow:0 0 0 1px color-mix(in srgb,var(--c) 30%,transparent);transform-origin:bottom;animation:pwRise .8s cubic-bezier(.2,1.1,.35,1) both}
.pw-pod-bar i{margin-top:10px;font-style:normal;font-family:var(--font-display),sans-serif;font-size:22px;font-weight:800;color:var(--c)}
.pw-pod.r1 .pw-pod-bar{height:118px;--c:#f5b400;animation-delay:.15s}
.pw-pod.r2 .pw-pod-bar{height:86px;--c:#94a3b8}
.pw-pod.r3 .pw-pod-bar{height:64px;--c:#d97706;animation-delay:.3s}
.pw-pod.me b{color:var(--coral)}
@keyframes pwRise{from{transform:scaleY(0)}}
.pw-lb-row{width:100%;border:none;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer}
.pw-rank{width:24px;font-weight:800;color:var(--soft);font-variant-numeric:tabular-nums;text-align:center}
.pw-score{font-weight:800;font-variant-numeric:tabular-nums}
.pw-av{display:inline-flex;border-radius:50%;flex-shrink:0;box-sizing:border-box}
.pw-av-in{width:100%;height:100%;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;background:var(--f);box-shadow:0 0 0 2px var(--card,#fff)}
.pw-av-in img{width:100%;height:100%;object-fit:cover}
.pw-av-in b{color:var(--mut);font-weight:800}
.pw-prof-back{position:fixed;inset:0;z-index:9400;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,12,20,.3);animation:pusFade .2s ease}
@keyframes pusFade{from{opacity:0}}
.pw-prof{position:relative;width:min(360px,100%);padding:24px 20px 20px;border-radius:26px;background:var(--card,#fff);color:var(--ink);box-shadow:0 30px 80px -24px rgba(10,12,20,.45);animation:pwPop2 .3s cubic-bezier(.2,1.1,.35,1)}
@keyframes pwPop2{from{opacity:0;transform:translateY(12px) scale(.97)}}
.pw-prof-x{position:absolute;top:12px;right:12px;width:32px;height:32px;border:none;border-radius:50%;background:var(--f);color:var(--mut);font-size:20px;line-height:1;cursor:pointer}
.pw-prof-top{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;margin-top:6px}
.pw-prof-top b{font-family:var(--font-display),sans-serif;font-size:21px;letter-spacing:-.03em;margin-top:6px}
.pw-status{display:inline-flex;padding:3px 10px;border-radius:999px;background:var(--f);font-size:12.5px;font-weight:600}
.pw-sub2{font-size:13px;color:var(--mut)}
.pw-prof-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:16px}
.pw-prof-stats div{display:flex;flex-direction:column;align-items:center;padding:10px 4px;border-radius:14px;background:var(--f)}
.pw-prof-stats b{font-size:16px;font-variant-numeric:tabular-nums}
.pw-prof-stats span{font-size:11.5px;color:var(--mut)}
.pw-prof-badges{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:14px;font-size:22px}
.pw-badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr));gap:10px}
.pw-badge{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;padding:18px 12px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05)}
.pw-badge-ic{width:54px;height:54px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--f);font-size:26px;filter:grayscale(1);opacity:.45;margin-bottom:4px}
.pw-badge.got .pw-badge-ic{filter:none;opacity:1;background:radial-gradient(circle at 30% 30%,#fff7e0,#ffe2a8);box-shadow:0 8px 20px -12px #f5b400}
.pw-badge b{font-size:14px}
.pw-badge small{font-size:12px;line-height:1.4;color:var(--soft)}
.pw-badge:not(.got) b{color:var(--mut)}
[data-theme="dark"] .pw-badge.got .pw-badge-ic{background:radial-gradient(circle at 30% 30%,#4a3b14,#2e2510)}
@media (max-width:640px){
  .pw-hero{gap:14px;padding:18px}
  .pw-hero-ring .pw-ring{transform:scale(.82)}
  .pw-thx{flex-direction:column}
  .pw-thx .ak-field{flex:none}
  .pw-ov .ak-tiles{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .pw-ov .ak-tile{padding:12px}
  .pw-ov .ak-tile-v{font-size:19px}
  .pw-ov .ak-tile-v svg{width:16px;height:16px}
  .pw-ov .ak-tile-s{display:none}
  .pw-podium{gap:8px}
}
@media (prefers-reduced-motion:reduce){.pw-hero-ring,.pw-xp i,.pw-ch-bar i,.pw-pod-bar,.pw-crown,.pw-heart,.pw-prof,.pw-sk span{animation:none}.pw-card,.pw-card-ic{transition:none}}
`
