// A small MCP client: lets Colvy agents use tools on a business's own outside
// tool servers (Zapier MCP, their CRM, a booking system…) over MCP's
// Streamable HTTP transport.
//
// Only what the agents need: initialize, tools/list and tools/call. Each
// operation opens its own short session (initialize → request), so nothing is
// held between agent steps. Servers may answer with JSON or a one-shot SSE
// stream; both are read. Addresses must be public https (never our own
// network), redirects are not followed, and every request has a time limit.

import { checkPublicUrl } from '@/lib/integration-events'

export const MCP_PROTOCOL_VERSION = '2025-06-18'
const UA = 'Colvy-Agents/1.0 (+https://colvy.com)'
const TIMEOUT_MS = 20_000
const MAX_BYTES = 2_000_000
const MAX_RESULT_CHARS = 8_000

export type McpAuth = { type: 'none' } | { type: 'bearer'; secret: string } | { type: 'header'; header: string; secret: string }
export type McpServer = { url: string; auth: McpAuth }
export type McpTool = { name: string; title?: string; description: string; inputSchema: any; readOnly: boolean; destructive: boolean }
export type McpCallResult = { ok: boolean; text: string; error?: string }

function authHeaders(auth: McpAuth): Record<string, string> {
  if (auth.type === 'bearer' && auth.secret) return { Authorization: `Bearer ${auth.secret}` }
  if (auth.type === 'header' && auth.secret && /^[A-Za-z0-9-]{1,64}$/.test(auth.header || '')) return { [auth.header]: auth.secret }
  return {}
}

// Read the JSON-RPC message with this id from a JSON or SSE body.
function pickMessage(body: string, contentType: string, id: number): any {
  if (/text\/event-stream/i.test(contentType)) {
    const events = body.split(/\r?\n\r?\n/)
    for (const ev of events) {
      const data = ev.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n')
      if (!data) continue
      try {
        const msg = JSON.parse(data)
        const list = Array.isArray(msg) ? msg : [msg]
        const hit = list.find((m: any) => m && m.id === id)
        if (hit) return hit
      } catch { /* not JSON — skip */ }
    }
    return null
  }
  try {
    const msg = JSON.parse(body)
    const list = Array.isArray(msg) ? msg : [msg]
    return list.find((m: any) => m && m.id === id) || null
  } catch { return null }
}

class Session {
  private nextId = 1
  private sessionId: string | null = null
  private version = MCP_PROTOCOL_VERSION
  constructor(private server: McpServer) {}

  private async post(payload: any, expectId: number | null): Promise<any> {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(this.server.url, {
        method: 'POST', redirect: 'manual', signal: ctl.signal,
        headers: {
          'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'User-Agent': UA,
          ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
          ...(expectId !== 1 ? { 'MCP-Protocol-Version': this.version } : {}),
          ...authHeaders(this.server.auth),
        },
        body: JSON.stringify(payload),
      })
      const sid = res.headers.get('mcp-session-id')
      if (sid) this.sessionId = sid
      if (res.status >= 300 && res.status < 400) throw new Error('The server tried to redirect — use its final address.')
      if (res.status === 401 || res.status === 403) throw new Error('The server refused the key (check the API key or token).')
      if (res.status === 404 && this.sessionId) throw new Error('The server ended the session.')
      if (expectId == null) return null                       // a notification: 202, no body
      if (!res.ok) {
        const txt = (await res.text().catch(() => '')).slice(0, 200)
        throw new Error(`The server answered ${res.status}${txt ? `: ${txt}` : ''}`)
      }
      const body = await res.text()
      if (body.length > MAX_BYTES) throw new Error('The server’s answer was too large.')
      const msg = pickMessage(body, res.headers.get('content-type') || '', expectId)
      if (!msg) throw new Error('The server didn’t answer in the MCP format.')
      if (msg.error) throw new Error(String(msg.error.message || 'The server returned an error').slice(0, 300))
      return msg.result
    } catch (e: any) {
      throw new Error(e?.name === 'AbortError' ? 'The server took too long to answer.' : (e?.message || 'Couldn’t reach the server.'))
    } finally { clearTimeout(t) }
  }

  async request(method: string, params?: any) {
    const id = this.nextId++
    return this.post({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }, id)
  }

  async open(): Promise<{ name: string; version: string }> {
    const r = await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'colvy-agents', version: '1.0.0' },
    })
    if (r?.protocolVersion) this.version = String(r.protocolVersion)
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, null).catch(() => null)
    return { name: String(r?.serverInfo?.name || ''), version: String(r?.serverInfo?.version || '') }
  }

  async close() {
    if (!this.sessionId) return
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000)
      await fetch(this.server.url, { method: 'DELETE', redirect: 'manual', signal: ctl.signal, headers: { 'Mcp-Session-Id': this.sessionId, 'MCP-Protocol-Version': this.version, 'User-Agent': UA, ...authHeaders(this.server.auth) } }).catch(() => null)
      clearTimeout(t)
    } catch {}
  }
}

