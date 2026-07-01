'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface ChatMessage {
  id: string
  role: 'user' | 'support'
  message: string
  timestamp: Date
}

export default function ChatSupport() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [isEnabled, setIsEnabled] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    // Load chat settings
    const loadSettings = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          // Check if user has disabled chat
          const stored = localStorage.getItem('chat-enabled')
          if (stored !== null) setIsEnabled(stored === 'true')
        }
      } catch {}
    }
    loadSettings()
  }, [])

  const handleSendMessage = async () => {
    if (!input.trim()) return
    
    setSending(true)
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      message: input,
      timestamp: new Date(),
    }
    
    setMessages(prev => [...prev, userMessage])
    setInput('')

    try {
      // Send to support backend (you can implement this with a backend service)
      await fetch('/api/chat-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          userId: (await supabase.auth.getSession()).data.session?.user.id,
          timestamp: new Date().toISOString(),
        }),
      })

      // Simulate support response
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'support',
          message: 'Thanks for reaching out! Our support team will get back to you shortly.',
          timestamp: new Date(),
        }])
      }, 1000)
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }

  if (!isEnabled) return null

  return (
    <>
      {/* Chat button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#ff7a6b',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 999,
          transition: 'all 0.3s ease',
          transform: isOpen ? 'scale(0.95)' : 'scale(1)',
        }}
        title="Chat with support"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 90,
            right: 20,
            width: 'min(100%, 380px)',
            maxHeight: 500,
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 999,
            animation: 'slideUp 0.3s ease',
          }}
        >
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          
          {/* Header */}
          <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0d0d0d' }}>Support</p>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#9ca3af' }}>We typically reply within 1 hour</p>
            </div>
            <button
              onClick={() => setIsEnabled(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18 }}
              title="Disable chat"
            >
              ⊗
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: 20 }}>
                <p style={{ fontSize: 12 }}>Start a conversation</p>
              </div>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  animation: 'slideUp 0.3s ease',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: msg.role === 'user' ? '#ff7a6b' : '#f3f4f6',
                    color: msg.role === 'user' ? '#fff' : '#0d0d0d',
                    fontSize: 13,
                    lineHeight: 1.5,
                    wordWrap: 'break-word',
                  }}
                >
                  {msg.message}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder="Type a message..."
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #e5e5e5',
                borderRadius: 10,
                fontSize: 13,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={sending || !input.trim()}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: input.trim() ? '#ff7a6b' : '#e5e5e5',
                color: input.trim() ? '#fff' : '#9ca3af',
                border: 'none',
                cursor: input.trim() ? 'pointer' : 'default',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {sending ? '...' : '→'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
