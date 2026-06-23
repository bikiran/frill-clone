'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then((data: any) => {
      setUser(data.data?.session?.user)
    })
  }, [])

  return (
    <div style={{ background: 'var(--canvas)' }}>
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur border-b" 
        style={{ background: 'rgba(255,255,255,0.95)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold flex items-center gap-2">
            <span className="text-3xl">💭</span>
            <span style={{ color: 'var(--coral)' }}>Frill</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link href="/admin" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--slate)' }}>
                  Dashboard
                </Link>
                <Link href="/admin" className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--coral)' }}>
                  Go to App
                </Link>
              </>
            ) : (
              <>
                <Link href="/signin" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--slate)' }}>
                  Sign in
                </Link>
                <Link href="/signup" className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--coral)' }}>
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight" style={{ color: 'var(--ink)' }}>
            Gather feedback.
            <br />
            <span style={{ color: 'var(--coral)' }}>Build better.</span>
          </h1>
          <p className="text-lg mb-8 leading-relaxed" style={{ color: 'var(--slate)' }}>
            The customer feedback platform your team will actually use. Collect ideas, manage roadmaps, and keep customers in the loop.
          </p>
          <div className="flex gap-4 justify-center mb-12">
            <Link href={user ? '/admin' : '/signup'} 
              className="px-8 py-3.5 rounded-xl text-base font-semibold text-white cursor-pointer hover:opacity-90 transition-all"
              style={{ background: 'var(--coral)' }}>
              Start Free →
            </Link>
            <Link href="#features" 
              className="px-8 py-3.5 rounded-xl text-base font-semibold border cursor-pointer hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              Learn More
            </Link>
          </div>
          <div className="inline-block px-4 py-2 rounded-full text-sm font-medium" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
            ✨ Free forever for small teams
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16" style={{ color: 'var(--ink)' }}>Everything you need</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: '💡', title: 'Idea Board', desc: 'Collect customer feedback in one beautiful place' },
              { icon: '🗺️', title: 'Public Roadmap', desc: 'Share your vision and build trust' },
              { icon: '📢', title: 'Announcements', desc: 'Keep customers updated on progress' },
              { icon: '🔗', title: 'Polls & Surveys', desc: 'Quick feedback with detailed insights' },
              { icon: '👥', title: 'Team Management', desc: 'Collaborate with your team' },
              { icon: '📊', title: 'Analytics', desc: 'Understand what matters to users' },
            ].map((f, i) => (
              <div key={i} className="p-8 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
                <div className="text-4xl mb-3">{f.icon}</div>
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--ink)' }}>{f.title}</h3>
                <p style={{ color: 'var(--slate)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center rounded-3xl p-12" style={{ background: 'var(--peach)' }}>
          <h2 className="text-3xl font-black mb-4" style={{ color: 'var(--ink)' }}>Ready to listen to your customers?</h2>
          <p className="mb-8 text-lg" style={{ color: 'var(--slate)' }}>
            Join hundreds of teams building with Frill. Start free, upgrade when you grow.
          </p>
          <Link href={user ? '/admin' : '/signup'} 
            className="inline-block px-8 py-3.5 rounded-xl text-base font-semibold text-white cursor-pointer hover:opacity-90"
            style={{ background: 'var(--coral)' }}>
            Get Started Now →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-6 text-center" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
        <p>© 2024 Frill. Customer feedback made simple.</p>
      </footer>
    </div>
  )
}
