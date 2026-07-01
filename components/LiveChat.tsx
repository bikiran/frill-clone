'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Message = {
  id: string
  session_id: string
  from_type: 'user' | 'agent'
  from_name: string
  from_email: string
  message: string
  created_at: string
}

type Tab = 'chat' | 'widget'

const QUICK_REPLIES = ['How do I get started?', 'I found a bug', 'Billing question', 'Feature request']

export default function LiveChat() {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'intro' | 'chat'>('intro')
  const [agentTyping, setAgentTyping] = useState(false)
  const [unread, setUnread] = useState(0)
  const [sessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('chat_session_id')
      if (stored) return stored
      const id = Math.random().toString(36).slice(2)
      localStorage.setItem('chat_session_id', id)
      return id
    }
    return Math.random().toString(36).slice(2)
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const channelRef = useRef<any>(null)

  // Subscribe to realtime messages for this session
  useEffect(() => {
    if (step !== 'chat') return

    // Load existing messages
    const loadMessages = async () => {
      const { data } = await (supabase as any)
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (data?.length) {
        setMessages(data)
      } else {
        // First time — show greeting after a brief delay
        setTimeout(() => {
          const greeting: Message = {
            id: 'greeting',
            session_id: sessionId,
            from_type: 'agent',
            from_name: 'Support',
            from_email: 'support@colvy.com',
            message: `Hi ${name || 'there'}! 👋 I'm here to help. What can I assist you with today?`,
            created_at: new Date().toISOString(),
          }
          setMessages([greeting])
        }, 600)
      }
    }
    loadMessages()

    // Subscribe to new messages in this session
    channelRef.current = supabase
      .channel(`chat-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `session_id=eq.${sessionId}`,
      }, (payload: any) => {
        setMessages(prev => {
          const exists = prev.some(m => m.id === payload.new.id)
          if (exists) return prev
          return [...prev, payload.new as Message]
        })
        if (!open && payload.new.from_type === 'agent') {
          setUnread(u => u + 1)
        }
      })
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [step, sessionId])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, agentTyping])
  useEffect(() => { if (open) { setUnread(0); setTimeout(() => inputRef.current?.focus(), 100) } }, [open])

  const startChat = async () => {
    if (!name.trim() || !email.trim()) return
    // Save user info to localStorage
    localStorage.setItem('chat_name', name)
    localStorage.setItem('chat_email', email)
    setStep('chat')
  }

  const sendMessage = async () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput('')

    // Optimistic insert
    const tempId = 'temp-' + Date.now()
    const tempMsg: Message = {
      id: tempId,
      session_id: sessionId,
      from_type: 'user',
      from_name: name,
      from_email: email,
      message: text,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      const { data } = await (supabase as any).from('chat_messages').insert({
        session_id: sessionId,
        from_type: 'user',
        from_name: name || 'User',
        from_email: email || '',
        message: text,
      }).select().single()

      // Replace temp with real
      if (data) {
        setMessages(prev => prev.map(m => m.id === tempId ? data : m))
      }
    } catch (err) {
      console.log('Send error:', err)
    }
  }

  // Load saved name/email
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedName = localStorage.getItem('chat_name')
      const savedEmail = localStorage.getItem('chat_email')
      if (savedName && savedEmail) { setName(savedName); setEmail(savedEmail); setStep('chat') }
    }
  }, [])

  const formatTime = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-50">
        {!open && unread > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white z-10" style={{ background: '#ef4444' }}>
            {unread}
          </div>
        )}
        <button onClick={() => setOpen(!open)}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl cursor-pointer transition-all hover:scale-105 active:scale-95"
          style={{ background: 'var(--coral)' }}>
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          )}
        </button>
      </div>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ height: 480, border: '1px solid var(--border)', background: 'white' }}>
          {/* Close button */}
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => setOpen(false)} className="text-slate-400 cursor-pointer hover:text-slate-600"
              style={{ fontSize: 20, fontWeight: 'bold' }}>
              ×
            </button>
          </div>

          {activeTab === 'chat' ? (
            <div className="flex-1 overflow-hidden rounded-b-2xl">
              <iframe
                src={`${typeof window !== 'undefined' ? window.location.origin : ''}/widget?embedded=chat&inline=true`}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                title="Colvy Widget"
              />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'var(--canvas)' }}>
                {messages.map(m => (
                  <div key={m.id} className={`flex gap-2 ${m.from_type === 'user' ? 'flex-row-reverse' : ''}`}>
                    {m.from_type === 'agent' && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: 'var(--coral)' }}>S</div>
                    )}
                    <div className="max-w-[78%]">
                      <div className="px-3 py-2 text-sm leading-relaxed"
                        style={{
                          background: m.from_type === 'user' ? 'var(--coral)' : 'white',
                          color: m.from_type === 'user' ? 'white' : 'var(--ink)',
                          borderRadius: m.from_type === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                          border: m.from_type === 'agent' ? '1px solid var(--border)' : 'none',
                        }}>
                        {m.message}
                      </div>
                      <p className="text-xs mt-0.5 px-1" style={{ color: 'var(--slate)', textAlign: m.from_type === 'user' ? 'right' : 'left' }}>
                        {formatTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
                {agentTyping && (
                  <div className="flex gap-2 items-center">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: 'var(--coral)' }}>S</div>
                    <div className="px-3 py-2.5 rounded-2xl bg-white border flex items-center gap-1" style={{ borderColor: 'var(--border)' }}>
                      {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--slate)', animationDelay: `${i*150}ms` }} />)}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {messages.length <= 2 && (
                <div className="px-3 py-2 flex gap-1.5 overflow-x-auto shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'white' }}>
                  {QUICK_REPLIES.map(q => (
                    <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }}
                      className="px-2.5 py-1 rounded-full text-xs border cursor-pointer hover:bg-gray-50 shrink-0 transition-all"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div className="p-3 shrink-0 flex gap-2" style={{ background: 'white', borderTop: '1px solid var(--border)' }}>
                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 rounded-xl border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                <button onClick={sendMessage} disabled={!input.trim()}
                  className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer disabled:opacity-40 transition-all active:scale-90"
                  style={{ background: 'var(--coral)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </>
          )}
          
          {/* Footer tabs */}
          <div style={{ display: 'flex', gap: 0, padding: '8px 12px', background: '#f9fafb', borderTop: '1px solid var(--border)' }}>
            {(['chat', 'widget'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 px-3 py-2 text-xs font-medium cursor-pointer rounded-lg transition-all capitalize"
                style={{
                  background: activeTab === tab ? 'var(--coral)' : 'transparent',
                  color: activeTab === tab ? 'white' : 'var(--slate)',
                }}>
                {tab === 'chat' ? '💬' : '📋'} {tab}
              </button>
            ))}
          </div>
          
          {/* Greeting section below tabs */}
          {activeTab === 'chat' && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 12, textAlign: 'center', background: '#f9fafb' }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>👋</div>
              <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: 'var(--ink)' }}>Chat with us</p>
              <p style={{ margin: '0 0 8px 0', color: 'var(--slate)', fontSize: 11 }}>We typically reply in a few minutes</p>
              <button onClick={() => { setName(name || 'Guest'); setEmail(email || 'guest@example.com'); setStep('chat') }}
                className="w-full py-1.5 rounded-lg text-white text-xs font-semibold cursor-pointer"
                style={{ background: 'var(--coral)' }}>
                Start Chat →
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
