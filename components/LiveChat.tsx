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

      {/* Floating button - fixed position on right */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed z-40 w-14 h-14 rounded-full shadow-2xl cursor-pointer transition-all hover:scale-110 active:scale-95"
        style={{
          background: 'var(--coral)',
          color: 'white',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bottom: 24,
          right: 24,
          animation: open ? 'slideIn 0.3s ease' : 'slideIn 0.3s ease',
        }}>
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
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

          {/* Widget iframe - has all tabs: feedback, roadmap, updates, help, chat */}
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
        </div>
      )}
    </>
  )
}
