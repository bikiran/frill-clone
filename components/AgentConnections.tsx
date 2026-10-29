'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { readStored, writeStored } from '@/lib/client-cache'
import { confirmDialog } from '@/components/ConfirmDialog'
import AgentFace from '@/components/agents/AgentFace'
import { useAgentTeam } from '@/components/agents/useAgentTeam'

// Agents page: outside tools. A business connects its agents to other systems
// that speak MCP (Zapier, a CRM, a booking or stock system…), picks which
// agents may use each one, and decides per tool: off, ask a person first, or
// on its own. Look-ups default to on their own; anything that changes
// something defaults to asking first.

type Tool = { key: string; name: string; title: string | null; description: string; read_only: boolean; mode: 'off' | 'auto' | 'ask'; problem?: string | null }
type Conn = { id: string; name: string; url: string; auth_type: 'none' | 'bearer' | 'header'; auth_header: string | null; has_secret: boolean; roles: string[]; tools: Tool[]; enabled: boolean; status: string; last_error: string | null; server_name: string | null; synced_at: string | null }
type Role = { key: string; name: string }

const EASE = 'cubic-bezier(.22,1,.36,1)'
const ico = (d: React.ReactNode, s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0 }}>{d}</svg>
const Plug = () => ico(<><path d="M9 2v6" /><path d="M15 2v6" /><path d="M6 8h12v4a6 6 0 0 1-12 0z" /><path d="M12 18v4" /></>, 18)
const Chev = ({ open }: { open: boolean }) => <span style={{ display: 'inline-flex', transition: `transform .3s ${EASE}`, transform: open ? 'rotate(90deg)' : 'none' }}>{ico(<polyline points="9 18 15 12 9 6" />, 15)}</span>
const Refresh = () => ico(<><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>, 14)
const Trash = () => ico(<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>, 14)
const Plus = () => ico(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 15)
const Close = () => ico(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, 15)
const Shield = () => ico(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></>, 15)
// The three ways a server can sign in, as choice cards.
const SIGN_IN: { k: 'none' | 'bearer' | 'header'; label: string; hint: string; icon: React.ReactNode }[] = [
  { k: 'none', label: 'No sign-in', hint: 'Or the key is in the address', icon: ico(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>, 17) },
  { k: 'bearer', label: 'API key or token', hint: 'Sent as a Bearer token', icon: ico(<><circle cx="7.5" cy="15.5" r="4.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>, 17) },
  { k: 'header', label: 'Custom header', hint: 'Your own header and value', icon: ico(<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>, 17) },
]

const host = (u: string) => { try { return new URL(u).host } catch { return u } }
const MODE_LABEL: Record<Tool['mode'], string> = { off: 'Off', ask: 'Ask first', auto: 'On its own' }

export default function AgentConnections({ companyId }: { companyId: string }) {
  const cached = readStored<any>(`agents-connections:${companyId}`)
  const [conns, setConns] = useState<Conn[]>(cached?.connections || [])
  const [roles, setRoles] = useState<Role[]>(cached?.roles || [])
  const [missing, setMissing] = useState(!!cached?.missing)
  const [loaded, setLoaded] = useState(!!cached)
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string>('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', url: '', authType: 'bearer' as Conn['auth_type'], authHeader: 'X-API-Key', secret: '', roles: [] as string[] })
  const { faceOf } = useAgentTeam(companyId)

  const load = useCallback(async () => {
    try {
      const r = await authFetch(`/api/agent/connections?companyId=${companyId}`)
      const d = await r.json()
      if (r.ok) { setConns(d.connections || []); setRoles(d.roles || []); setMissing(!!d.missing); writeStored(`agents-connections:${companyId}`, d) }
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
                              {t.problem && t.mode !== 'off' && <p className="agx-err">The agents can’t use this tool: its settings from {c.server_name || c.name} are invalid ({t.problem}). They carry on without it. Ask whoever runs that server to fix the tool, then press Reload tools.</p>}
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
            <button type="button" className="agx-add" onClick={() => { setAdding(true); setError('') }} disabled={conns.length >= 10}>
              <span className="agx-add-ic" aria-hidden><Plus /></span>
              <span className="agx-add-t"><b>Connect a tool</b><small>{conns.length >= 10 ? 'You’ve connected the most tools a workspace can have (10).' : 'Zapier, your CRM, a booking or stock system: anything with an MCP server'}</small></span>
              {ico(<polyline points="9 18 15 12 9 6" />, 16)}
            </button>
          ) : (
            <div className="agx-form" role="group" aria-labelledby="agx-form-h">
              <div className="agx-form-h">
                <span className="ag-orb agx-form-orb" aria-hidden><Plug /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p id="agx-form-h" className="agx-form-title">Connect a tool</p>
                  <p className="agx-form-sub">Point your agents at a server that speaks MCP.</p>
                </div>
                <button type="button" className="agx-x" aria-label="Cancel" onClick={() => { setAdding(false); setError('') }} disabled={busy === 'create'}><Close /></button>
              </div>
              <div className="agx-grid">
                <div>
                  <label className="agx-lbl" htmlFor="agx-name">Name</label>
                  <input id="agx-name" className="agx-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Zapier" maxLength={60} autoFocus />
                </div>
                <div>
                  <label className="agx-lbl" htmlFor="agx-url">Server address</label>
                  <input id="agx-url" className="agx-input" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://…/mcp" inputMode="url" autoComplete="off" spellCheck={false} />
                </div>
              </div>
              <p className="agx-lbl" id="agx-auth-l">How it signs in</p>
              <div className="agx-auth" role="radiogroup" aria-labelledby="agx-auth-l">
                {SIGN_IN.map(o => (
                  <button key={o.k} type="button" role="radio" aria-checked={form.authType === o.k} className={`agx-auth-opt${form.authType === o.k ? ' on' : ''}`} onClick={() => setForm({ ...form, authType: o.k })}>
                    <span className="agx-auth-ic" aria-hidden>{o.icon}</span>
                    <span className="agx-auth-t"><b>{o.label}</b><small>{o.hint}</small></span>
                  </button>
                ))}
              </div>
              {form.authType !== 'none' && (
                <div className="agx-grid agx-secret">
                  {form.authType === 'header' && (
                    <div>
                      <label className="agx-lbl" htmlFor="agx-h">Header name</label>
                      <input id="agx-h" className="agx-input" value={form.authHeader} onChange={e => setForm({ ...form, authHeader: e.target.value })} placeholder="X-API-Key" autoComplete="off" spellCheck={false} />
                    </div>
                  )}
                  <div>
                    <label className="agx-lbl" htmlFor="agx-k">{form.authType === 'bearer' ? 'API key or token' : 'Value'}</label>
                    <input id="agx-k" className="agx-input" type="password" value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} placeholder="Kept on Colvy’s server, never shown again" autoComplete="new-password" />
                  </div>
                </div>
              )}
              <p className="agx-lbl">Agents that may use it</p>
              <div className="agx-pills">
                {roles.map(r => (
                  <button key={r.key} type="button" className={`agx-pill ${form.roles.includes(r.key) ? 'on' : ''}`} aria-pressed={form.roles.includes(r.key)} onClick={() => setForm({ ...form, roles: form.roles.includes(r.key) ? form.roles.filter(x => x !== r.key) : [...form.roles, r.key] })}>
                    <AgentFace face={faceOf(r.key)} size={20} />{r.name.replace(/ Agent$/, '')}
                  </button>
                ))}
              </div>
              <p className="agx-trust"><Shield /><span>Only connect servers you trust: agents read what they return. You choose what each tool may do once it’s connected.</span></p>
              <div className="agx-actions">
                <button type="button" className="agx-go" onClick={create} disabled={busy === 'create' || !form.name.trim() || !form.url.trim() || (form.authType !== 'none' && !form.secret.trim())}>
                  {busy === 'create' ? <><span className="ag-spin" /> Connecting…</> : 'Connect'}
                </button>
                <button type="button" className="agx-cancel" onClick={() => { setAdding(false); setError('') }} disabled={busy === 'create'}>Cancel</button>
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
.agx-conn{border-radius:18px;background:#f6f6f7;transition:box-shadow .3s ${EASE},background .3s ease}
.agx-conn.open{background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 12px 30px -14px rgba(15,23,42,.18)}
.agx-row{display:flex;align-items:center;gap:10px;width:100%;padding:13px 16px;border:none;background:none;cursor:pointer;font-family:inherit;color:var(--ink)}
.agx-name{display:block;font-size:14px;font-weight:700;color:var(--ink)}
.agx-sub{display:block;margin-top:2px;font-size:12px;color:var(--slate);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agx-body{display:grid;transition:grid-template-rows .35s ${EASE}}
.agx-inner{padding:12px 16px 16px;border-top:1px solid #ececee}
.agx-pills{display:flex;flex-wrap:wrap;gap:6px}
.agx-pill{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px 0 8px;border-radius:999px;border:none;background:#f4f4f5;font-size:13.5px;font-weight:600;color:#3f3f46;cursor:pointer;font-family:inherit;transition:background .2s ease,color .2s ease,transform .15s ${EASE}}
.agx-pill:hover{background:#ececef}
.agx-pill.on{background:#18181b;color:#fff}
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
.agx-add{display:flex;align-items:center;gap:13px;width:100%;padding:12px 16px 12px 12px;border-radius:18px;border:none;background:#f6f6f7;color:#71717a;text-align:left;cursor:pointer;font-family:inherit;transition:background .2s ease,transform .15s ${EASE}}
.agx-add-ic{width:40px;height:40px;flex-shrink:0;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;background:#18181b;color:#fff;transition:transform .25s ${EASE}}
.agx-add-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.35}
.agx-add-t b{font-size:14.5px;font-weight:650;color:var(--ink)}
.agx-add-t small{font-size:12.5px;color:#8e8e93}
.agx-add:hover:not(:disabled){background:#efeff1}
.agx-add:hover:not(:disabled) .agx-add-ic{transform:rotate(90deg)}
.agx-add:active:not(:disabled){transform:scale(.995)}
.agx-add:disabled{opacity:.5;cursor:default}
.agx-form{border-radius:22px;padding:18px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 16px 40px -18px rgba(15,23,42,.22);animation:agx-in .35s ${EASE}}
.agx-form button::before,.agx-add::before,.agx-pill::before{display:none!important}
.agx-form-h{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.agx-form-orb{width:40px;height:40px}
.agx-form-title{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:19px;font-weight:700;letter-spacing:-.025em;color:var(--ink)}
.agx-form-sub{margin:2px 0 0;font-size:13px;color:#8e8e93}
.agx-x{width:34px;height:34px;flex-shrink:0;border:none;border-radius:50%;background:#f4f4f5;color:#71717a;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.agx-x:hover{background:#ececef;color:var(--ink)}
.agx-lbl{display:block;margin:16px 0 7px;font-size:13px;font-weight:600;color:var(--ink)}
.agx-grid .agx-lbl{margin-top:0}
.agx-input{width:100%;height:46px;padding:0 14px;border-radius:14px;border:1.5px solid transparent!important;background:#f4f4f5!important;box-shadow:none!important;font:inherit;font-size:14.5px;color:var(--ink);outline:none;box-sizing:border-box;transition:background .15s,border-color .15s}
.agx-input:focus{background:var(--card,#fff)!important;border-color:#e4e4e7!important}
.agx-auth{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.agx-auth-opt{display:flex;align-items:center;gap:10px;min-height:58px;padding:10px 12px;border:none;border-radius:16px;background:#f4f4f5;text-align:left;font:inherit;cursor:pointer;transition:background .15s,box-shadow .15s}
.agx-auth-opt:hover{background:#ececef}
.agx-auth-opt.on{background:var(--card,#fff);box-shadow:0 0 0 2px #18181b}
.agx-auth-ic{width:32px;height:32px;flex-shrink:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);color:#52525b}
.agx-auth-opt.on .agx-auth-ic{background:#18181b;color:#fff}
.agx-auth-t{min-width:0;display:flex;flex-direction:column;line-height:1.3}
.agx-auth-t b{font-size:13.5px;font-weight:650;color:var(--ink)}
.agx-auth-t small{font-size:11.5px;color:#8e8e93}
.agx-secret{margin-top:12px}
.agx-trust{display:flex;align-items:flex-start;gap:9px;margin:16px 0 0;padding:11px 13px;border-radius:14px;background:#f6f6f7;font-size:12.5px;line-height:1.5;color:#52525b}
.agx-trust svg{margin-top:1px;color:#16a34a}
.agx-go{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 24px;border:none;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:14.5px;font-weight:650;cursor:pointer;transition:filter .15s,transform .12s}
.agx-go:hover:not(:disabled){filter:brightness(.95)}
.agx-go:active:not(:disabled){transform:scale(.98)}
.agx-go:disabled{opacity:.45;cursor:not-allowed}
.agx-cancel{height:44px;padding:0 20px;border:none;border-radius:999px;background:#f4f4f5;color:var(--ink);font:inherit;font-size:14.5px;font-weight:600;cursor:pointer}
.agx-cancel:hover{background:#ececef}
.agx-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@keyframes agx-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (max-width:640px){
  .agx-grid,.agx-auth{grid-template-columns:1fr}
  .agx-tools li{flex-direction:column;align-items:stretch;gap:8px}
  .agx-seg{display:flex}.agx-seg button{flex:1}
}
`
