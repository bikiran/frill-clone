'use client'

// Settings → Automations (owners and admins). The business's automations, each
// with its Live switch, and the starting points. A new one opens in the
// builder (/admin/automations/[id]). docs/plans/automations.md has the plan.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiRaw } from '@/components/jobs/shared'
import { Ic, MiniFlow, summary, AB_TOKENS } from '@/components/automations/kit'
import type { Graph } from '@/lib/automations/graph'
import { useCompanyUser, SettingsPage } from '../_shared'

type Auto = { id: string; name: string; enabled: boolean; triggerType: string; graph: Graph; runCount: number; lastRunAt: string | null; updatedAt: string; problems: { nodeId?: string; message: string }[] }
type Tpl = { id: string; name: string; about: string; graph: Graph }

function ago(iso: string | null) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export default function AutomationsSettings() {
  const router = useRouter()
  const { companyId, loading } = useCompanyUser()
  const [list, setList] = useState<Auto[] | null>(null)
  const [templates, setTemplates] = useState<Tpl[]>([])
  const [planOk, setPlanOk] = useState(true)
  const [missing, setMissing] = useState('')
  const [err, setErr] = useState('')
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Auto | null>(null)
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null)

  const say = (text: string, bad = false) => { setToast({ text, bad }); setTimeout(() => setToast(null), bad ? 5000 : 2600) }

  const load = async () => {
    const r = await apiRaw(`/api/automations?companyId=${companyId}`)
    if (!r.ok) { setErr(r.data?.error || 'Couldn’t load your automations.'); return }
    setList(r.data.automations || []); setTemplates(r.data.templates || []); setPlanOk(r.data.planOk !== false)
    setMissing(r.data.missing ? r.data.hint : '')
  }
  useEffect(() => { if (companyId) void load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (template: string) => {
    setBusy(template)
    const r = await apiRaw('/api/automations', { method: 'POST', json: { companyId, template } })
    setBusy(null)
    if (!r.ok) { say(r.data?.error || 'Couldn’t create it.', true); return }
    router.push(`/admin/automations/${r.data.automation.id}`)
  }
  const setLive = async (a: Auto, on: boolean) => {
    setList(l => l?.map(x => x.id === a.id ? { ...x, enabled: on } : x) || l)
    const r = await apiRaw(`/api/automations/${a.id}`, { method: 'PATCH', json: { companyId, enabled: on } })
    if (!r.ok) {
      setList(l => l?.map(x => x.id === a.id ? { ...x, enabled: !on } : x) || l)
      say(r.data?.error || 'Couldn’t change it.', true)
      return
    }
    say(on ? `“${a.name}” is live.` : `“${a.name}” is off.`)
  }
  const remove = async (a: Auto) => {
    setConfirm(null)
    const r = await apiRaw(`/api/automations/${a.id}?companyId=${companyId}`, { method: 'DELETE' })
    if (!r.ok) { say(r.data?.error || 'Couldn’t delete it.', true); return }
    setList(l => l?.filter(x => x.id !== a.id) || l)
    say(`Deleted “${a.name}”.`)
  }

  const live = useMemo(() => (list || []).filter(a => a.enabled).length, [list])
  if (loading) return null

  return (
    <SettingsPage
      title="Automations"
      sub="Draw what Colvy does when a customer writes in or a call is missed: reply, assign, tag, create a task, wait, hand to Colvy AI."
      actions={list && list.length > 0 ? <button className="au-new" onClick={() => setPicker(true)}><Ic name="plus" size={15} stroke={2.6} /> New automation</button> : undefined}
    >
      <style>{AB_TOKENS + CSS}</style>
      <div className="ab-tok au">
        {err && <div className="au-alert bad"><Ic name="warn" size={15} /> {err}</div>}
        {missing && <div className="au-alert"><Ic name="warn" size={15} /> {missing}</div>}
        {!planOk && <div className="au-alert"><Ic name="warn" size={15} /> Automations run on the Inbox and Everything plans. You can build and try them now; upgrade in Billing to switch them on.</div>}

        {list === null && !err && <div className="au-skel"><span /><span /><span /></div>}

        {list && list.length > 0 && <>
          <p className="au-count">{list.length} {list.length === 1 ? 'automation' : 'automations'} · {live} live</p>
          <ul className="au-list">
            {list.map((a, i) => {
              const t = a.graph.nodes.find(n => n.kind === 'trigger')
              const steps = a.graph.nodes.length - 1
              const fix = a.problems.length > 0
              return (
                <li key={a.id} className={`au-row${a.enabled ? ' on' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
                  <button className="au-main" onClick={() => router.push(`/admin/automations/${a.id}`)}>
                    <span className="au-ic" style={{ background: a.triggerType === 'missed_call' ? '#0ea5e9' : '#ff6a4d' }}><Ic name={a.triggerType === 'missed_call' ? 'phone' : 'flow'} size={18} /></span>
                    <span className="au-txt">
                      <b>{a.name}</b>
                      <small>{t ? summary(t) : 'No trigger yet'} · {steps} {steps === 1 ? 'step' : 'steps'}{a.runCount ? ` · ran ${a.runCount} ${a.runCount === 1 ? 'time' : 'times'}${a.lastRunAt ? `, last ${ago(a.lastRunAt)}` : ''}` : ''}</small>
                    </span>
                    <span className={`au-chip ${a.enabled ? 'live' : fix ? 'fix' : ''}`}>{a.enabled ? 'Live' : fix ? `${a.problems.length} to fix` : 'Off'}</span>
                  </button>
                  <div className="au-side">
                    <button className={`au-sw${a.enabled ? ' on' : ''}`} role="switch" aria-checked={a.enabled} aria-label={`${a.name} live`} disabled={!a.enabled && (fix || !planOk)}
                      title={!a.enabled && fix ? `Fix this first: ${a.problems[0].message}` : !a.enabled && !planOk ? 'Not on your plan' : a.enabled ? 'Switch off' : 'Switch on'}
                      onClick={() => setLive(a, !a.enabled)}><i /></button>
                    <button className="au-x" onClick={() => setConfirm(a)} aria-label={`Delete ${a.name}`} title="Delete"><Ic name="trash" size={15} /></button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>}

        {list && list.length === 0 && !missing && (
          <div className="au-hero">
            <div className="au-hero-art" aria-hidden><MiniFlow graph={templates.find(t => t.id === 'refunds')?.graph || { nodes: [], edges: [] }} height={150} /></div>
            <div className="au-hero-txt">
              <h2>Your first automation</h2>
              <p>Pick a starting point below and change it to suit you, or start from scratch. Nothing runs until you switch it on, and <b>Try it</b> shows what would happen first.</p>
            </div>
          </div>
        )}

        {list && (list.length === 0 || picker) && templates.length > 0 && (
          picker ? (
            <div className="au-scrim" onClick={() => setPicker(false)}>
              <div className="au-modal" role="dialog" aria-modal="true" aria-label="New automation" onClick={e => e.stopPropagation()}>
                <div className="au-mh"><div><h3>New automation</h3><p>Start from one of these and make it yours.</p></div><button className="au-close" onClick={() => setPicker(false)} aria-label="Close"><Ic name="x" size={15} /></button></div>
                <Templates templates={templates} busy={busy} onPick={create} />
              </div>
            </div>
          ) : <>
            <h3 className="au-h">Start from</h3>
            <Templates templates={templates} busy={busy} onPick={create} />
          </>
        )}
      </div>

      {confirm && (
        <div className="ab-tok au-scrim" onClick={() => setConfirm(null)}>
          <div className="au-modal sm" role="alertdialog" aria-modal="true" aria-label="Delete automation" onClick={e => e.stopPropagation()}>
            <h3>Delete “{confirm.name}”?</h3>
            <p>It stops straight away, and its run history goes too. This can’t be undone.</p>
            <div className="au-btns">
              <button className="au-ghost" onClick={() => setConfirm(null)}>Keep it</button>
              <button className="au-danger" onClick={() => remove(confirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`au-toast${toast.bad ? ' bad' : ''}`} role="status">{toast.text}</div>}
    </SettingsPage>
  )
}

function Templates({ templates, busy, onPick }: { templates: Tpl[]; busy: string | null; onPick: (id: string) => void }) {
  return (
    <div className="au-tpls">
      {templates.map((t, i) => (
        <button key={t.id} className={`au-tpl${t.id === 'blank' ? ' blank' : ''}`} onClick={() => onPick(t.id)} disabled={!!busy} style={{ animationDelay: `${i * 45}ms` }}>
          <span className="au-tpl-art">{t.id === 'blank' ? <span className="au-plus"><Ic name="plus" size={22} stroke={2.4} /></span> : <MiniFlow graph={t.graph} height={78} />}</span>
          <b>{busy === t.id ? 'Setting it up…' : t.name}</b>
          <small>{t.about}</small>
        </button>
      ))}
    </div>
  )
}

const CSS = `
.au{display:flex;flex-direction:column;gap:14px}
.au-new{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 20px;border-radius:999px;border:none;background:var(--coral,#ff7a6b);color:#fff;font:inherit;font-size:14px;font-weight:650;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12);transition:transform .15s}
.au-new:active{transform:scale(.97)}
.au-alert{display:flex;gap:9px;align-items:center;padding:12px 14px;border-radius:14px;background:#fffbeb;color:#92400e;font-size:13.5px;line-height:1.45}
.au-alert.bad{background:#fef2f2;color:#b91c1c}
[data-theme="dark"] .au-alert{background:rgba(245,158,11,.1);color:#fbbf24}
[data-theme="dark"] .au-alert.bad{background:rgba(239,68,68,.12);color:#fca5a5}
.au-count{margin:0;font-size:13px;color:var(--ab-mut);font-weight:550}
.au-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.au-row{display:flex;align-items:center;gap:8px;padding:6px 10px 6px 6px;border-radius:18px;background:var(--ab-card);border:1.5px solid var(--ab-line);transition:border-color .2s,box-shadow .2s,transform .2s;animation:auIn .4s cubic-bezier(.2,.9,.3,1.15) both}
.au-row:hover{box-shadow:var(--ab-shadow);transform:translateY(-1px)}
.au-row.on{border-color:rgba(34,160,107,.35)}
.au-main{flex:1;min-width:0;display:flex;align-items:center;gap:14px;padding:10px;border:none;background:none;font:inherit;color:var(--ab-ink);text-align:left;cursor:pointer;border-radius:14px}
.au-ic{width:44px;height:44px;border-radius:13px;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}
.au-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.au-txt b{font-size:15.5px;font-weight:650;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.au-txt small{font-size:13px;color:var(--ab-mut);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.au-chip{font-size:12px;font-weight:700;padding:4px 11px;border-radius:999px;background:var(--ab-soft);color:var(--ab-mut);white-space:nowrap;flex-shrink:0}
.au-chip.live{background:rgba(34,160,107,.13);color:#15803d}
.au-chip.fix{background:#fffbeb;color:#b45309}
[data-theme="dark"] .au-chip.live{color:#4ade80}
[data-theme="dark"] .au-chip.fix{background:rgba(245,158,11,.12);color:#fbbf24}
.au-side{display:flex;align-items:center;gap:6px;flex-shrink:0}
.au-sw{width:44px;height:26px;border-radius:999px;border:none;background:#d4d4d8;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
.au-sw i{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .32s cubic-bezier(.3,1.5,.5,1)}
.au-sw.on{background:#22a06b}
.au-sw.on i{transform:translateX(18px)}
.au-sw:disabled{opacity:.45;cursor:not-allowed}
.au-x{width:34px;height:34px;border-radius:50%;border:none;background:none;color:var(--ab-mut);display:flex;align-items:center;justify-content:center;cursor:pointer}
.au-x:hover{background:#fef2f2;color:#dc2626}
[data-theme="dark"] .au-x:hover{background:rgba(239,68,68,.12)}
.au-hero{display:flex;align-items:center;gap:22px;padding:22px;border-radius:22px;background:linear-gradient(135deg,color-mix(in srgb,var(--ab-coral) 9%,var(--ab-card)),var(--ab-card) 60%);border:1.5px solid var(--ab-line);overflow:hidden}
.au-hero-art{flex:0 0 46%;min-width:0;padding:10px;border-radius:16px;background:var(--ab-bg);background-image:radial-gradient(circle,var(--ab-dot) 1px,transparent 1.2px);background-size:14px 14px;animation:auFloat 6s ease-in-out infinite}
.au-hero-txt h2{margin:0 0 6px;font-family:var(--font-display),inherit;font-size:22px;letter-spacing:-.03em;color:var(--ab-ink)}
.au-hero-txt p{margin:0;font-size:14px;line-height:1.55;color:var(--ab-mut)}
.au-hero-txt b{color:var(--ab-ink)}
.au-h{margin:8px 0 0;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ab-mut)}
.au-tpls{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.au-tpl{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:12px 12px 14px;border-radius:18px;border:1.5px solid var(--ab-line);background:var(--ab-card);font:inherit;color:var(--ab-ink);text-align:left;cursor:pointer;transition:transform .2s cubic-bezier(.3,1.4,.5,1),box-shadow .2s,border-color .2s;animation:auIn .4s cubic-bezier(.2,.9,.3,1.15) both}
.au-tpl:hover:not(:disabled){transform:translateY(-3px);box-shadow:var(--ab-shadow);border-color:color-mix(in srgb,var(--ab-coral) 40%,var(--ab-line))}
.au-tpl:disabled{opacity:.6;cursor:wait}
.au-tpl-art{width:100%;height:90px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--ab-bg);background-image:radial-gradient(circle,var(--ab-dot) 1px,transparent 1.2px);background-size:12px 12px;margin-bottom:4px;padding:6px;box-sizing:border-box}
.au-plus{width:46px;height:46px;border-radius:50%;background:var(--ab-card);border:1.5px solid var(--ab-line);display:flex;align-items:center;justify-content:center;color:var(--ab-coral)}
.au-tpl b{font-size:14.5px;font-weight:650;letter-spacing:-.01em}
.au-tpl small{font-size:12.5px;line-height:1.45;color:var(--ab-mut)}
.au-scrim{position:fixed;inset:0;z-index:90;background:rgba(15,15,20,.36);display:flex;align-items:center;justify-content:center;padding:16px;animation:auFade .2s}
.au-modal{width:min(760px,100%);max-height:calc(100dvh - 32px);overflow-y:auto;background:var(--ab-card,#fff);border-radius:24px;padding:20px;box-shadow:0 30px 80px -20px rgba(0,0,0,.45);animation:auPop .32s cubic-bezier(.3,1.4,.5,1)}
.au-modal.sm{width:min(400px,100%)}
.au-modal h3{margin:0;font-family:var(--font-display),inherit;font-size:20px;letter-spacing:-.02em;color:var(--ab-ink)}
.au-modal p{margin:6px 0 0;font-size:14px;line-height:1.5;color:var(--ab-mut)}
.au-mh{display:flex;justify-content:space-between;gap:12px;margin-bottom:16px}
.au-close{width:34px;height:34px;border-radius:50%;border:1.5px solid var(--ab-line);background:var(--ab-card);color:var(--ab-ink);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
.au-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.au-ghost,.au-danger{height:40px;padding:0 18px;border-radius:999px;font:inherit;font-size:14px;font-weight:650;cursor:pointer}
.au-ghost{border:1.5px solid var(--ab-line);background:var(--ab-card);color:var(--ab-ink)}
.au-danger{border:none;background:#dc2626;color:#fff}
.au-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:95;padding:11px 18px;border-radius:14px;background:#18181b;color:#fff;font-size:13.5px;font-weight:550;max-width:calc(100% - 32px);box-shadow:0 12px 30px -10px rgba(0,0,0,.45);animation:auToast .3s cubic-bezier(.3,1.4,.5,1)}
.au-toast.bad{background:#b91c1c}
.au-skel{display:flex;flex-direction:column;gap:10px}
.au-skel span{height:72px;border-radius:18px;background:linear-gradient(90deg,var(--ab-soft),color-mix(in srgb,var(--ab-soft) 40%,var(--ab-card)),var(--ab-soft));background-size:200% 100%;animation:auShim 1.2s linear infinite}
@keyframes auIn{from{opacity:0;transform:translateY(8px)}}
@keyframes auFade{from{opacity:0}}
@keyframes auPop{from{opacity:0;transform:translateY(10px) scale(.96)}}
@keyframes auToast{from{opacity:0;transform:translate(-50%,12px)}}
@keyframes auShim{to{background-position:-200% 0}}
@keyframes auFloat{50%{transform:translateY(-4px)}}
@media (max-width:640px){
  .au-hero{flex-direction:column;align-items:stretch;padding:16px}
  .au-hero-art{flex:none}
  .au-row{flex-wrap:wrap;padding:6px}
  .au-main{gap:12px}
  .au-chip{display:none}
  .au-tpls{grid-template-columns:1fr 1fr;gap:10px}
  .au-tpl-art{height:70px}
}
@media (max-width:400px){.au-tpls{grid-template-columns:1fr}}
@media (prefers-reduced-motion: reduce){.au *,.au-modal,.au-toast{animation:none !important;transition:none !important}}
`
