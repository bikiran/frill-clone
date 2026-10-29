'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'
import BrandLogo, { type BrandKey } from '@/components/BrandLogo'
import { confirmDialog } from '@/components/ConfirmDialog'

export default function ScheduledPage() {
  const seededCid = peekCompanyUser()?.companyId ?? null
  const seededItems = seededCid ? readCache<any[]>(`scheduled:${seededCid}`) : undefined
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [items, setItems] = useState<any[]>(seededItems ?? [])
  const [tab, setTab] = useState<'all' | 'message' | 'review_request'>('all')
  const [loading, setLoading] = useState(!seededItems)
  const [showCreate, setShowCreate] = useState(false)
  const [quick, setQuick] = useState<[string, string][]>([])
  const [form, setForm] = useState({ type: 'message', message: '', scheduled_for: '', channel: 'widget' })

  useEffect(() => {
    const init = async () => {
      let cid: string | null = seededCid
      if (!cid && typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) cid = co.id
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) cid = ownCo.id
        }
      }
      setCompanyId(cid)
      if (cid) {
        const { data } = await (supabase as any).from('scheduled_messages').select('*').eq('company_id', cid).order('scheduled_for', { ascending: true })
        setItems(data || [])
        writeCache(`scheduled:${cid}`, data || [])
      }
      setLoading(false)
    }
    init()
  }, [])

  const createScheduled = async () => {
    if (!companyId || !form.message || !form.scheduled_for) return
    const { data: { session } } = await supabase.auth.getSession()
    const { data } = await (supabase as any).from('scheduled_messages').insert({
      company_id: companyId,
      message: form.message,
      scheduled_for: new Date(form.scheduled_for).toISOString(),
      channel: form.channel,
      type: form.type,
      status: 'pending',
      created_by: session?.user?.id,
    }).select().maybeSingle()
    if (data) setItems(prev => [...prev, data])
    setShowCreate(false)
    setForm({ type: 'message', message: '', scheduled_for: '', channel: 'widget' })
  }

  const cancelScheduled = async (id: string) => {
    if (!await confirmDialog('Cancel this scheduled message?')) return
    await (supabase as any).from('scheduled_messages').update({ status: 'cancelled' }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'cancelled' } : i))
  }

  const filtered = items.filter(i => tab === 'all' || i.type === tab)
  const upcoming = filtered.filter(i => i.status === 'pending').sort((a, b) => +new Date(a.scheduled_for) - +new Date(b.scheduled_for))
  const past = filtered.filter(i => i.status !== 'pending').sort((a, b) => +new Date(b.scheduled_for) - +new Date(a.scheduled_for))
  const pending = items.filter(i => i.status === 'pending')
  const sentCount = items.filter(i => i.status === 'sent').length
  const nextUp = [...pending].sort((a, b) => +new Date(a.scheduled_for) - +new Date(b.scheduled_for))[0]
  const count = (k: string) => k === 'all' ? items.length : items.filter(i => i.type === k).length

  return (
    <div className="sch">
      <style>{SCH_CSS}</style>
      <header className="sch-head">
        <div style={{ minWidth: 0 }}>
          <h1>Scheduled messages</h1>
          <p>Messages and review requests that go out at a time you choose.</p>
        </div>
        <button type="button" className="sch-new" onClick={() => { setQuick(quickTimes()); setShowCreate(v => !v) }} aria-expanded={showCreate}>
          {ICON.plus} Schedule a message
        </button>
      </header>

      <div className="sch-tiles">
        <div className="sch-tile"><span className="sch-tile-ic" style={{ '--t': '#f59e0b' } as React.CSSProperties}>{ICON.clock}</span><span className="sch-tile-l">Waiting to send</span><span className="sch-tile-v">{pending.length}</span><span className="sch-tile-s">{pending.filter(i => i.type === 'review_request').length} review request{pending.filter(i => i.type === 'review_request').length === 1 ? '' : 's'}</span></div>
        <div className="sch-tile"><span className="sch-tile-ic" style={{ '--t': '#6366f1' } as React.CSSProperties}>{ICON.cal}</span><span className="sch-tile-l">Next one out</span><span className="sch-tile-v sm">{nextUp ? when(nextUp.scheduled_for).day : 'Nothing queued'}</span><span className="sch-tile-s">{nextUp ? `${when(nextUp.scheduled_for).time} · ${when(nextUp.scheduled_for).rel}` : 'Schedule one above'}</span></div>
        <div className="sch-tile"><span className="sch-tile-ic" style={{ '--t': '#16a34a' } as React.CSSProperties}>{ICON.check}</span><span className="sch-tile-l">Sent</span><span className="sch-tile-v">{sentCount}</span><span className="sch-tile-s">All time</span></div>
      </div>

      {showCreate && (
        <section className="sch-form" aria-labelledby="sch-form-h">
          <div className="sch-form-top">
            <h2 id="sch-form-h">Schedule a message</h2>
            <div className="sch-seg" role="radiogroup" aria-label="What to send">
              {([['message', 'Message'], ['review_request', 'Review request']] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={form.type === k} className={form.type === k ? 'on' : ''} onClick={() => setForm(f => ({ ...f, type: k }))}>{l}</button>
              ))}
            </div>
          </div>
          <span className="sch-lbl" id="sch-ch-l">Send by</span>
          <div className="sch-chans" role="radiogroup" aria-labelledby="sch-ch-l">
            {CHANNELS.map(c => (
              <button key={c.k} type="button" role="radio" aria-checked={form.channel === c.k} className={form.channel === c.k ? 'on' : ''} onClick={() => setForm(f => ({ ...f, channel: c.k }))}>
                <BrandLogo brand={c.brand} size={22} radius={7} />{c.label}
              </button>
            ))}
          </div>
          <label className="sch-lbl" htmlFor="sch-msg">Message</label>
          <textarea id="sch-msg" className="sch-field sch-area" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            placeholder={form.type === 'review_request' ? 'Thanks for coming in! Would you leave us a quick review?' : 'What would you like to say?'} rows={3} />
          <span className="sch-lbl">When</span>
          <div className="sch-when">
            {quick.map(([l, v]) => (
              <button key={l} type="button" className={`sch-chip${form.scheduled_for === v ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, scheduled_for: v }))}>{l}</button>
            ))}
            <input type="datetime-local" className="sch-field sch-dt" aria-label="Date and time" value={form.scheduled_for} onChange={e => setForm(f => ({ ...f, scheduled_for: e.target.value }))} />
          </div>
          <div className="sch-actions">
            <button type="button" className="sch-go" onClick={createScheduled} disabled={!form.message.trim() || !form.scheduled_for}>
              {form.scheduled_for ? `Schedule for ${when(new Date(form.scheduled_for).toISOString()).day}, ${when(new Date(form.scheduled_for).toISOString()).time}` : 'Schedule'}
            </button>
            <button type="button" className="sch-cancel" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </section>
      )}

      <div className="sch-pills" role="tablist" aria-label="Show">
        {([['all', 'All'], ['message', 'Messages'], ['review_request', 'Review requests']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<span>{count(k)}</span></button>
        ))}
      </div>

      {loading ? <SkeletonList rows={5} /> : filtered.length === 0 ? (
        <div className="sch-empty">
          <span className="sch-empty-ic" aria-hidden>{ICON.cal}</span>
          <p className="sch-empty-t">Nothing scheduled yet</p>
          <p>Write a message now and pick when it goes out: a reminder, an offer or a review request.</p>
          <button type="button" className="sch-new" onClick={() => { setQuick(quickTimes()); setShowCreate(true) }}>{ICON.plus} Schedule a message</button>
        </div>
      ) : (<>
        {upcoming.length > 0 && <Group title="Coming up" items={upcoming} onCancel={cancelScheduled} />}
        {past.length > 0 && <Group title="Sent and cancelled" items={past} onCancel={cancelScheduled} muted />}
      </>)}
    </div>
  )
}

// Live chat, email or SMS, with the brand mark the inbox uses.
const CHANNELS: { k: string; label: string; brand: BrandKey }[] = [
  { k: 'widget', label: 'Live chat', brand: 'chat' },
  { k: 'email', label: 'Email', brand: 'email' },
  { k: 'sms', label: 'SMS', brand: 'sms' },
]
const STATUS: Record<string, { label: string; cls: string }> = { pending: { label: 'Scheduled', cls: 'pending' }, sent: { label: 'Sent', cls: 'sent' }, cancelled: { label: 'Cancelled', cls: 'cancelled' } }

/** "Thu 7 Oct", "10:00 am" and "in 3 days" / "2 days ago" for a time. */
function when(iso: string) {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
  const mins = Math.round((d.getTime() - Date.now()) / 60000), abs = Math.abs(mins)
  const span = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} hr` : `${Math.round(abs / 1440)} day${Math.round(abs / 1440) === 1 ? '' : 's'}`
  return { day, time, rel: abs < 1 ? 'now' : mins > 0 ? `in ${span}` : `${span} ago` }
}

// Quick times for the form: tomorrow 9 am and next Monday 9 am (local time).
function quickTimes(): [string, string][] {
  const at9 = (d: Date) => { d.setHours(9, 0, 0, 0); return d }
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const tmrw = at9(new Date(Date.now() + 86400000))
  const mon = at9(new Date()); mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7))
  return [['Tomorrow, 9 am', local(tmrw)], ['Monday, 9 am', local(mon)]]
}

type Scheduled = { id: string; type: string; channel: string; status: string; scheduled_for: string; message: string }

function Group({ title, items, onCancel, muted }: { title: string; items: Scheduled[]; onCancel: (id: string) => void; muted?: boolean }) {
  return (
    <section className={`sch-group${muted ? ' muted' : ''}`}>
      <h2>{title} <span>{items.length}</span></h2>
      <ul>
        {items.map(item => {
          const ch = CHANNELS.find(c => c.k === item.channel) || CHANNELS[0]
          const st = STATUS[item.status] || { label: item.status, cls: 'cancelled' }
          const w = when(item.scheduled_for)
          return (
            <li key={item.id} className="sch-item">
              <BrandLogo brand={ch.brand} size={38} radius={12} />
              <div className="sch-item-t">
                <div className="sch-item-top">
                  <b>{item.type === 'review_request' ? 'Review request' : 'Message'}</b>
                  <span className="sch-item-ch">{ch.label}</span>
                  <span className={`sch-status ${st.cls}`}>{st.label}</span>
                </div>
                <p className="sch-item-msg">{item.message}</p>
                <p className="sch-item-when">{ICON.clock}{w.day}, {w.time} · {w.rel}</p>
              </div>
              {item.status === 'pending' && <button type="button" className="sch-x" onClick={() => onCancel(item.id)}>Cancel</button>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const g = (d: React.ReactNode, s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const ICON = {
  plus: g(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 16),
  clock: g(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>, 15),
  cal: g(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  check: g(<polyline points="20 6 9 17 4 12" />),
}

const SCH_CSS = `
.sch{--f:#f4f4f5;--f2:#ececef;--mut:#71717a;max-width:1100px;margin:0 auto;padding:28px 16px 120px}
[data-theme="dark"] .sch{--f:#2a2a2e;--f2:#333337;--mut:#a1a1aa}
@media (min-width:900px){.sch{padding:32px 32px 120px}}
.sch button::before{display:none!important}
.sch-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.sch-head h1{margin:0;font-size:clamp(28px,3.4vw,34px);font-weight:700;letter-spacing:-.04em;line-height:1.05;color:var(--ink)}
.sch-head p{margin:8px 0 0;font-size:14.5px;color:var(--mut)}
.sch-new{display:inline-flex;align-items:center;gap:7px;height:42px;padding:0 18px;border:none;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:14px;font-weight:650;cursor:pointer;white-space:nowrap;transition:filter .15s,transform .12s}
.sch-new:hover{filter:brightness(.95)}.sch-new:active{transform:scale(.98)}
.sch-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:10px;margin-bottom:18px}
.sch-tile{display:flex;flex-direction:column;gap:2px;min-width:0;padding:16px;border-radius:20px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04)}
.sch-tile-ic{width:30px;height:30px;margin-bottom:8px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 14%,var(--card,#fff));color:var(--t)}
.sch-tile-l{font-size:13px;font-weight:600;color:var(--mut)}
.sch-tile-v{font-size:28px;font-weight:700;letter-spacing:-.035em;color:var(--ink);line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.sch-tile-v.sm{font-size:22px}
.sch-tile-s{font-size:12px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sch-tile-v,.sch-group h2,.sch-form h2{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.sch-pills{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 16px}
.sch-pills button{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border:none;border-radius:999px;background:var(--f);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}
.sch-pills button:hover{background:var(--f2)}
.sch-pills button span{font-weight:500;color:var(--mut);font-variant-numeric:tabular-nums}
.sch-pills button.on{background:var(--ink);color:var(--card,#fff)}
.sch-pills button.on span{color:inherit;opacity:.65}
.sch-group{margin-bottom:22px}
.sch-group h2{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--ink)}
.sch-group h2 span{min-width:22px;height:22px;padding:0 7px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--f);font-family:inherit;font-size:12px;font-weight:600;color:var(--mut)}
.sch-group ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.sch-item{display:flex;align-items:flex-start;gap:13px;padding:14px 16px;border-radius:18px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04)}
.sch-group.muted .sch-item{background:transparent;box-shadow:0 0 0 1px rgba(0,0,0,.05)}
.sch-group.muted .sch-item-msg{color:var(--mut)}
.sch-item-t{flex:1;min-width:0}
.sch-item-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sch-item-top b{font-size:14px;font-weight:650;color:var(--ink)}
.sch-item-ch{font-size:12.5px;color:#8e8e93}
.sch-status{margin-left:auto;font-size:12px;font-weight:650;padding:3px 10px;border-radius:999px}
.sch-status.pending{background:#fef3c7;color:#b45309}
.sch-status.sent{background:#dcfce7;color:#15803d}
.sch-status.cancelled{background:var(--f);color:var(--mut)}
.sch-item-msg{margin:5px 0 0;font-size:14px;line-height:1.5;color:var(--ink);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sch-item-when{display:flex;align-items:center;gap:6px;margin:7px 0 0;font-size:12.5px;color:var(--mut)}
.sch-x{align-self:center;height:32px;padding:0 13px;border:none;border-radius:999px;background:var(--f);color:#b91c1c;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.sch-x:hover{background:#fee2e2}
.sch-form{margin-bottom:20px;padding:18px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 16px 40px -18px rgba(15,23,42,.22);animation:schIn .3s cubic-bezier(.22,1,.36,1) both}
.sch-form-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.sch-form h2{margin:0;font-size:19px;font-weight:700;letter-spacing:-.025em;color:var(--ink)}
.sch-seg{display:inline-flex;padding:3px;border-radius:999px;background:var(--f)}
.sch-seg button{height:32px;padding:0 14px;border:none;border-radius:999px;background:none;font:inherit;font-size:13px;font-weight:600;color:var(--mut);cursor:pointer}
.sch-seg button.on{background:var(--card,#fff);color:var(--ink);box-shadow:0 1px 3px rgba(16,24,40,.12)}
.sch-lbl{display:block;margin:16px 0 8px;font-size:13px;font-weight:600;color:var(--ink)}
.sch-chans{display:flex;gap:8px;flex-wrap:wrap}
.sch-chans button{display:inline-flex;align-items:center;gap:9px;height:44px;padding:0 16px 0 10px;border:none;border-radius:14px;background:var(--f);font:inherit;font-size:14px;font-weight:600;color:var(--ink);cursor:pointer;transition:background .15s,box-shadow .15s}
.sch-chans button:hover{background:var(--f2)}
.sch-chans button.on{background:var(--card,#fff);box-shadow:0 0 0 2px var(--ink)}
.sch .sch-field{width:100%;border:1.5px solid transparent!important;border-radius:14px;background:var(--f)!important;box-shadow:none!important;font:inherit;font-size:14.5px;color:var(--ink)!important;outline:none;box-sizing:border-box;transition:background .15s,border-color .15s}
.sch .sch-field:focus{background:var(--card,#fff)!important;border-color:var(--f2)!important}
.sch-area{min-height:92px;padding:12px 14px;line-height:1.5;resize:vertical}
.sch-when{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sch-chip{height:40px;padding:0 15px;border:none;border-radius:999px;background:var(--f);font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer}
.sch-chip:hover{background:var(--f2)}
.sch-chip.on{background:var(--ink);color:var(--card,#fff)}
.sch .sch-dt{width:auto;flex:1 1 220px;height:40px;padding:0 14px}
.sch-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
.sch-go{height:46px;padding:0 22px;border:none;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:14.5px;font-weight:650;cursor:pointer}
.sch-go:disabled{opacity:.45;cursor:not-allowed}
.sch-cancel{height:46px;padding:0 20px;border:none;border-radius:999px;background:var(--f);color:var(--ink);font:inherit;font-size:14.5px;font-weight:600;cursor:pointer}
.sch-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:56px 20px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05)}
.sch-empty-ic{width:48px;height:48px;margin-bottom:6px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 12%,var(--card,#fff));color:var(--coral)}
.sch-empty-t{margin:0;font-size:17px;font-weight:650;color:var(--ink)}
.sch-empty p{margin:0;max-width:420px;font-size:14px;line-height:1.5;color:var(--mut)}
.sch-empty .sch-new{margin-top:12px}
.sch :focus-visible{outline:2px solid var(--coral);outline-offset:2px}
@keyframes schIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (max-width:560px){
  .sch-item{flex-wrap:wrap;padding:13px 14px}
  .sch-item-t{flex:1 1 calc(100% - 51px)}
  .sch-x{margin-left:51px;align-self:flex-start}
  .sch-tiles{grid-template-columns:1fr 1fr}
  .sch-tile{padding:14px}
  .sch-tile:nth-child(2){grid-column:1/-1;order:3}
  .sch-tile-v{font-size:24px}
}
`
