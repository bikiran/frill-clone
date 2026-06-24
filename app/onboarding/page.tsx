'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCompanyByOwner } from '@/lib/board'
import Link from 'next/link'

export default function OnboardingPage() {
  const [company, setCompany] = useState<any>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }: any) => {
      const u = data?.session?.user
      if (!u) { window.location.href = '/signup'; return }
      const co = await getCompanyByOwner(u.id)
      setCompany(co)
    })
  }, [])

  const steps = [
    { icon: '🎉', title: "You're all set!", desc: 'Your feedback board has been created.' },
    { icon: '🔗', title: 'Share your board', desc: 'Send your board URL to customers and start collecting feedback.' },
    { icon: '👥', title: 'Invite your team', desc: 'Add teammates who can manage ideas and respond to feedback.' },
    { icon: '⚙️', title: 'Customize your board', desc: 'Set your brand colors, logo, and configure your board settings.' },
  ]

  if (!company) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
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
            <Link href="/admin" className="px-8 py-2.5 rounded-xl font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
              Go to Dashboard →
            </Link>
          )}
        </div>

        <div className="flex justify-center gap-2 mt-6">
          {steps.map((_, i) => (
            <div key={i} onClick={() => setStep(i)}
              className="w-2 h-2 rounded-full cursor-pointer transition-all"
              style={{ background: i === step ? 'var(--coral)' : 'var(--border)' }} />
          ))}
        </div>

        <Link href="/admin" className="block mt-6 text-sm hover:underline" style={{ color: 'var(--slate)' }}>
          Skip to dashboard →
        </Link>
      </div>
    </div>
  )
}
