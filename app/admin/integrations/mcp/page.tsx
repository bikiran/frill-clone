'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders, useIntegrations } from '@/components/integrations/IntegrationsShell'
import { IntegrationPage, IntegrationHeader, Card, Notice, Icon, btn, inputCls, inputStyle } from '@/components/integrations/ui'
import { confirmDialog } from '@/components/ConfirmDialog'

// Colvy MCP: connect Claude, ChatGPT, Cursor, Claude Code and other AI
// assistants to this business over the Model Context Protocol.

type Conn = { id: string; name: string | null; scope: 'read' | 'write'; last4: string | null; by: string; lastUsed: string | null; created: string }

const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function CopyField({ value, mono = true, label }: { value: string; mono?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label={label} onFocus={e => e.currentTarget.select()}
        className={inputCls + ' flex-1 min-w-0' + (mono ? ' font-mono' : '')} style={{ ...inputStyle, fontSize: 13, background: 'var(--canvas, #f8f8fa)' }} />
      <button type="button" onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })} {...btn('secondary')}>
        <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: '#0f172a' }}>
      <pre className="text-[12.5px] leading-relaxed p-3.5 pr-20 overflow-x-auto" style={{ color: '#e2e8f0', margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre' }}>{code}</pre>
      <button type="button" onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
        className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: 'none' }}>
        <Icon name={copied ? 'check' : 'copy'} size={12} /> {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

const Steps = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="space-y-2.5 text-sm" style={{ color: 'var(--slate)', margin: 0, padding: 0, listStyle: 'none' }}>
    {items.map((t, i) => (
      <li key={i} className="flex gap-3">
        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>{i + 1}</span>
        <span className="pt-0.5 min-w-0" style={{ wordBreak: 'break-word' }}>{t}</span>
      </li>
    ))}
  </ol>
)
const B = ({ children }: { children: React.ReactNode }) => <strong style={{ color: 'var(--ink)' }}>{children}</strong>

const CLIENTS = [
  { id: 'claude', name: 'Claude', logo: '/logos/client-claude.svg' },
  { id: 'chatgpt', name: 'ChatGPT', logo: '/logos/client-chatgpt.svg' },
  { id: 'claudecode', name: 'Claude Code', logo: '/logos/client-claudecode.svg' },
  { id: 'cursor', name: 'Cursor', logo: '/logos/client-cursor.svg' },
  { id: 'other', name: 'Other apps', logo: '/logos/mcp.svg' },
]

const CAN_DO: { icon: string; title: string; text: string }[] = [
  { icon: 'chat', title: 'Inbox', text: 'Find conversations, read the thread, and reply by SMS, email or chat (you approve each message).' },
  { icon: 'bag', title: 'Orders & stock', text: 'Look up orders, check live stock and prices, change status, assign an outlet, cancel or refund (refunds need your OK).' },
  { icon: 'store', title: 'Customers', text: 'Find contacts, their history, outlets and team members.' },
  { icon: 'card', title: 'Payments & bookings', text: 'Send payment links, booking links and photo/video requests; see today’s bookings.' },
  { icon: 'check', title: 'Tasks & calendar', text: 'Create, assign and complete tasks, set reminders and add calendar events.' },
  { icon: 'info', title: 'Reports & knowledge', text: 'Sales and order reports, out-of-stock items, and answers from your AI knowledge library.' },
  { icon: 'phone', title: 'Support & reviews', text: 'Tickets, Google reviews and Facebook/Instagram comments — read and reply.' },
]

const EXAMPLES = [
  'What came in overnight? Summarise new conversations and orders.',
  'Find Braden Pearce’s latest order and text him that it’s ready to collect.',
  'Which items are out of stock right now?',
  'Reply to the latest Google review and thank them by name.',
  'Send Rahul a $5 payment link for the shipping difference.',
  'Create a task for the Somerton outlet to call back today’s missed calls.',
  'How did we go this week compared to last week?',
]

