'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCompanyByOwner } from '@/lib/board'
import { redirectToUserAdmin } from '@/lib/redirect'
import Link from 'next/link'

export default function OnboardingPage() {
  const [company, setCompany] = useState<any>(null)
  // The signed-in user — the buttons below dereference it (redirectToUserAdmin),
  // and it was never stored, so "Go to Dashboard" / "Skip" threw a ReferenceError.
  const [user, setUser] = useState<any>(null)
  const [loaded, setLoaded] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }: any) => {
      const u = data?.session?.user
      if (!u) { window.location.href = '/signup'; return }
      setUser(u)
      // A board created seconds ago can briefly be unreadable (row replication /
      // RLS catch-up). Retry a few times instead of spinning forever on the first
      // null — the previous code left the page stuck on a loading spinner.
      let co: any = null
      for (let i = 0; i < 5 && !co; i++) {
        co = await getCompanyByOwner(u.id)
        if (!co) await new Promise(r => setTimeout(r, 800))
      }
      setCompany(co)
      setLoaded(true)
    })
  }, [])

  const steps = [
    { icon: '🎉', title: "You're all set!", desc: 'Your feedback board has been created.' },
    { icon: '🔗', title: 'Share your board', desc: 'Send your board URL to customers and start collecting feedback.' },
    { icon: '👥', title: 'Invite your team', desc: 'Add teammates who can manage ideas and respond to feedback.' },
    { icon: '⚙️', title: 'Customize your board', desc: 'Set your brand colors, logo, and configure your board settings.' },
  ]

  if (!loaded) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
    </div>
  )

  // Loaded, but the board couldn't be read (e.g. RLS/replication lag, or the
  // company row wasn't created). Show a way forward instead of a dead spinner.
  if (!company) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-md w-full text-center">
        <div className="text-4xl mb-3">🛠️</div>
        <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--ink)' }}>Finishing your board setup</h1>
        <p className="text-base mb-6" style={{ color: 'var(--slate)' }}>
          Your account is ready, but we couldn&rsquo;t load your board just yet. Give it a moment and try again.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
            Retry
          </button>
          <button onClick={async () => { if (user) await redirectToUserAdmin(user.id); else window.location.href = '/admin' }}
            className="px-6 py-2.5 rounded-xl border font-medium cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: 'var(--peach)' }}>
      <div className="max-w-md w-full text-center">
        <div className="text-5xl mb-4">{steps[step].icon}</div>
        <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--ink)' }}>{steps[step].title}</h1>
        <p className="text-lg mb-6" style={{ color: 'var(--slate)' }}>{steps[step].desc}</p>

        {step === 0 && (
          <div className="my-6 p-5 bg-white rounded-2xl border shadow-sm" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm mb-2" style={{ color: 'var(--slate)' }}>Your board is live at:</p>
            <p className="text-2xl font-black mb-3" style={{ color: 'var(--coral)' }}>{company.slug}.colvy.com</p>
            <button onClick={() => { navigator.clipboard.writeText(`https://${company.slug}.colvy.com`); alert('Copied!') }}
              className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              📋 Copy link
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="my-6 p-5 bg-white rounded-2xl border shadow-sm" style={{ borderColor: 'var(--border)' }}>
            <div className="flex gap-2">
              <input readOnly value={`https://${company.slug}.colvy.com`}
                className="flex-1 px-3 py-2.5 rounded-xl border text-sm bg-gray-50"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} />
              <button onClick={() => { navigator.clipboard.writeText(`https://${company.slug}.colvy.com`); alert('Copied!') }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
                style={{ background: 'var(--coral)' }}>
                Copy
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 mt-4">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className="px-5 py-2.5 rounded-xl border font-medium text-sm cursor-pointer hover:bg-white"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>← Back</button>
          )}
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)}
              className="px-8 py-2.5 rounded-xl font-semibold text-white cursor-pointer"
              style={{ background: 'var(--coral)' }}>Next →</button>
          ) : (
            <button onClick={async () => { if (user) await redirectToUserAdmin(user.id); else window.location.href = '/admin' }}
              className="px-8 py-2.5 rounded-xl font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
              Go to Dashboard →
            </button>
          )}
        </div>

        <div className="flex justify-center gap-2 mt-6">
          {steps.map((_, i) => (
            <div key={i} onClick={() => setStep(i)}
              className="w-2 h-2 rounded-full cursor-pointer transition-all"
              style={{ background: i === step ? 'var(--coral)' : 'var(--border)' }} />
          ))}
        </div>

        <button onClick={async () => { if (user) await redirectToUserAdmin(user.id); else window.location.href = '/admin' }}
          className="block mt-6 text-sm hover:underline cursor-pointer" style={{ color: 'var(--slate)' }}>
          Skip to dashboard →
        </button>
      </div>
    </div>
  )
}
