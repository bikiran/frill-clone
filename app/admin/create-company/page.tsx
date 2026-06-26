'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { isValidSlug, isSlugAvailable } from '@/lib/board'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'
const INDUSTRIES = ['SaaS', 'E-commerce', 'Healthcare', 'Education', 'Finance',
  'Logistics', 'Manufacturing', 'Media & Entertainment', 'Travel & Hospitality',
  'Retail', 'Real Estate', 'Other']
const PLANS = ['free', 'trial', 'pro', 'enterprise']

export default function CreateCompanyPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  // Company fields
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [slug, setSlug] = useState('')
  const [industry, setIndustry] = useState('')
  const [plan, setPlan] = useState('free')
  const [accentColor, setAccentColor] = useState('#ff7a6b')
  const [description, setDescription] = useState('')

  const [slugStatus, setSlugStatus] = useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      if (u?.email !== SUPER_ADMIN_EMAIL) { router.push('/admin'); return }
      setUser(u)
    })
  }, [router])

  // Auto slug from company name
  useEffect(() => {
    if (!companyName) { setSlug(''); return }
    const auto = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
    if (auto.length >= 3) setSlug(auto)
  }, [companyName])

  // Check slug
  useEffect(() => {
    if (!slug) { setSlugStatus('idle'); return }
    if (!isValidSlug(slug)) { setSlugStatus('invalid'); return }
    setSlugStatus('checking')
    const t = setTimeout(async () => {
      const ok = await isSlugAvailable(slug)
      setSlugStatus(ok ? 'available' : 'taken')
    }, 500)
    return () => clearTimeout(t)
  }, [slug])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (slugStatus !== 'available') { setError('Slug not available'); return }

    setLoading(true)
    try {
      // 1. Create the owner's auth account
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword, name: ownerName, role: 'owner' }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      // 2. Get the new user's ID
      const { data: users } = await (supabase as any).auth.admin.listUsers()
      const newUser = users?.users?.find((u: any) => u.email === ownerEmail)
      const userId = newUser?.id

      // 3. Create the company via API route
      const coRes = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId || ownerEmail, // fallback to email if no ID yet
          slug: slug.toLowerCase(),
          name: companyName.trim(),
          industry,
          accentColor,
          description: description.trim(),
          plan,
        }),
      })
      const coResult = await coRes.json()
      if (coResult.error && !coResult.error.includes('duplicate')) throw new Error(coResult.error)

      // 4. Update company plan
      if (coResult.company?.id) {
        await (supabase as any).from('companies').update({ plan, description: description.trim() }).eq('id', coResult.company.id)
      }

      setSuccess({
        ownerEmail,
        ownerPassword,
        boardUrl: `https://${slug}.colvy.com`,
        adminUrl: `https://${slug}.colvy.com/admin`,
        plan,
      })

      // Reset form
      setOwnerName(''); setOwnerEmail(''); setOwnerPassword('')
      setCompanyName(''); setSlug(''); setIndustry('')
      setPlan('free'); setDescription('')

    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  if (!user) return <div className="p-8">Loading...</div>

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/admin" className="text-sm" style={{ color: 'var(--slate)' }}>← Admin</Link>
        <span style={{ color: 'var(--slate)' }}>/</span>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Create Company</h1>
      </div>

      {success && (
        <div className="mb-6 p-5 rounded-2xl border" style={{ borderColor: '#10b981', background: '#f0fdf4' }}>
          <p className="font-bold text-green-700 mb-3">✅ Company created successfully!</p>
          <div className="space-y-1.5 text-sm">
            <p><span className="font-medium text-gray-600">Board URL:</span> <a href={success.boardUrl} target="_blank" className="text-green-600 underline">{success.boardUrl}</a></p>
            <p><span className="font-medium text-gray-600">Admin URL:</span> <a href={success.adminUrl} target="_blank" className="text-green-600 underline">{success.adminUrl}</a></p>
            <p><span className="font-medium text-gray-600">Login email:</span> <code className="bg-gray-100 px-1 rounded">{success.ownerEmail}</code></p>
            <p><span className="font-medium text-gray-600">Password:</span> <code className="bg-gray-100 px-1 rounded">{success.ownerPassword}</code></p>
            <p><span className="font-medium text-gray-600">Plan:</span> {success.plan}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="mt-3 text-xs underline text-gray-500 cursor-pointer">Create another</button>
        </div>
      )}

      {error && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}

      <form onSubmit={handleCreate} className="space-y-6">
        {/* Owner Account */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>👤 Owner Account</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Full name</label>
              <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="John Doe" required
                className="w-full px-4 py-2.5 rounded-xl border focus:outline-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email address</label>
              <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="owner@company.com" required
                className="w-full px-4 py-2.5 rounded-xl border focus:outline-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
                Password <span className="font-normal" style={{ color: 'var(--slate)' }}>(send this to them)</span>
              </label>
              <div className="flex gap-2">
                <input type="text" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} placeholder="Min. 8 characters" required
                  className="flex-1 px-4 py-2.5 rounded-xl border focus:outline-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                <button type="button" onClick={() => setOwnerPassword(Math.random().toString(36).slice(2, 10) + 'A1!')}
                  className="px-4 py-2.5 rounded-xl border text-sm cursor-pointer hover:bg-gray-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                  Generate
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Company Details */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>🏢 Company Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Company name</label>
              <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Inc." required
                className="w-full px-4 py-2.5 rounded-xl border focus:outline-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Board URL</label>
              <div className="flex items-center rounded-xl border overflow-hidden"
                style={{ borderColor: slugStatus === 'available' ? '#10b981' : slugStatus === 'taken' ? '#ef4444' : 'var(--border)' }}>
                <input type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme" required
                  className="flex-1 px-4 py-2.5 focus:outline-none text-sm min-w-0" style={{ fontSize: '16px' }} />
                <span className="px-3 py-2.5 text-sm border-l shrink-0" style={{ background: 'var(--canvas)', color: 'var(--slate)', borderColor: 'var(--border)' }}>
                  .colvy.com
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: slugStatus === 'available' ? '#10b981' : '#ef4444' }}>
                {{ idle: '', checking: 'Checking...', available: '✓ Available', taken: '✗ Already taken', invalid: '✗ Invalid format' }[slugStatus]}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Business type / Industry</label>
              <select value={industry} onChange={e => setIndustry(e.target.value)} required
                className="w-full px-4 py-2.5 rounded-xl border focus:outline-none text-sm"
                style={{ borderColor: 'var(--border)', fontSize: '16px', color: industry ? 'var(--ink)' : 'var(--slate)' }}>
                <option value="">Select industry</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Description <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this company do?"
                rows={2} className="w-full px-4 py-2.5 rounded-xl border focus:outline-none resize-none text-sm"
                style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Brand color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                  className="w-12 h-10 rounded-lg cursor-pointer border p-1" style={{ borderColor: 'var(--border)' }} />
                <input type="text" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border focus:outline-none text-sm font-mono"
                  style={{ borderColor: 'var(--border)' }} />
                <div className="w-10 h-10 rounded-xl" style={{ background: accentColor }} />
              </div>
            </div>
          </div>
        </div>

        {/* Plan */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>💳 Plan</h2>
          <div className="grid grid-cols-2 gap-3">
            {PLANS.map(p => (
              <button key={p} type="button" onClick={() => setPlan(p)}
                className="py-3 px-4 rounded-xl border text-sm font-semibold capitalize cursor-pointer transition-all text-left"
                style={{
                  borderColor: plan === p ? 'var(--coral)' : 'var(--border)',
                  background: plan === p ? 'var(--peach)' : 'white',
                  color: plan === p ? 'var(--coral)' : 'var(--ink)',
                }}>
                {p === 'free' && '🆓 '}
                {p === 'trial' && '⏱️ '}
                {p === 'pro' && '⭐ '}
                {p === 'enterprise' && '🏆 '}
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={loading || slugStatus !== 'available'}
          className="w-full py-3.5 rounded-xl font-semibold text-white cursor-pointer disabled:opacity-50 text-base"
          style={{ background: 'var(--coral)' }}>
          {loading ? 'Creating company...' : '🚀 Create Company & Account'}
        </button>
      </form>
    </div>
  )
}
