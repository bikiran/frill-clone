'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const QUICK_REPLIES = ['How do I get started?', 'I found a bug', 'Billing question', 'Feature request']

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function LiveChat() {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'feedback' | 'chat'>('feedback')
  const [slug, setSlug] = useState('')
  
  // Chat state
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [agentTyping, setAgentTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Get slug from hostname
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      if (hostname.endsWith('.colvy.com') && hostname !== 'colvy.com') {
        const companySlug = hostname.replace('.colvy.com', '')
        setSlug(companySlug)
      }
    }
  }, [])

  const sendMessage = async () => {
    if (!input.trim()) return

    const userMsg = {
      id: Date.now(),
      from_type: 'user' as const,
      message: input,
      created_at: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')

    try {
      await fetch('/api/chat-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: slug,
          message: input,
        }),
      })

      setAgentTyping(true)
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          from_type: 'agent' as const,
          message: 'Thanks for reaching out! We\'ll get back to you shortly.',
          created_at: new Date().toISOString(),
        }])
        setAgentTyping(false)
      }, 1500)
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Floating button - fixed position */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-2xl cursor-pointer transition-all hover:scale-110 active:scale-95"
        style={{
          background: 'var(--coral)',
          color: 'white',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          animation: open ? 'slideIn 0.3s ease' : 'slideIn 0.3s ease',
        }}>
        {open ? '×' : '💬'}
      </button>

      {/* Widget/Chat window */}
      {open && (
        <div
          className="fixed rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{
            bottom: 88,
            right: 24,
            width: 384,
            height: 600,
            border: '1px solid var(--border)',
            background: 'white',
            animation: 'slideUp 0.3s ease',
            zIndex: 50,
          }}>
          
          {/* Header with close button */}
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 20,
                fontWeight: 'bold',
                color: '#9ca3af',
                cursor: 'pointer',
              }}>
              ×
            </button>
          </div>

          {/* Content area */}
          {activeTab === 'feedback' ? (
            <div className="flex-1 overflow-hidden">
              <iframe
                src={`${typeof window !== 'undefined' ? window.location.origin : ''}/widget?embedded=true${slug ? `&slug=${slug}` : ''}`}
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
              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'var(--canvas)' }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: 20 }}>
                    <p style={{ fontSize: 12 }}>💬 Chat support coming soon. Use feedback tab to reach out!</p>
                  </div>
                )}
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

              {/* Input area */}
              <div className="p-3 shrink-0 flex gap-2" style={{ background: 'white', borderTop: '1px solid var(--border)' }}>
                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 rounded-xl border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                <button onClick={sendMessage} disabled={!input.trim()}
                  className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer disabled:opacity-40 transition-all"
                  style={{ background: 'var(--coral)', color: 'white' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </>
          )}

          {/* Footer tabs */}
          <div style={{ display: 'flex', gap: 0, padding: '8px 12px', background: '#f9fafb', borderTop: '1px solid var(--border)' }}>
            {(['feedback', 'chat'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 px-3 py-2 text-xs font-medium cursor-pointer rounded-lg transition-all capitalize"
                style={{
                  background: activeTab === tab ? 'var(--coral)' : 'transparent',
                  color: activeTab === tab ? 'white' : 'var(--slate)',
                  border: 'none',
                  fontFamily: 'inherit',
                }}>
                {tab === 'chat' ? '💬' : '📋'} {tab}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