async function withSession<T>(server: McpServer, fn: (s: Session, info: { name: string; version: string }) => Promise<T>): Promise<T> {
  const bad = await checkPublicUrl(server.url)
  if (bad) throw new Error(bad)
  const s = new Session(server)
  try {
    const info = await s.open()
    return await fn(s, info)
  } finally { await s.close() }
}

/** Connect and list the server's tools (follows pagination, up to 200 tools). */
export async function listMcpTools(server: McpServer): Promise<{ serverName: string; tools: McpTool[] }> {
  let serverName = ''
  const tools = await withSession(server, async (s, info) => {
    serverName = info.name
    const out: McpTool[] = []
    let cursor: string | undefined
    for (let page = 0; page < 10 && out.length < 200; page++) {
      const r = await s.request('tools/list', cursor ? { cursor } : undefined)
      for (const t of Array.isArray(r?.tools) ? r.tools : []) {
        if (!t?.name) continue
        out.push({
          name: String(t.name).slice(0, 128),
          title: t.title || t.annotations?.title || undefined,
          description: String(t.description || '').slice(0, 2000),
          inputSchema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object', properties: {} },
          readOnly: t.annotations?.readOnlyHint === true,
          destructive: t.annotations?.destructiveHint !== false && t.annotations?.readOnlyHint !== true,
        })
      }
      cursor = r?.nextCursor || undefined
      if (!cursor) break
    }
    return out
  })
  return { serverName, tools: tools.slice(0, 200) }
}

// Turn a tools/call result into text the agent can read.
export function resultText(r: any): string {
  const parts: string[] = []
  for (const c of Array.isArray(r?.content) ? r.content : []) {
    if (c?.type === 'text' && c.text) parts.push(String(c.text))
    else if (c?.type === 'resource' && c.resource) parts.push(String(c.resource.text || c.resource.uri || ''))
    else if (c?.type === 'resource_link' && c.uri) parts.push(`${c.name || 'Link'}: ${c.uri}`)
    else if (c?.type === 'image') parts.push('[an image]')
    else if (c?.type === 'audio') parts.push('[an audio clip]')
  }
  if (!parts.length && r?.structuredContent) parts.push(JSON.stringify(r.structuredContent))
  const text = parts.join('\n').trim() || '(no content)'
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… (cut short)` : text
}

/** Call one tool. Never throws — failures come back as { ok: false, error }. */
export async function callMcpTool(server: McpServer, name: string, args: Record<string, any>): Promise<McpCallResult> {
  try {
    const r = await withSession(server, s => s.request('tools/call', { name, arguments: args || {} }))
    const text = resultText(r)
    return r?.isError ? { ok: false, text, error: text.slice(0, 500) } : { ok: true, text }
  } catch (e: any) {
    return { ok: false, text: '', error: e?.message || 'The outside tool failed.' }
  }
}
