'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { confirmDialog } from '@/components/ConfirmDialog'

// Agents page: outside tools. A business connects its agents to other systems
// that speak MCP (Zapier, a CRM, a booking or stock system…), picks which
// agents may use each one, and decides per tool: off, ask a person first, or
// on its own. Look-ups default to on their own; anything that changes
// something defaults to asking first.

type Tool = { key: string; name: string; title: string | null; description: string; read_only: boolean; mode: 'off' | 'auto' | 'ask' }
type Conn = { id: string; name: string; url: string; auth_type: 'none' | 'bearer' | 'header'; auth_header: string | null; has_secret: boolean; roles: string[]; tools: Tool[]; enabled: boolean; status: string; last_error: string | null; server_name: string | null; synced_at: string | null }
type Role = { key: string; name: string }

const EASE = 'cubic-bezier(.22,1,.36,1)'
const ico = (d: React.ReactNode, s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0 }}>{d}</svg>
const Plug = () => ico(<><path d="M9 2v6" /><path d="M15 2v6" /><path d="M6 8h12v4a6 6 0 0 1-12 0z" /><path d="M12 18v4" /></>, 18)
const Chev = ({ open }: { open: boolean }) => <span style={{ display: 'inline-flex', transition: `transform .3s ${EASE}`, transform: open ? 'rotate(90deg)' : 'none' }}>{ico(<polyline points="9 18 15 12 9 6" />, 15)}</span>
const Refresh = () => ico(<><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>, 14)
const Trash = () => ico(<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>, 14)
const Plus = () => ico(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 15)

const host = (u: string) => { try { return new URL(u).host } catch { return u } }
const MODE_LABEL: Record<Tool['mode'], string> = { off: 'Off', ask: 'Ask first', auto: 'On its own' }

