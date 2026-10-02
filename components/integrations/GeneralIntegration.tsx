'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { EVENT_GROUPS, INTEGRATIONS, eventLabel } from '@/lib/integrations-catalog'
import { authHeaders, useIntegrations } from '@/components/integrations/IntegrationsShell'
import { IntegrationPage, IntegrationHeader, Card, Notice, Icon, btn, inputCls, inputStyle } from '@/components/integrations/ui'

// Settings for one of the general integrations (Slack, Jira, Linear, Trello,
// Zapier, GitHub, Intercom, Zendesk, Custom Webhook): the details it needs,
// which Colvy events it acts on, a connection check, a test event, and a log
// of what was sent.

type Delivery = { id: string; event: string; title: string | null; status: 'sent' | 'failed' | 'skipped'; http_status: number | null; error: string | null; ref_url: string | null; test: boolean; created_at: string }

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function GeneralIntegration({ id }: { id: string }) {
  const def = INTEGRATIONS.find(i => i.id === id)!
  const { companyId, generic, setActive, reload } = useIntegrations()
  const saved = generic[id]

  const [config, setConfig] = useState<Record<string, string>>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<string[]>([])
  const [enabled, setEnabled] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'' | 'save' | 'toggle' | 'test' | 'event'>('')
  const [note, setNote] = useState<{ tone: 'success' | 'error' | 'info'; text: string; ref?: string | null } | null>(null)
  const [testEvent, setTestEvent] = useState('')
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null)

  // Seed from what's saved (or sensible defaults for a first setup).
  useEffect(() => {
    setConfig({ ...(saved?.config || {}) })
    setSecrets({ ...(saved?.secrets || {}) })
    setEvents(saved ? saved.events : (def.defaultEvents || []))
    setEnabled(!!saved?.enabled)
    setDirty(false); setNote(null)
  }, [id, saved, def.defaultEvents])

  const allowed = useMemo(() => EVENT_GROUPS.map(g => ({ ...g, events: g.events.filter(e => !def.events || def.events.includes(e.id)) })).filter(g => g.events.length), [def.events])
  useEffect(() => { if (!testEvent || !events.includes(testEvent)) setTestEvent(events[0] || def.defaultEvents?.[0] || 'order.created') }, [events, testEvent, def.defaultEvents])

  const loadDeliveries = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await fetch(`/api/integrations/deliveries?companyId=${companyId}&integrationId=${id}`, { headers: await authHeaders() })
      const d = await r.json()
      setDeliveries(d.deliveries || [])
    } catch { setDeliveries([]) }
  }, [companyId, id])
  useEffect(() => { loadDeliveries() }, [loadDeliveries])

  const setField = (k: string, v: string) => { setConfig(c => ({ ...c, [k]: v })); setDirty(true) }
  const toggleEvent = (e: string) => { setEvents(list => list.includes(e) ? list.filter(x => x !== e) : [...list, e]); setDirty(true) }
  const toggleGroup = (ids: string[]) => {
    setEvents(list => ids.every(i => list.includes(i)) ? list.filter(x => !ids.includes(x)) : Array.from(new Set([...list, ...ids])))
    setDirty(true)
  }

  const save = async (nextEnabled = enabled, mode: 'save' | 'toggle' = 'save') => {
    if (!companyId) return
    setBusy(mode); setNote(null)
    try {
      const res = await fetch('/api/integrations/configs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ companyId, integrationId: id, config, enabled: nextEnabled, events }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save the settings.')
      setEnabled(nextEnabled); setActive(id, nextEnabled); setDirty(false)
      if (d.secrets) setSecrets(d.secrets)
      // Secrets now live on the server only — clear what was typed.
      setConfig(c => { const n = { ...c }; for (const f of def.fields || []) if (f.secret) delete n[f.key]; return n })
      setNote({ tone: 'success', text: mode === 'toggle' ? (nextEnabled ? `${def.name} is on. Colvy will send the events you picked.` : `${def.name} is off.`) : 'Saved.' })
      reload()
    } catch (e: any) { setNote({ tone: 'error', text: e?.message || 'Could not save the settings.' }) }
    setBusy('')
  }

  const test = async (mode: 'connection' | 'event') => {
    if (!companyId) return
    setBusy(mode === 'connection' ? 'test' : 'event'); setNote(null)
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ companyId, integrationId: id, mode, event: testEvent, config }),
      })
      const d = await res.json().catch(() => ({}))
      setNote({ tone: res.ok && d.ok ? 'success' : 'error', text: d.message || d.error || 'Something went wrong.', ref: d.ref || null })
      if (mode === 'event') loadDeliveries()
    } catch (e: any) { setNote({ tone: 'error', text: e?.message || 'Network error.' }) }
    setBusy('')
  }

  const toggle = (
    <button type="button" role="switch" aria-checked={enabled} aria-label={enabled ? `Turn ${def.name} off` : `Turn ${def.name} on`}
      onClick={() => save(!enabled, 'toggle')} disabled={!!busy}
      className="inline-flex items-center gap-2.5 shrink-0 cursor-pointer disabled:opacity-60" style={{ background: 'none', border: 'none', padding: 0 }}>
      <span className="text-sm font-semibold" style={{ color: enabled ? '#15803d' : 'var(--slate)' }}>{enabled ? 'On' : 'Off'}</span>
      <span className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ background: enabled ? '#10b981' : '#d1d5db' }}>
        <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: enabled ? 'translateX(24px)' : 'translateX(4px)' }} />
      </span>
    </button>
  )

  return (
    <IntegrationPage>
      <IntegrationHeader id={id} connected={enabled} badge="On">{toggle}</IntegrationHeader>

      {note && (
        <Notice tone={note.tone}>
          {note.text}
          {note.ref && <> <a href={note.ref} target="_blank" rel="noreferrer" className="font-semibold underline">Open it</a></>}
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="space-y-5 min-w-0">
          <Card icon="key" title="Connection" sub={def.action}>
            <div className="space-y-4">
              {(def.fields || []).map(f => (
                <div key={f.key}>
                  <label htmlFor={`f-${f.key}`} className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
                    {f.label}{f.optional && <span className="font-normal" style={{ color: 'var(--slate)' }}> (optional)</span>}
                  </label>
                  <input id={`f-${f.key}`} type={f.type === 'password' ? 'password' : f.type === 'email' ? 'email' : 'text'} autoComplete="off" spellCheck={false}
                    value={config[f.key] || ''} onChange={e => setField(f.key, e.target.value)}
                    placeholder={f.secret && secrets[f.key] ? `Saved ${secrets[f.key]} · paste a new one to replace` : f.placeholder}
                    className={inputCls} style={inputStyle} />
                  {f.help && <p className="text-xs mt-1" style={{ color: 'var(--slate)', margin: '4px 0 0' }}>{f.help}</p>}
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap mt-5 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
              <button type="button" onClick={() => save(enabled)} disabled={!!busy} {...btn('primary', 'md', 'flex-1 min-w-[120px]')}>
                {busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Save'}
              </button>
              <button type="button" onClick={() => test('connection')} disabled={!!busy} {...btn('secondary')}>
                <Icon name="check" size={14} /> {busy === 'test' ? 'Checking…' : 'Test connection'}
              </button>
            </div>
          </Card>

          {!!def.setup?.length && (
            <Card icon="info" title="How to set it up">
              <ol className="space-y-3 text-sm" style={{ color: 'var(--slate)', margin: 0, padding: 0, listStyle: 'none' }}>
                {def.setup.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>{i + 1}</span>
                    <span className="pt-0.5 min-w-0" style={{ wordBreak: 'break-word' }}>{t}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <div className="space-y-5 min-w-0">
          <Card icon="bolt" title="When to send" sub={`${events.length} of ${allowed.reduce((n, g) => n + g.events.length, 0)} events selected`}
            right={dirty ? <button type="button" onClick={() => save(enabled)} disabled={!!busy} {...btn('primary', 'sm')}>{busy === 'save' ? 'Saving…' : 'Save'}</button> : undefined}>
            <div className="space-y-4">
              {allowed.map(g => {
                const ids = g.events.map(e => e.id)
                const all = ids.every(i => events.includes(i))
                return (
                  <div key={g.group}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--slate)', margin: 0 }}>{g.group}</p>
                      {ids.length > 1 && (
                        <button type="button" onClick={() => toggleGroup(ids)} className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--coral)', background: 'none', border: 'none', padding: 0 }}>
                          {all ? 'None' : 'All'}
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {g.events.map(e => (
                        <label key={e.id} className="flex items-start gap-3 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-gray-50">
                          <input type="checkbox" checked={events.includes(e.id)} onChange={() => toggleEvent(e.id)} className="w-4 h-4 mt-0.5 rounded cursor-pointer shrink-0" style={{ accentColor: 'var(--coral)' }} />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium" style={{ color: 'var(--ink)' }}>{e.label}</span>
                            {e.hint && <span className="block text-xs" style={{ color: 'var(--slate)' }}>{e.hint}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 flex-wrap items-center mt-5 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
              <select value={testEvent} onChange={e => setTestEvent(e.target.value)} aria-label="Event to test"
                className="flex-1 min-w-[160px] px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: 'var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 16 }}>
                {allowed.flatMap(g => g.events).map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
              <button type="button" onClick={() => test('event')} disabled={!!busy} {...btn('secondary')}>
                <Icon name="send" size={14} /> {busy === 'event' ? 'Sending…' : 'Send test event'}
              </button>
            </div>
          </Card>

          <Card icon="sync" title="Recent activity"
            right={<button type="button" onClick={loadDeliveries} {...btn('secondary', 'sm')} aria-label="Refresh"><Icon name="sync" size={13} /> Refresh</button>}>
            {deliveries === null ? (
              <p className="text-sm" style={{ color: 'var(--slate)', margin: 0 }}>Loading…</p>
            ) : deliveries.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--slate)', margin: 0 }}>Nothing sent yet. Send a test event to try it.</p>
            ) : (
              <ul className="divide-y" style={{ margin: 0, padding: 0, listStyle: 'none', borderColor: 'var(--border)' }}>
                {deliveries.slice(0, 12).map(d => {
                  const tone = d.status === 'sent' ? { bg: '#ecfdf3', fg: '#067647', label: 'Sent' } : d.status === 'failed' ? { bg: '#fef3f2', fg: '#b42318', label: 'Failed' } : { bg: '#f4f4f5', fg: '#52525b', label: 'Skipped' }
                  return (
                    <li key={d.id} className="py-2.5 first:pt-0 last:pb-0" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-start gap-2.5">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)', margin: 0 }}>{d.title || eventLabel(d.event)}</p>
                          <p className="text-xs" style={{ color: 'var(--slate)', margin: '2px 0 0' }}>
                            {eventLabel(d.event)}{d.test ? ' · test' : ''} · {ago(d.created_at)}
                          </p>
                          {d.status !== 'sent' && d.error && <p className="text-xs mt-1" style={{ color: d.status === 'failed' ? '#b42318' : 'var(--slate)', margin: '3px 0 0', wordBreak: 'break-word' }}>{d.error}</p>}
                        </div>
                        {d.ref_url && <a href={d.ref_url} target="_blank" rel="noreferrer" className="text-xs font-semibold shrink-0" style={{ color: 'var(--coral)' }}>Open</a>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </IntegrationPage>
  )
}
