'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getUserPlan, isPro, PLAN_NAMES } from '@/lib/plan'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { LightbulbIcon, MapIcon, MegaphoneIcon, SurveyIcon, PollIcon, HomeIcon } from '@/components/Icons'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

export default function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [plan, setPlan] = useState<any>('free')
  const [stats, setStats] = useState({ ideas: 0, announcements: 0, surveys: 0, polls: 0 })
  const [loading, setLoading] = useState(true)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  const [activity, setActivity] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u)
    })
    fetchStats()
    fetchActivity()
  }, [router])

  const fetchStats = async () => {
    try {
      const [ideas, announcements, topics, statuses, surveys, polls] = await Promise.all([
        supabase.from('ideas').select('id', { count: 'exact', head: true }),
        supabase.from('announcements').select('id', { count: 'exact', head: true }),
        supabase.from('topics').select('id', { count: 'exact', head: true }),
        supabase.from('statuses').select('id', { count: 'exact', head: true }),
        supabase.from('surveys').select('id', { count: 'exact', head: true }),
        supabase.from('polls').select('id', { count: 'exact', head: true }),
      ])
      
      setStats({
        ideas: ideas.count || 0,
        announcements: announcements.count || 0,
        surveys: surveys.count || 0,
        polls: polls.count || 0,
      })

      // Auto-complete setup steps based on what's been created
      const autoCompleted = new Set<string>()
      if ((topics?.count || 0) > 0) autoCompleted.add('topics')
      if ((statuses?.count || 0) > 0) autoCompleted.add('statuses')
      if ((ideas?.count || 0) > 0) autoCompleted.add('idea')
      if ((announcements?.count || 0) > 0) autoCompleted.add('announcement')
      if ((surveys?.count || 0) > 0) autoCompleted.add('survey')
      if ((polls?.count || 0) > 0) autoCompleted.add('poll')
      
      setCompletedSteps(prev => new Set([...prev, ...autoCompleted]))
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
    setLoading(false)
  }

  const fetchActivity = async () => {
    try {
      const [ideas, comments, votes, anns] = await Promise.all([
        (supabase as any).from('ideas').select('id,title,created_at,created_by_name').order('created_at', { ascending: false }).limit(5),
        (supabase as any).from('comments').select('id,content,created_at,author_name,idea_id').order('created_at', { ascending: false }).limit(5),
        (supabase as any).from('votes').select('id,created_at,idea_id').order('created_at', { ascending: false }).limit(5),
        (supabase as any).from('announcements').select('id,title,created_at').order('created_at', { ascending: false }).limit(3),
      ])
      const items: any[] = []
      ;(ideas.data || []).forEach((i: any) => items.push({ type: 'idea', label: i.title, by: i.created_by_name || 'Someone', at: i.created_at, icon: '💡', color: 'var(--coral)' }))
      ;(comments.data || []).forEach((c: any) => items.push({ type: 'comment', label: c.content?.slice(0, 60), by: c.author_name || 'Someone', at: c.created_at, icon: '💬', color: '#7c3aed' }))
      ;(votes.data || []).forEach((v: any) => items.push({ type: 'vote', label: 'Upvoted an idea', by: 'A user', at: v.created_at, icon: '▲', color: '#2563eb' }))
      ;(anns.data || []).forEach((a: any) => items.push({ type: 'announcement', label: a.title, by: 'Admin', at: a.created_at, icon: '📢', color: '#059669' }))
      items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      setActivity(items.slice(0, 12))
    } catch {}
  }

  const toggleStep = (step: string) => {
    const next = new Set(completedSteps)
    if (next.has(step)) next.delete(step)
    else next.add(step)
    setCompletedSteps(next)
  }

  const totalSteps = 8
  const doneSteps = completedSteps.size
  const progress = Math.round((doneSteps / totalSteps) * 100)

  if (!user) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  const NAV = [
    { label: 'Home', href: '/admin', icon: <HomeIcon size={16} />, active: true },
    { label: 'Ideas', href: '/', icon: <LightbulbIcon size={16} />, active: false },
    { label: 'Roadmap', href: '/roadmap', icon: <MapIcon size={16} />, active: false },
    { label: 'Announcements', href: '/announcements', icon: <MegaphoneIcon size={16} />, active: false },
    { label: 'Surveys', href: '/admin/surveys', icon: <SurveyIcon size={16} />, active: false },
    { label: 'Polls', href: '/admin/polls', icon: <PollIcon size={16} />, active: false },
  ]

  const SETTINGS = [
    { label: 'General Settings', href: '/admin/settings' },
    { label: 'Statuses', href: '/admin/statuses' },
    { label: 'Topics', href: '/admin/topics' },
    { label: 'Priorities', href: '/admin/priorities' },
    { label: 'Terminology', href: '/admin/terminology' },
  ]

  const STEPS = [
    { key: 'topics', label: 'Set up your Topics', desc: 'Topics help categorize ideas so your users can find what matters most.', link: '/admin/topics', linkText: 'Manage Topics' },
    { key: 'statuses', label: 'Configure Statuses', desc: 'Create custom statuses for your roadmap workflow.', link: '/admin/statuses', linkText: 'Manage Statuses' },
    { key: 'idea', label: 'Add your first Idea', desc: 'Create a sample idea to see how the feedback board works.', link: '/', linkText: 'Go to Ideas' },
    { key: 'announcement', label: 'Publish an Announcement', desc: 'Share what you\'ve shipped to keep your users in the loop.', link: '/admin/announcements/new', linkText: 'Create Announcement' },
    { key: 'survey', label: 'Create your first Survey', desc: 'Gather customer feedback with targeted surveys.', link: '/admin/surveys', linkText: 'Create Survey' },
    { key: 'poll', label: 'Create your first Poll', desc: 'Engage users with quick polls on ideas.', link: '/admin/polls', linkText: 'Create Poll' },
    { key: 'terminology', label: 'Customize Terminology', desc: 'Tailor language to match your brand (optional).', link: '/admin/terminology', linkText: 'Customize Terms' },
    { key: 'invite', label: 'Invite Team Members', desc: 'Add admins to collaborate on feedback management.', link: '/admin/settings', linkText: 'Manage Team' },
  ]

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 lg:w-64 shrink-0 bg-white border-r" style={{ borderColor: 'var(--border)' }}>
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {/* Getting Started progress */}
          <div className="px-3 py-2 mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: '#eab308' }}>
                🏆 Getting Started
              </span>
              <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100">
              <div className="h-1.5 rounded-full transition-smooth" style={{ background: '#eab308', width: `${progress}%` }} />
            </div>
          </div>

          {NAV.map(n => (
            <Link 
              key={n.label}
              href={n.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-smooth hover:bg-gray-50"
              style={{ 
                background: n.active ? 'var(--canvas)' : 'transparent',
                color: n.active ? 'var(--ink)' : 'var(--slate)',
                fontWeight: n.active ? 600 : 400,
              }}>
              {n.icon}
              <span>{n.label}</span>
            </Link>
          ))}

          <div className="border-t my-3" style={{ borderColor: 'var(--border)' }} />

          <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>
            Settings
          </p>
          {SETTINGS.map(s => (
            <Link 
              key={s.label}
              href={s.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-smooth hover:bg-gray-50"
              style={{ color: 'var(--slate)' }}>
              {s.label}
            </Link>
          ))}
        </div>

        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <Link href="/admin/settings" className="flex items-center gap-2 text-sm hover:opacity-70 transition-smooth" style={{ color: 'var(--slate)' }}>
            ⚙️ Settings
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>Getting Started</h1>
            <button 
              onClick={() => setCompletedSteps(new Set(STEPS.map(s => s.key)))}
              className="px-4 py-2 rounded-lg border text-sm font-medium transition-smooth hover:bg-gray-50 cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              ✓ Mark all done
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Ideas', value: stats.ideas, icon: <LightbulbIcon size={20} color="var(--coral)" />, href: '/' },
              { label: 'Announcements', value: stats.announcements, icon: <MegaphoneIcon size={20} color="var(--coral)" />, href: '/announcements' },
              { label: 'Surveys', value: stats.surveys, icon: <SurveyIcon size={20} color="var(--coral)" />, href: '/admin/surveys' },
              { label: 'Polls', value: stats.polls, icon: <PollIcon size={20} color="var(--coral)" />, href: '/admin/polls' },
            ].map(s => (
              <Link key={s.label} href={s.href} className="bg-white rounded-xl border p-4 hover:shadow-md transition-smooth" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  {s.icon}
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>{s.label}</p>
                </div>
                <p className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>{s.value}</p>
              </Link>
            ))}
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {STEPS.map(step => (
              <div key={step.key} className="bg-white rounded-xl border overflow-hidden transition-smooth" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => toggleStep(step.key)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer">
                  <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-smooth ${completedSteps.has(step.key) ? '' : ''}`}
                    style={{
                      borderColor: completedSteps.has(step.key) ? '#10b981' : 'var(--border)',
                      background: completedSteps.has(step.key) ? '#10b981' : 'white',
                    }}>
                    {completedSteps.has(step.key) && <span className="text-white text-xs">✓</span>}
                  </span>
                  <span className="flex-1 text-sm font-semibold" style={{ 
                    color: completedSteps.has(step.key) ? 'var(--slate)' : 'var(--ink)',
                    textDecoration: completedSteps.has(step.key) ? 'line-through' : 'none',
                  }}>
                    {step.label}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--slate)' }}>›</span>
                </button>
                {!completedSteps.has(step.key) && (
                  <div className="px-5 pb-4 pl-14">
                    <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>{step.desc}</p>
                    <Link
                      href={step.link}
                      className="inline-block px-4 py-2 rounded-lg text-sm font-semibold text-white transition-smooth press-effect cursor-pointer"
                      style={{ background: 'var(--coral)' }}>
                      {step.linkText} →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Resources */}
          <div className="mt-8 bg-white rounded-xl border p-6" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Resources</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {[
                { label: 'Manage Topics', href: '/admin/topics' },
                { label: 'Configure Statuses', href: '/admin/statuses' },
                { label: 'Create Surveys', href: '/admin/surveys' },
                { label: 'Create Polls', href: '/admin/polls' },
                { label: 'Team Members', href: '/admin/team' },
                { label: 'Settings', href: '/admin/settings' },
              ].map(r => (
                <Link key={r.label} href={r.href} className="flex items-center gap-2 text-sm p-3 rounded-lg hover:bg-gray-50 transition-smooth" style={{ color: 'var(--ink)' }}>
                  📄 {r.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="mt-8 bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Recent Activity</h3>
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>Live</span>
            </div>
            {activity.length === 0 ? (
              <div className="px-6 py-10 text-center" style={{ color: 'var(--slate)' }}>
                <p className="text-3xl mb-2">🌱</p>
                <p className="text-sm">No activity yet — your feed will appear here as users interact</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {activity.map((item, i) => (
                  <div key={i} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-all">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base font-bold"
                      style={{ background: item.color + '20', color: item.color }}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                        <span style={{ color: item.color }}>{item.by}</span>
                        {' '}
                        {item.type === 'idea' && 'submitted'}
                        {item.type === 'comment' && 'commented'}
                        {item.type === 'vote' && 'upvoted'}
                        {item.type === 'announcement' && 'published'}
                      </p>
                      {item.label && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--slate)' }}>"{item.label}"</p>
                      )}
                    </div>
                    <span className="text-xs shrink-0 mt-0.5" style={{ color: 'var(--slate)' }}>
                      {new Date(item.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Database Setup */}
          <div className="mt-8 bg-blue-50 rounded-xl border p-6" style={{ borderColor: '#3b82f6' }}>
            <h3 className="font-bold mb-2 text-blue-900">Database Setup</h3>
            <p className="text-sm text-blue-800 mb-4">
              If you see "Make sure DATABASE_SETUP.sql has been run" errors, follow these steps:
            </p>
            <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
              <li>Go to <strong>Supabase Dashboard</strong></li>
              <li>Open your project (Bikiran)</li>
              <li>Click <strong>SQL Editor</strong></li>
              <li>Create a new query</li>
              <li>Copy the DATABASE_SETUP.sql content from your project</li>
              <li>Paste it into the SQL editor</li>
              <li>Click <strong>Run</strong></li>
              <li>Refresh this page</li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  )
}
