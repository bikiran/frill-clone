'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

const SIDEBAR_GROUPS = [
  { section: 'Overview', items: [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Settings', href: '/admin/settings' },
  ]},
  { section: 'Content', items: [
    { label: 'Announcements', href: '/admin/announcements' },
    { label: 'Topics', href: '/admin/topics' },
    { label: 'Statuses', href: '/admin/statuses' },
    { label: 'Priorities', href: '/admin/priorities' },
  ]},
  { section: 'Feedback', items: [
    { label: 'Surveys', href: '/admin/surveys' },
    { label: 'Polls', href: '/admin/polls' },
  ]},
  { section: 'Customization', items: [
    { label: 'Terminology', href: '/admin/terminology' },
    { label: 'Segments', href: '/admin/segments' },
    { label: 'Team Members', href: '/admin/team' },
  ]},
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (u?.email !== ADMIN_EMAIL) {
        router.push('/')
      } else {
        setAuthed(true)
      }
    })
  }, [router])

  if (authed === null) {
    return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Admin Sidebar */}
      <aside className="hidden md:flex flex-col w-56 lg:w-60 shrink-0 bg-white border-r overflow-y-auto sticky top-14 h-[calc(100vh-56px)] self-start" style={{ borderColor: 'var(--border)' }}>
        <div className="py-4 px-3">
          <p className="px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--coral)' }}>Admin</p>
          {SIDEBAR_GROUPS.map((group, gi) => (
            <div key={gi}>
              <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>
                {group.section}
              </p>
              {group.items.map(item => {
                const active = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block px-3 py-1.5 text-sm rounded-md transition-smooth"
                    style={{
                      background: active ? 'var(--peach)' : 'transparent',
                      color: active ? 'var(--coral)' : 'var(--ink)',
                      fontWeight: active ? 600 : 400,
                    }}>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
