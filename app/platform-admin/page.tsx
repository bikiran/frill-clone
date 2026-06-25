'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

const PLAN_COLORS: Record<string, any> = {
  free:       { bg: '#f3f4f6', color: '#6b7280', label: 'Free' },
  pro:        { bg: 'var(--peach)', color: 'var(--coral)', label: 'Pro' },
  enterprise: { bg: '#faf5ff', color: '#7c3aed', label: 'Enterprise' },
  trial:      { bg: '#fef9c3', color: '#ca8a04', label: 'Trial' },
}

export default function PlatformAdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<any[]>([])
  const [stats, setStats] = useState({ total: 0, pro: 0, free: 0, mrr: 0, ideas: 0, users: 0 })
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [selectedCompany, setSelectedCompany] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'companies' | 'revenue'>('overview')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      if (!u || u.email !== SUPER_ADMIN_EMAIL) {
        router.push('/signin')
        return
      }
      setUser(u)
      loadData()
    })
  }, [router])

  const loadData = async () => {
    try {
      const { data: cos } = await (supabase as any)
        .from('companies')
        .select('*, subscriptions(tier, status, current_period_end)')
        .order('created_at', { ascending: false })

      const coList = (cos || []).map((c: any) => ({
        ...c,
        plan: c.subscriptions?.[0]?.tier || 'free',
        sub_status: c.subscriptions?.[0]?.status || 'none',
      }))

      setCompanies(coList)

      const { count: ideaCount } = await (supabase as any).from('ideas').select('*', { count: 'exact', head: true })

      const proCount = coList.filter((c: any) => c.plan === 'pro').length
      const mrr = proCount * 99

      setStats({
        total: coList.length,
        pro: proCount,
        free: coList.filter((c: any) => c.plan === 'free').length,
        mrr,
        ideas: ideaCount || 0,
        users: coList.length,
      })
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const updatePlan = async (companyId: string, plan: string) => {
    await (supabase as any).from('companies').update({ plan }).eq('id', companyId)
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, plan } : c))
    if (selectedCompany?.id === companyId) setSelectedCompany((c: any) => ({ ...c, plan }))
  }

  const filteredCompanies = companies.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.slug?.includes(search.toLowerCase())
    const matchPlan = planFilter === 'all' || c.plan === planFilter
    return matchSearch && matchPlan
  })

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f172a' }}>
    <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
  </div>

  return (
    <div className="min-h-screen" style={{ background: '#0f172a', color: '#e2e8f0' }}>
      {/* Top nav */}
      <header className="border-b px-6 h-14 flex items-center justify-between sticky top-0 z-40" style={{ borderColor: '#1e293b', background: '#0f172a' }}>
        <div className="flex items-center gap-3">
          <div className="text-lg font-bold" style={{ color: '#6366f1' }}>Colvy</div>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#1e293b', color: '#94a3b8' }}>Platform Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: '#94a3b8' }}>{user?.email}</span>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/signin') }}
            className="px-3 py-1.5 rounded-lg text-xs cursor-pointer" style={{ background: '#1e293b', color: '#94a3b8' }}>
            Sign out
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 border-r min-h-[calc(100vh-56px)] pt-4 px-3" style={{ borderColor: '#1e293b' }}>
          {[
            { key: 'overview', label: '📊 Overview' },
            { key: 'companies', label: '🏢 Companies' },
            { key: 'revenue', label: '💳 Revenue' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm mb-0.5 cursor-pointer transition-all"
              style={{ background: activeTab === tab.key ? '#1e293b' : 'transparent', color: activeTab === tab.key ? '#e2e8f0' : '#64748b' }}>
              {tab.label}
            </button>
          ))}

          <div className="border-t mt-4 pt-4" style={{ borderColor: '#1e293b' }}>
            <p className="px-3 text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#475569' }}>Quick Links</p>
            <a href="https://supabase.com" target="_blank" className="flex items-center px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-slate-800 transition-all" style={{ color: '#64748b' }}>
              🗄️ Supabase
            </a>
            <a href="https://vercel.com" target="_blank" className="flex items-center px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-slate-800 transition-all" style={{ color: '#64748b' }}>
              ▲ Vercel
            </a>
            <a href="https://dashboard.stripe.com" target="_blank" className="flex items-center px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-slate-800 transition-all" style={{ color: '#64748b' }}>
              💳 Stripe
            </a>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <>
              <h1 className="text-2xl font-bold mb-6">Platform Overview</h1>

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                {[
                  { label: 'Total Boards', value: stats.total, icon: '🏢' },
                  { label: 'Pro Plans', value: stats.pro, icon: '⭐' },
                  { label: 'Free Plans', value: stats.free, icon: '🆓' },
                  { label: 'MRR', value: `$${stats.mrr.toLocaleString()}`, icon: '💰' },
                  { label: 'Total Ideas', value: stats.ideas, icon: '💡' },
                  { label: 'ARR', value: `$${(stats.mrr * 12).toLocaleString()}`, icon: '📈' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-4 border" style={{ background: '#1e293b', borderColor: '#334155' }}>
                    <p className="text-2xl mb-1">{s.icon}</p>
                    <p className="text-2xl font-black" style={{ color: '#e2e8f0' }}>{s.value}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Recent signups */}
              <div className="rounded-2xl border overflow-hidden" style={{ background: '#1e293b', borderColor: '#334155' }}>
                <div className="px-5 py-3 border-b" style={{ borderColor: '#334155' }}>
                  <h2 className="font-bold">Recent Boards</h2>
                </div>
                <div className="divide-y" style={{ borderColor: '#334155' }}>
                  {companies.slice(0, 10).map(c => {
                    const pc = PLAN_COLORS[c.plan] || PLAN_COLORS.free
                    return (
                      <div key={c.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-700/30 cursor-pointer"
                        onClick={() => { setSelectedCompany(c); setActiveTab('companies') }}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
                            style={{ background: c.accent_color || '#6366f1' }}>
                            {c.name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: '#e2e8f0' }}>{c.name}</p>
                            <p className="text-xs" style={{ color: '#64748b' }}>{c.slug}.colvy.com</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: pc.bg, color: pc.color }}>{pc.label}</span>
                          <span className="text-xs" style={{ color: '#475569' }}>{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {activeTab === 'companies' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Companies ({companies.length})</h1>
              </div>

              {/* Filters */}
              <div className="flex gap-3 mb-5">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#64748b' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..."
                    className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0', border: '1px solid #334155', fontSize: '16px' }} />
                </div>
                {['all', 'free', 'pro', 'enterprise'].map(p => (
                  <button key={p} onClick={() => setPlanFilter(p)}
                    className="px-3 py-2 rounded-lg text-sm cursor-pointer capitalize transition-all"
                    style={{ background: planFilter === p ? '#6366f1' : '#1e293b', color: planFilter === p ? 'white' : '#64748b', border: '1px solid #334155' }}>
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex gap-6">
                {/* Company list */}
                <div className="flex-1 rounded-2xl border overflow-hidden" style={{ background: '#1e293b', borderColor: '#334155' }}>
                  <div className="divide-y" style={{ borderColor: '#334155' }}>
                    {filteredCompanies.length === 0 ? (
                      <p className="p-6 text-center" style={{ color: '#64748b' }}>No companies found</p>
                    ) : filteredCompanies.map(c => {
                      const pc = PLAN_COLORS[c.plan] || PLAN_COLORS.free
                      return (
                        <div key={c.id}
                          className="px-5 py-3.5 flex items-center justify-between cursor-pointer transition-all"
                          style={{ background: selectedCompany?.id === c.id ? '#0f172a' : 'transparent' }}
                          onClick={() => setSelectedCompany(c)}>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                              style={{ background: c.accent_color || '#6366f1' }}>
                              {c.name?.[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{c.name}</p>
                              <p className="text-xs" style={{ color: '#64748b' }}>{c.slug}.colvy.com · {c.industry || 'No industry'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: pc.bg, color: pc.color }}>{pc.label}</span>
                            <span className="text-xs" style={{ color: '#475569' }}>{new Date(c.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Company detail */}
                {selectedCompany && (
                  <div className="w-72 shrink-0 space-y-4">
                    <div className="rounded-2xl border p-5" style={{ background: '#1e293b', borderColor: '#334155' }}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white"
                          style={{ background: selectedCompany.accent_color || '#6366f1' }}>
                          {selectedCompany.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold" style={{ color: '#e2e8f0' }}>{selectedCompany.name}</p>
                          <a href={`https://${selectedCompany.slug}.colvy.com`} target="_blank"
                            className="text-xs hover:underline" style={{ color: '#6366f1' }}>
                            {selectedCompany.slug}.colvy.com ↗
                          </a>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm mb-4">
                        {[
                          { label: 'Industry', value: selectedCompany.industry || '—' },
                          { label: 'Created', value: new Date(selectedCompany.created_at).toLocaleDateString() },
                          { label: 'Plan', value: selectedCompany.plan },
                        ].map(row => (
                          <div key={row.label} className="flex justify-between">
                            <span style={{ color: '#64748b' }}>{row.label}</span>
                            <span style={{ color: '#e2e8f0' }}>{row.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Plan override */}
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: '#64748b' }}>OVERRIDE PLAN</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {['free', 'pro', 'enterprise', 'trial'].map(plan => {
                            const pc = PLAN_COLORS[plan]
                            return (
                              <button key={plan} onClick={() => updatePlan(selectedCompany.id, plan)}
                                className="py-1.5 rounded-lg text-xs font-semibold cursor-pointer capitalize transition-all border"
                                style={{
                                  background: selectedCompany.plan === plan ? pc.bg : 'transparent',
                                  color: selectedCompany.plan === plan ? pc.color : '#64748b',
                                  borderColor: selectedCompany.plan === plan ? pc.color : '#334155',
                                }}>
                                {plan}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="rounded-2xl border p-4" style={{ background: '#1e293b', borderColor: '#334155' }}>
                      <p className="text-xs font-semibold mb-3" style={{ color: '#64748b' }}>ACTIONS</p>
                      <div className="space-y-2">
                        <a href={`https://${selectedCompany.slug}.colvy.com`} target="_blank"
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-slate-700/50 transition-all"
                          style={{ color: '#e2e8f0' }}>
                          👁️ View board
                        </a>
                        <button
                          onClick={() => { if (confirm(`Delete ${selectedCompany.name}? This cannot be undone.`)) alert('Contact Supabase to delete company data.') }}
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-red-900/30 transition-all text-left"
                          style={{ color: '#ef4444' }}>
                          🗑️ Delete company
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'revenue' && (
            <>
              <h1 className="text-2xl font-bold mb-6">Revenue</h1>
              <div className="grid md:grid-cols-3 gap-4 mb-8">
                {[
                  { label: 'MRR', value: `$${stats.mrr.toLocaleString()}`, sub: `${stats.pro} pro plans × $99`, color: '#10b981' },
                  { label: 'ARR', value: `$${(stats.mrr * 12).toLocaleString()}`, sub: 'Annualized', color: '#6366f1' },
                  { label: 'Avg Revenue/Board', value: `$${stats.total ? Math.round(stats.mrr / stats.total) : 0}`, sub: 'Across all plans', color: '#f59e0b' },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl border p-6" style={{ background: '#1e293b', borderColor: '#334155' }}>
                    <p className="text-sm mb-1" style={{ color: '#64748b' }}>{s.label}</p>
                    <p className="text-3xl font-black mb-1" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs" style={{ color: '#475569' }}>{s.sub}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border overflow-hidden" style={{ background: '#1e293b', borderColor: '#334155' }}>
                <div className="px-5 py-3 border-b" style={{ borderColor: '#334155' }}>
                  <h2 className="font-bold">Plan Distribution</h2>
                </div>
                <div className="p-5 space-y-4">
                  {['pro', 'free', 'trial', 'enterprise'].map(plan => {
                    const count = companies.filter(c => c.plan === plan).length
                    const pct = companies.length ? Math.round((count / companies.length) * 100) : 0
                    const pc = PLAN_COLORS[plan]
                    return (
                      <div key={plan}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm capitalize" style={{ color: '#e2e8f0' }}>{plan}</span>
                          <span className="text-sm" style={{ color: '#64748b' }}>{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#334155' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pc.color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
