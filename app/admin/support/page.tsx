'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

const STATUS_COLORS: Record<string, any> = {
  open:        { bg: '#fef9c3', color: '#ca8a04', label: 'Open' },
  in_progress: { bg: '#dbeafe', color: '#2563eb', label: 'In Progress' },
  resolved:    { bg: '#dcfce7', color: '#16a34a', label: 'Resolved' },
  closed:      { bg: '#f3f4f6', color: '#6b7280', label: 'Closed' },
}

type ChatSession = {
  session_id: string
  from_name: string
  from_email: string
  last_message: string
  last_at: string
  unread: number
}

export default function SupportPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'tickets'>('chat')

  // CHAT
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [replyInput, setReplyInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)

  // TICKETS
  const [tickets, setTickets] = useState<any[]>([])
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [ticketReply, setTicketReply] = useState('')
  const [ticketFilter, setTicketFilter] = useState('open')
  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      setUser(u)
      fetchChatSessions()
      fetchTickets()
    })
  }, [router])

  // Subscribe to all new chat messages (admin sees everything)
  useEffect(() => {
    // Poll every 3 seconds as reliable fallback
    const interval = setInterval(() => {
      fetchChatSessions()
      if (selectedSession) fetchChatThread(selectedSession)
    }, 3000)

    // Also try realtime
    const ch = (supabase as any).channel('admin-chat-all')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
        fetchChatSessions()
        if (selectedSession) fetchChatThread(selectedSession)
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(ch)
    }
  }, [selectedSession])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const fetchChatSessions = async () => {
    try {
      const { data } = await (supabase as any).from('chat_messages').select('*').order('created_at', { ascending: false })
      if (!data) return
      // Group by session
      const sessionMap: Record<string, ChatSession> = {}
      data.forEach((m: any) => {
        if (!sessionMap[m.session_id]) {
          sessionMap[m.session_id] = {
            session_id: m.session_id,
            from_name: m.from_name || 'Unknown',
            from_email: m.from_email || '',
            last_message: m.message,
            last_at: m.created_at,
            unread: 0,
          }
        }
        if (m.from_type === 'user') {
          sessionMap[m.session_id].unread++
        }
      })
      setChatSessions(Object.values(sessionMap).sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime()))
    } catch {}
    setLoading(false)
  }

  const fetchChatThread = async (sessionId: string) => {
    const { data } = await (supabase as any).from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
    setChatMessages(data || [])
  }

  const selectSession = (sessionId: string) => {
    setSelectedSession(sessionId)
    fetchChatThread(sessionId)
  }

  const sendChatReply = async () => {
    if (!replyInput.trim() || !selectedSession) return
    const text = replyInput.trim()
    setReplyInput('')
    await (supabase as any).from('chat_messages').insert({
      session_id: selectedSession,
      from_type: 'agent',
      from_name: 'Support Team',
      from_email: ADMIN_EMAIL,
      message: text,
    })
    fetchChatThread(selectedSession)
    fetchChatSessions()
  }

  // TICKETS
  const fetchTickets = async () => {
    try {
      const { data } = await (supabase as any).from('support_tickets').select('*').order('created_at', { ascending: false })
      const list = data || []
      setTickets(list)
      if (list.length > 0 && !selectedTicket) setSelectedTicket(list[0])
    } catch {}
  }

  const updateTicketStatus = async (id: string, status: string) => {
    await (supabase as any).from('support_tickets').update({ status }).eq('id', id)
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    if (selectedTicket?.id === id) setSelectedTicket((s: any) => ({ ...s, status }))
  }

  const sendTicketReply = async () => {
    if (!ticketReply.trim() || !selectedTicket) return
    const text = ticketReply.trim()
    setTicketReply('')
    const newReply = { from: 'admin', message: text, at: new Date().toISOString() }
    const replies = [...(selectedTicket.replies || []), newReply]
    await (supabase as any).from('support_tickets').update({ replies, status: 'in_progress' }).eq('id', selectedTicket.id)
    setSelectedTicket((s: any) => ({ ...s, replies, status: 'in_progress' }))
    setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, replies, status: 'in_progress' } : t))
  }

  const formatTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const filteredTickets = tickets.filter(t => {
    const matchFilter = ticketFilter === 'all' || t.status === ticketFilter
    const matchSearch = !search || t.subject?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const ticketCounts: Record<string, number> = { all: tickets.length, open: 0, in_progress: 0, resolved: 0, closed: 0 }
  tickets.forEach(t => { if (ticketCounts[t.status] !== undefined) ticketCounts[t.status]++ })

  if (!user) return <div className="p-8">Loading...</div>

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col">
      {/* Tab bar */}
      <div className="border-b bg-white px-6 flex items-center gap-1 shrink-0" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => setActiveTab('chat')}
          className="px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer"
          style={{ borderColor: activeTab === 'chat' ? 'var(--coral)' : 'transparent', color: activeTab === 'chat' ? 'var(--coral)' : 'var(--slate)' }}>
          💬 Live Chat {chatSessions.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>{chatSessions.length}</span>}
        </button>
        <button onClick={() => setActiveTab('tickets')}
          className="px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer"
          style={{ borderColor: activeTab === 'tickets' ? 'var(--coral)' : 'transparent', color: activeTab === 'tickets' ? 'var(--coral)' : 'var(--slate)' }}>
          🎫 Tickets {ticketCounts.open > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs" style={{ background: '#fef9c3', color: '#ca8a04' }}>{ticketCounts.open} open</span>}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {activeTab === 'chat' ? (
          <>
            {/* Chat sessions sidebar */}
            <aside className="w-72 shrink-0 bg-white border-r flex flex-col" style={{ borderColor: 'var(--border)' }}>
              <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="font-bold text-sm" style={{ color: 'var(--ink)' }}>Active Conversations</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{chatSessions.length} sessions</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {chatSessions.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="text-3xl mb-2">💬</div>
                    <p className="text-sm" style={{ color: 'var(--slate)' }}>No chats yet</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>New chats will appear here in real time</p>
                  </div>
                ) : chatSessions.map(s => (
                  <button key={s.session_id} onClick={() => selectSession(s.session_id)}
                    className="w-full text-left p-4 hover:bg-gray-50 transition-all cursor-pointer border-b"
                    style={{
                      borderColor: 'var(--border)',
                      background: selectedSession === s.session_id ? 'var(--peach)' : 'white',
                      borderLeft: selectedSession === s.session_id ? '3px solid var(--coral)' : '3px solid transparent',
                    }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'var(--coral)' }}>
                          {(s.from_name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold truncate max-w-32" style={{ color: 'var(--ink)' }}>{s.from_name || 'Guest'}</p>
                          <p className="text-xs truncate max-w-32" style={{ color: 'var(--slate)' }}>{s.from_email}</p>
                        </div>
                      </div>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#4ade80' }} title="Online" />
                    </div>
                    <p className="text-xs truncate ml-10" style={{ color: 'var(--slate)' }}>{s.last_message}</p>
                    <p className="text-xs ml-10 mt-0.5" style={{ color: 'var(--slate)' }}>{formatTime(s.last_at)}</p>
                  </button>
                ))}
              </div>
            </aside>

            {/* Chat thread */}
            <main className="flex-1 flex flex-col min-h-0">
              {!selectedSession ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="text-5xl mb-4">💬</div>
                  <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Select a conversation</h2>
                  <p style={{ color: 'var(--slate)' }}>Choose a chat from the sidebar to start replying</p>
                </div>
              ) : (
                <>
                  {/* Thread header */}
                  <div className="border-b px-6 py-3 bg-white shrink-0" style={{ borderColor: 'var(--border)' }}>
                    {(() => {
                      const s = chatSessions.find(s => s.session_id === selectedSession)
                      return s ? (
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold" style={{ background: 'var(--coral)' }}>
                            {(s.from_name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{s.from_name}</p>
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: '#4ade80' }} />
                              <p className="text-xs" style={{ color: 'var(--slate)' }}>{s.from_email} · Online</p>
                            </div>
                          </div>
                        </div>
                      ) : null
                    })()}
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ background: 'var(--canvas)' }}>
                    {chatMessages.map(m => (
                      <div key={m.id} className={`flex gap-2.5 ${m.from_type === 'agent' ? 'flex-row-reverse' : ''}`}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: m.from_type === 'agent' ? 'var(--coral)' : 'var(--slate)' }}>
                          {m.from_type === 'agent' ? 'A' : (m.from_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="max-w-[70%]">
                          <div className="px-4 py-2.5 text-sm leading-relaxed"
                            style={{
                              background: m.from_type === 'agent' ? 'var(--coral)' : 'white',
                              color: m.from_type === 'agent' ? 'white' : 'var(--ink)',
                              borderRadius: m.from_type === 'agent' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                              border: m.from_type === 'user' ? '1px solid var(--border)' : 'none',
                            }}>
                            {m.message}
                          </div>
                          <p className="text-xs mt-1 px-1" style={{ color: 'var(--slate)', textAlign: m.from_type === 'agent' ? 'right' : 'left' }}>
                            {m.from_name} · {formatTime(m.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Reply */}
                  <div className="p-4 bg-white border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex gap-2">
                      <input value={replyInput} onChange={e => setReplyInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatReply()}
                        placeholder="Type a reply... (Enter to send)"
                        className="flex-1 px-4 py-2.5 rounded-xl border text-sm focus:outline-none"
                        style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                      <button onClick={sendChatReply} disabled={!replyInput.trim()}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                        style={{ background: 'var(--coral)' }}>
                        Send
                      </button>
                    </div>
                  </div>
                </>
              )}
            </main>
          </>
        ) : (
          /* TICKETS TAB */
          <>
            <aside className="w-72 shrink-0 bg-white border-r flex flex-col" style={{ borderColor: 'var(--border)' }}>
              <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="relative mb-3">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {['all','open','in_progress','resolved','closed'].map(f => (
                    <button key={f} onClick={() => setTicketFilter(f)}
                      className="px-2 py-0.5 rounded-full text-xs cursor-pointer capitalize"
                      style={{ background: ticketFilter === f ? 'var(--coral)' : 'var(--border)', color: ticketFilter === f ? 'white' : 'var(--slate)' }}>
                      {f.replace('_', ' ')} {ticketCounts[f] > 0 && `(${ticketCounts[f]})`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredTickets.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-sm" style={{ color: 'var(--slate)' }}>No tickets</p>
                  </div>
                ) : filteredTickets.map(t => {
                  const sc = STATUS_COLORS[t.status] || STATUS_COLORS.open
                  return (
                    <button key={t.id} onClick={() => setSelectedTicket(t)}
                      className="w-full text-left p-4 border-b hover:bg-gray-50 cursor-pointer transition-all"
                      style={{ borderColor: 'var(--border)', background: selectedTicket?.id === t.id ? 'var(--peach)' : 'white', borderLeft: selectedTicket?.id === t.id ? '3px solid var(--coral)' : '3px solid transparent' }}>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{t.subject}</p>
                        <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                      </div>
                      <p className="text-xs truncate" style={{ color: 'var(--slate)' }}>{t.email}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{formatDate(t.created_at)}</p>
                    </button>
                  )
                })}
              </div>
            </aside>

            <main className="flex-1 flex flex-col min-h-0">
              {!selectedTicket ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="text-5xl mb-4">🎫</div>
                  <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>No tickets yet</h2>
                  <p style={{ color: 'var(--slate)' }}>Support tickets from your Help Centre will appear here</p>
                </div>
              ) : (
                <>
                  <div className="border-b px-6 py-3 bg-white shrink-0" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-bold" style={{ color: 'var(--ink)' }}>{selectedTicket.subject}</h2>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>From: <strong>{selectedTicket.email}</strong> · {formatDate(selectedTicket.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        {Object.entries(STATUS_COLORS).map(([key, sc]) => (
                          <button key={key} onClick={() => updateTicketStatus(selectedTicket.id, key)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition-all"
                            style={{ background: selectedTicket.status === key ? sc.bg : 'white', color: selectedTicket.status === key ? sc.color : 'var(--slate)', borderColor: selectedTicket.status === key ? sc.color : 'var(--border)' }}>
                            {sc.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ background: 'var(--canvas)' }}>
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'var(--slate)' }}>
                        {selectedTicket.email?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{selectedTicket.email}</span>
                          <span className="text-xs" style={{ color: 'var(--slate)' }}>{formatDate(selectedTicket.created_at)}</span>
                        </div>
                        <div className="p-4 rounded-2xl rounded-tl-none text-sm leading-relaxed bg-white border" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                          {selectedTicket.message || 'No message body'}
                        </div>
                      </div>
                    </div>
                    {(selectedTicket.replies || []).map((r: any, i: number) => (
                      <div key={i} className={`flex gap-3 ${r.from === 'admin' ? 'flex-row-reverse' : ''}`}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: r.from === 'admin' ? 'var(--coral)' : 'var(--slate)' }}>
                          {r.from === 'admin' ? 'A' : selectedTicket.email?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className={`flex items-center gap-2 mb-1.5 ${r.from === 'admin' ? 'flex-row-reverse' : ''}`}>
                            <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{r.from === 'admin' ? 'Support Team' : selectedTicket.email}</span>
                            <span className="text-xs" style={{ color: 'var(--slate)' }}>{formatDate(r.at)}</span>
                          </div>
                          <div className={`p-4 rounded-2xl text-sm leading-relaxed ${r.from === 'admin' ? 'rounded-tr-none' : 'rounded-tl-none'}`}
                            style={{ background: r.from === 'admin' ? 'var(--peach)' : 'white', color: 'var(--ink)', border: '1px solid var(--border)' }}>
                            {r.message}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t p-4 bg-white shrink-0" style={{ borderColor: 'var(--border)' }}>
                    <textarea value={ticketReply} onChange={e => setTicketReply(e.target.value)}
                      placeholder="Write a reply... (Cmd+Enter to send)"
                      rows={3}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendTicketReply() }}
                      className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none resize-none mb-3"
                      style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => updateTicketStatus(selectedTicket.id, 'resolved')}
                        className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer hover:bg-gray-50"
                        style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                        Mark Resolved
                      </button>
                      <button onClick={sendTicketReply} disabled={!ticketReply.trim()}
                        className="px-5 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                        style={{ background: 'var(--coral)' }}>
                        Send Reply
                      </button>
                    </div>
                  </div>
                </>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  )
}