export default function ColvyMcpPage() {
  const { companyId, ready, setActive } = useIntegrations()
  const [url, setUrl] = useState('')
  const [client, setClient] = useState('claude')
  const [keys, setKeys] = useState<Conn[] | null>(null)
  const [apps, setApps] = useState<Conn[] | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [newName, setNewName] = useState('')
  const [newScope, setNewScope] = useState<'read' | 'write'>('write')
  const [created, setCreated] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => { setUrl(`${window.location.origin}/api/mcp`) }, [])

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await fetch(`/api/mcp/keys?companyId=${companyId}`, { headers: await authHeaders() })
      const d = await r.json()
      setKeys(d.keys || []); setApps(d.apps || []); setNeedsMigration(!!d.needsMigration)
      setActive('mcp', (d.keys?.length || 0) + (d.apps?.length || 0) > 0)
    } catch { setKeys([]); setApps([]) }
  }, [companyId, setActive])
  useEffect(() => { if (ready) load() }, [ready, load])

  const createKey = async () => {
    if (!companyId) return
    setBusy(true); setNote(null)
    try {
      const r = await fetch('/api/mcp/keys', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ companyId, name: newName || `${CLIENTS.find(c => c.id === client)?.name || 'API'} key`, scope: newScope }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not create the key.')
      setCreated(d.key); setNewName(''); load()
    } catch (e: any) { setNote({ tone: 'error', text: e?.message || 'Could not create the key.' }) }
    setBusy(false)
  }

  const revoke = async (c: Conn, kind: 'key' | 'app') => {
    if (!companyId) return
    const ok = await confirmDialog({
      title: kind === 'key' ? 'Revoke this key?' : `Disconnect ${c.name || 'this app'}?`,
      message: kind === 'key' ? 'Anything using it stops working straight away.' : 'It loses access straight away. You can connect it again later.',
      confirmLabel: kind === 'key' ? 'Revoke' : 'Disconnect', tone: 'danger',
    } as any)
    if (!ok) return
    const r = await fetch('/api/mcp/keys', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ companyId, id: c.id }) })
    setNote(r.ok ? { tone: 'success', text: kind === 'key' ? 'Key revoked.' : 'Disconnected.' } : { tone: 'error', text: 'Could not remove it.' })
    load()
  }

  const keyHint = created || 'YOUR_COLVY_KEY'
  const guides: Record<string, React.ReactNode> = {
    claude: (
      <Steps items={[
        <>In Claude (web or desktop), open <B>Settings → Connectors</B> and click <B>Add custom connector</B>.</>,
        <>Name it <B>Colvy</B> and paste the server address above. Click <B>Add</B>.</>,
        <>Click <B>Connect</B>, sign in to Colvy, choose this business and click <B>Allow</B>.</>,
        <>In a chat, turn on the Colvy connector (the tools menu) and ask away.</>,
      ]} />
    ),
    chatgpt: (
      <Steps items={[
        <>In ChatGPT, open <B>Plugins</B> (Settings → Apps &amp; Connectors), click <B>Add</B> and choose <B>Create custom MCP server/app</B>.</>,
        <>Name it <B>Colvy</B> and paste the server address above. Leave Authentication as <B>OAuth</B> and click <B>Create</B>.</>,
        <>Click <B>Continue</B>, sign in to Colvy, choose this business and click <B>Allow</B>.</>,
        <>Start a chat, pick Colvy from the + menu, and ask away.</>,
      ]} />
    ),
    claudecode: (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--slate)', margin: 0 }}>Run this in your terminal, then type <B>/mcp</B> in Claude Code and choose Colvy to sign in:</p>
        <CodeBlock code={`claude mcp add --transport http colvy ${url}`} />
        <p className="text-sm" style={{ color: 'var(--slate)', margin: 0 }}>Or use an API key (create one on the right):</p>
        <CodeBlock code={`claude mcp add --transport http colvy ${url} \\\n  --header "Authorization: Bearer ${keyHint}"`} />
      </div>
    ),
    cursor: (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--slate)', margin: 0 }}>Add this to <B>~/.cursor/mcp.json</B> (Cursor Settings → MCP → Add new server), using an API key from the right:</p>
        <CodeBlock code={JSON.stringify({ mcpServers: { colvy: { url, headers: { Authorization: `Bearer ${keyHint}` } } } }, null, 2)} />
      </div>
    ),
    other: (
      <div className="space-y-3 text-sm" style={{ color: 'var(--slate)' }}>
        <p style={{ margin: 0 }}>Any app that supports remote MCP servers (Streamable HTTP) can connect with the address above.</p>
        <ul className="space-y-1.5" style={{ margin: 0, paddingLeft: 18 }}>
          <li><B>OAuth</B>: the app finds Colvy’s sign-in automatically and asks you to Allow it.</li>
          <li><B>API key</B>: send the header <code>Authorization: Bearer {keyHint === 'YOUR_COLVY_KEY' ? '<key>' : keyHint}</code>.</li>
        </ul>
        <CodeBlock code={`curl -s ${url} \\\n  -H "Authorization: Bearer ${keyHint}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`} />
      </div>
    ),
  }

  const ConnRow = ({ c, kind }: { c: Conn; kind: 'key' | 'app' }) => (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--peach)', color: 'var(--coral)' }}><Icon name={kind === 'key' ? 'key' : 'webhook'} size={16} /></span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)', margin: 0 }}>
          {c.name || (kind === 'key' ? 'API key' : 'App')}{kind === 'key' && c.last4 ? <span className="font-normal" style={{ color: 'var(--slate)' }}> · ••••{c.last4}</span> : null}
        </p>
        <p className="text-xs" style={{ color: 'var(--slate)', margin: '2px 0 0' }}>
          {c.scope === 'write' ? 'Read and act' : 'Read only'} · {c.by} · used {ago(c.lastUsed)}
        </p>
      </div>
      <button type="button" onClick={() => revoke(c, kind)} {...btn('danger', 'sm')}>{kind === 'key' ? 'Revoke' : 'Disconnect'}</button>
    </li>
  )

  const anyConn = (keys?.length || 0) + (apps?.length || 0) > 0

  return (
    <IntegrationPage>
      <IntegrationHeader id="mcp" connected={anyConn} badge="In use"
        desc="Let Claude, ChatGPT, Cursor and other AI assistants look things up and get work done in your Colvy, as you." />

      {needsMigration && <Notice tone="error">Colvy MCP needs a quick database update first: run migration V331 in Supabase.</Notice>}
      {note && <Notice tone={note.tone}>{note.text}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
        <div className="space-y-5 min-w-0">
          <Card icon="webhook" title="Your MCP server" sub="Paste this address into any AI app that supports MCP. It signs in with your Colvy account, so it only sees this business and can only do what you can.">
            {url && <CopyField value={url} label="MCP server address" />}
          </Card>

          <Card icon="send" title="Connect an AI app">
            <div className="flex gap-2 flex-wrap mb-4" role="tablist">
              {CLIENTS.map(c => (
                <button key={c.id} type="button" role="tab" aria-selected={client === c.id} onClick={() => setClient(c.id)}
                  className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl border text-sm font-semibold cursor-pointer transition-colors"
                  style={{ borderColor: client === c.id ? 'var(--coral)' : 'var(--border)', background: client === c.id ? 'var(--peach)' : '#fff', color: client === c.id ? 'var(--coral)' : 'var(--ink)' }}>
                  <img src={c.logo} alt="" width={22} height={22} style={{ width: 22, height: 22 }} /> {c.name}
                </button>
              ))}
            </div>
            {guides[client]}
          </Card>

          <Card icon="bolt" title="What it can do" sub="The same tools Colvy AI uses, with the same safety checks.">
            <div className="grid gap-3 sm:grid-cols-2">
              {CAN_DO.map(x => (
                <div key={x.title} className="flex gap-2.5">
                  <span className="mt-0.5" style={{ color: 'var(--coral)' }}><Icon name={x.icon} size={16} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)', margin: 0 }}>{x.title}</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--slate)', margin: '2px 0 0' }}>{x.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--slate)' }}>Try asking</p>
              <ul className="space-y-1.5" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {EXAMPLES.map(e => <li key={e} className="text-sm px-3 py-2 rounded-xl" style={{ background: 'var(--canvas, #f8f8fa)', color: 'var(--ink)' }}>“{e}”</li>)}
              </ul>
            </div>
          </Card>
        </div>

        <div className="space-y-5 min-w-0">
          <Card icon="lock" title="Safety" >
            <ul className="space-y-2.5 text-sm" style={{ color: 'var(--slate)', margin: 0, padding: 0, listStyle: 'none' }}>
              {[
                'Each app acts as the person who connected it, in this business only, with their role.',
                'Messages to customers, refunds and payment links are always shown to you first; nothing goes out until you approve.',
                'Choose Read only when you just want answers.',
                'Disconnect an app or revoke a key here at any time; it stops working straight away.',
              ].map(t => <li key={t} className="flex gap-2.5"><span className="mt-0.5" style={{ color: '#15803d' }}><Icon name="check" size={15} /></span><span>{t}</span></li>)}
            </ul>
          </Card>

          <Card icon="webhook" title="Connected apps" sub="Apps you signed in with (Claude, ChatGPT…).">
            {apps === null ? <p className="text-sm" style={{ color: 'var(--slate)', margin: 0 }}>Loading…</p>
              : apps.length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)', margin: 0 }}>No apps connected yet.</p>
              : <ul className="divide-y" style={{ margin: 0, padding: 0, listStyle: 'none', borderColor: 'var(--border)' }}>{apps.map(c => <ConnRow key={c.id} c={c} kind="app" />)}</ul>}
          </Card>

          <Card icon="key" title="API keys" sub="For Claude Code, Cursor, scripts and apps without sign-in.">
            {created && (
              <div className="mb-4 p-3 rounded-xl" style={{ background: '#ecfdf3', border: '1px solid #abefc6' }}>
                <p className="text-sm font-semibold mb-2" style={{ color: '#067647', margin: '0 0 8px' }}>Copy your key now. It won’t be shown again.</p>
                <CopyField value={created} label="New API key" />
                <button type="button" onClick={() => setCreated(null)} className="text-xs font-semibold mt-2 cursor-pointer" style={{ color: '#067647', background: 'none', border: 'none', padding: 0 }}>I’ve saved it</button>
              </div>
            )}
            <div className="space-y-2.5">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name, e.g. Cursor on my laptop" className={inputCls} style={inputStyle} aria-label="Key name" />
              <div className="flex gap-2 flex-wrap">
                <select value={newScope} onChange={e => setNewScope(e.target.value as any)} aria-label="Access"
                  className="flex-1 min-w-[150px] px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: 'var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 16 }}>
                  <option value="write">Read and act</option>
                  <option value="read">Read only</option>
                </select>
                <button type="button" onClick={createKey} disabled={busy} {...btn('primary')}><Icon name="plus" size={14} /> {busy ? 'Creating…' : 'Create key'}</button>
              </div>
            </div>
            {!!keys?.length && (
              <ul className="divide-y mt-4 pt-4 border-t" style={{ margin: 0, padding: 0, listStyle: 'none', borderColor: 'var(--border)' }}>
                {keys.map(c => <ConnRow key={c.id} c={c} kind="key" />)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </IntegrationPage>
  )
}