export default function AgentConnections({ companyId }: { companyId: string }) {
  const [conns, setConns] = useState<Conn[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [missing, setMissing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string>('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', url: '', authType: 'bearer' as Conn['auth_type'], authHeader: 'X-API-Key', secret: '', roles: [] as string[] })

  const load = useCallback(async () => {
    try {
      const r = await authFetch(`/api/agent/connections?companyId=${companyId}`)
      const d = await r.json()
      if (r.ok) { setConns(d.connections || []); setRoles(d.roles || []); setMissing(!!d.missing) }
    } catch {} finally { setLoaded(true) }
  }, [companyId])
  useEffect(() => { load() }, [load])

  const post = async (body: any, tag: string): Promise<any> => {
    setBusy(tag); setError('')
    try {
      const r = await authFetch('/api/agent/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...body }) })
      const d = await r.json().catch(() => ({}))
      if (d.connection) setConns(cs => cs.map(c => c.id === d.connection.id ? d.connection : c))
      if (!r.ok || d.error) { setError(d.error || 'That didn’t work. Try again.'); return null }
      return d
    } catch { setError('Couldn’t reach Colvy. Try again.'); return null } finally { setBusy('') }
  }

  const create = async () => {
    const d = await post({ action: 'create', ...form }, 'create')
    if (d?.connection) {
      setConns(cs => [...cs, d.connection]); setOpen(d.connection.id); setAdding(false)
      setForm({ name: '', url: '', authType: 'bearer', authHeader: 'X-API-Key', secret: '', roles: [] })
    }
  }
  const setMode = (c: Conn, t: Tool, mode: Tool['mode']) => {
    if (t.mode === mode) return
    setConns(cs => cs.map(x => x.id === c.id ? { ...x, tools: x.tools.map(y => y.key === t.key ? { ...y, mode } : y) } : x))
    post({ action: 'update', id: c.id, tools: { [t.key]: mode } }, `mode:${t.key}`)
  }
  const toggleRole = (c: Conn, role: string) => {
    const next = c.roles.includes(role) ? c.roles.filter(r => r !== role) : [...c.roles, role]
    setConns(cs => cs.map(x => x.id === c.id ? { ...x, roles: next } : x))
    post({ action: 'update', id: c.id, roles: next }, `roles:${c.id}`)
  }
  const toggleEnabled = (c: Conn) => {
    setConns(cs => cs.map(x => x.id === c.id ? { ...x, enabled: !c.enabled } : x))
    post({ action: 'update', id: c.id, enabled: !c.enabled }, `enabled:${c.id}`)
  }
  const remove = async (c: Conn) => {
    const ok = await confirmDialog({ title: `Remove ${c.name}?`, message: 'Your agents stop using its tools straight away, and anything waiting for approval from it can’t run. You can connect it again later.', confirmLabel: 'Remove', tone: 'danger' })
    if (!ok) return
    const d = await post({ action: 'delete', id: c.id }, `delete:${c.id}`)
    if (d) setConns(cs => cs.filter(x => x.id !== c.id))
  }

  const statusChip = (c: Conn) => !c.enabled ? <span className="ag-chip">Off</span>
    : c.status === 'error' ? <span className="ag-chip bad">Problem</span>
    : <span className="ag-chip ok">Connected</span>

  return (
    <div className="ag-card ag-fade agx" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span className="ag-orb"><Plug /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="ag-h">Outside tools</p>
          <p className="ag-p">Connect your agents to other systems that support MCP — Zapier, your CRM, a booking or stock system. Look-ups happen on their own; anything that changes something asks a person first unless you say otherwise.</p>
        </div>
      </div>

      {missing && <p className="agx-note">Outside tools need a quick database update first: run <b>COLVY_V355_AGENT_CONNECTIONS.sql</b> in Supabase.</p>}
      {error && <p className="agx-err" role="alert">{error}</p>}

      {loaded && !missing && (
        <div className="agx-list">
          {conns.map(c => {
            const isOpen = open === c.id
            const on = c.tools.filter(t => t.mode !== 'off').length
            return (
              <div key={c.id} className={`agx-conn ${isOpen ? 'open' : ''}`}>
                <button type="button" className="agx-row" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
                  <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                    <span className="agx-name">{c.name}</span>
                    <span className="agx-sub">{host(c.url)} · {on} of {c.tools.length} tool{c.tools.length === 1 ? '' : 's'} on · {c.roles.length ? roles.filter(r => c.roles.includes(r.key)).map(r => r.name.replace(/ Agent$/, '')).join(', ') : 'no agents yet'}</span>
                  </span>
                  {statusChip(c)}
                  <Chev open={isOpen} />
                </button>
                <div className="agx-body" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
                  <div style={{ overflow: 'hidden', minWidth: 0 }}>
                    <div className="agx-inner">
                      {c.status === 'error' && c.last_error && <p className="agx-err">{c.last_error}</p>}
                      <p className="ag-label" style={{ margin: '0 0 8px' }}>Agents that may use it</p>
                      <div className="agx-pills">
                        {roles.map(r => (
                          <button key={r.key} type="button" className={`agx-pill ${c.roles.includes(r.key) ? 'on' : ''}`} aria-pressed={c.roles.includes(r.key)} onClick={() => toggleRole(c, r.key)}>{r.name.replace(/ Agent$/, '')}</button>
                        ))}
                      </div>
                      {!c.roles.length && <p className="agx-hint">Pick at least one agent, or its tools won’t be used.</p>}

                      <p className="ag-label" style={{ margin: '16px 0 8px' }}>Tools</p>
                      {c.tools.length === 0 && <p className="agx-hint">This server didn’t offer any tools.</p>}
                      <ul className="agx-tools">
                        {c.tools.map(t => (
                          <li key={t.key}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p className="agx-tool">{t.title || t.name}{t.read_only && <span className="agx-tag">Look-up</span>}</p>
                              {t.description && <p className="agx-desc">{t.description}</p>}
                            </div>
                            <div className="agx-seg" role="radiogroup" aria-label={`What ${t.title || t.name} may do`}>
                              {(['off', 'ask', 'auto'] as const).map(m => (
                                <button key={m} type="button" role="radio" aria-checked={t.mode === m} className={t.mode === m ? 'on' : ''} onClick={() => setMode(c, t, m)}>{MODE_LABEL[m]}</button>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                      <p className="agx-hint">“On its own” for a tool that changes something allows up to 50 a day; after that a person approves. Approvals show under Waiting for you.</p>

                      <div className="agx-actions">
                        <button type="button" className="ag-ghost agx-btn" onClick={() => post({ action: 'refresh', id: c.id }, `refresh:${c.id}`)} disabled={!!busy}>{busy === `refresh:${c.id}` ? <span className="ag-spin" /> : <Refresh />} Reload tools</button>
                        <button type="button" className="ag-ghost agx-btn danger" onClick={() => remove(c)} disabled={!!busy}><Trash /> Remove</button>
                        <span style={{ flex: 1 }} />
                        <span className="agx-sub" style={{ margin: 0 }}>{c.enabled ? 'On' : 'Off'}</span>
                        <button type="button" role="switch" aria-checked={c.enabled} aria-label={`${c.name} on or off`} className={`ag-switch ${c.enabled ? 'on' : ''}`} onClick={() => toggleEnabled(c)} disabled={busy === `enabled:${c.id}`}><span /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {!adding ? (
            <button type="button" className="agx-add" onClick={() => { setAdding(true); setError('') }} disabled={conns.length >= 10}><Plus /> Connect a tool</button>
          ) : (
            <div className="agx-form">
              <div className="agx-grid">
                <div>
                  <label className="ag-label" htmlFor="agx-name">Name</label>
                  <input id="agx-name" className="ag-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Zapier" maxLength={60} />
                </div>
                <div>
                  <label className="ag-label" htmlFor="agx-url">Server address</label>
                  <input id="agx-url" className="ag-input" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://…/mcp" inputMode="url" autoComplete="off" />
                </div>
              </div>
              <p className="ag-label" style={{ margin: '12px 0 6px' }}>How it signs in</p>
              <div className="agx-seg wide" role="radiogroup" aria-label="How it signs in">
                {([['none', 'Nothing / in the address'], ['bearer', 'API key or token'], ['header', 'Custom header']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={form.authType === k} className={form.authType === k ? 'on' : ''} onClick={() => setForm({ ...form, authType: k })}>{l}</button>
                ))}
              </div>
              {form.authType !== 'none' && (
                <div className="agx-grid" style={{ marginTop: 10 }}>
                  {form.authType === 'header' && (
                    <div>
                      <label className="ag-label" htmlFor="agx-h">Header name</label>
                      <input id="agx-h" className="ag-input" value={form.authHeader} onChange={e => setForm({ ...form, authHeader: e.target.value })} placeholder="X-API-Key" autoComplete="off" />
                    </div>
                  )}
                  <div>
                    <label className="ag-label" htmlFor="agx-k">{form.authType === 'bearer' ? 'API key or token' : 'Value'}</label>
                    <input id="agx-k" className="ag-input" type="password" value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} placeholder="Kept on Colvy’s server, never shown again" autoComplete="new-password" />
                  </div>
                </div>
              )}
              <p className="ag-label" style={{ margin: '12px 0 6px' }}>Agents that may use it</p>
              <div className="agx-pills">
                {roles.map(r => (
                  <button key={r.key} type="button" className={`agx-pill ${form.roles.includes(r.key) ? 'on' : ''}`} aria-pressed={form.roles.includes(r.key)} onClick={() => setForm({ ...form, roles: form.roles.includes(r.key) ? form.roles.filter(x => x !== r.key) : [...form.roles, r.key] })}>{r.name.replace(/ Agent$/, '')}</button>
                ))}
              </div>
              <p className="agx-hint">Only connect servers you trust — agents will read what they return. You choose what each tool may do after it connects.</p>
              <div className="agx-actions">
                <button type="button" className="ag-primary" onClick={create} disabled={busy === 'create' || !form.name.trim() || !form.url.trim() || (form.authType !== 'none' && !form.secret.trim())}>
                  {busy === 'create' ? <><span className="ag-spin" /> Connecting…</> : 'Connect'}
                </button>
                <button type="button" className="ag-ghost agx-btn" onClick={() => { setAdding(false); setError('') }} disabled={busy === 'create'}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
.agx-list{display:flex;flex-direction:column;gap:10px;margin-top:14px}
.agx-note{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:#fffaeb;color:#93370d;font-size:13px;line-height:1.45}
.agx-err{margin:10px 0;padding:9px 12px;border-radius:11px;background:#fef3f2;color:#b42318;font-size:12.5px;line-height:1.45}
.agx-conn{border:1px solid var(--border);border-radius:14px;background:#fff;transition:box-shadow .3s ${EASE},border-color .3s ease}
.agx-conn.open{box-shadow:0 8px 24px rgba(15,23,42,.06);border-color:color-mix(in srgb,var(--slate) 22%,var(--border))}
.agx-row{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;border:none;background:none;cursor:pointer;font-family:inherit;color:var(--ink)}
.agx-name{display:block;font-size:14px;font-weight:700;color:var(--ink)}
.agx-sub{display:block;margin-top:2px;font-size:12px;color:var(--slate);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agx-body{display:grid;transition:grid-template-rows .35s ${EASE}}
.agx-inner{padding:2px 14px 14px;border-top:1px solid var(--border);padding-top:12px}
.agx-pills{display:flex;flex-wrap:wrap;gap:6px}
.agx-pill{padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:#fff;font-size:12.5px;font-weight:600;color:var(--slate);cursor:pointer;font-family:inherit;transition:background .2s ease,color .2s ease,border-color .2s ease,transform .15s ${EASE}}
.agx-pill.on{background:color-mix(in srgb,var(--coral) 12%,#fff);border-color:color-mix(in srgb,var(--coral) 45%,#fff);color:var(--coral)}
.agx-pill:active{transform:scale(.96)}
.agx-hint{margin:8px 0 0;font-size:12px;color:var(--slate);line-height:1.45}
.agx-tools{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.agx-tools li{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.agx-tools li:last-child{border-bottom:none}
.agx-tool{margin:0;font-size:13.5px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.agx-tag{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:999px;background:#ecfdf3;color:#067647}
.agx-desc{margin:2px 0 0;font-size:12px;color:var(--slate);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.agx-seg{display:inline-flex;gap:3px;padding:3px;border-radius:11px;background:var(--canvas,#f3f4f6);flex-shrink:0}
.agx-seg button{padding:6px 10px;border:none;border-radius:8px;background:transparent;font-size:12px;font-weight:600;color:var(--slate);cursor:pointer;font-family:inherit;white-space:nowrap;transition:background .2s ease,color .2s ease,box-shadow .2s ease}
.agx-seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.12)}
.agx-seg.wide{display:flex;flex-wrap:wrap}
.agx-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px}
.agx-btn{display:inline-flex;align-items:center;gap:6px}
.agx-btn.danger{color:#b42318}
.agx-add{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 14px;border-radius:14px;border:1.5px dashed var(--border);background:none;color:var(--slate);font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:border-color .2s ease,color .2s ease,background .2s ease}
.agx-add:hover:not(:disabled){border-color:var(--coral);color:var(--coral);background:color-mix(in srgb,var(--coral) 5%,#fff)}
.agx-add:disabled{opacity:.5;cursor:default}
.agx-form{border:1px solid var(--border);border-radius:14px;padding:14px;background:#fff;animation:agx-in .35s ${EASE}}
.agx-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@keyframes agx-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (max-width:640px){
  .agx-grid{grid-template-columns:1fr}
  .agx-tools li{flex-direction:column;align-items:stretch;gap:8px}
  .agx-seg{display:flex}.agx-seg button{flex:1}
}
`
