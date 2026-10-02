'use client'

import { useState } from 'react'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'

// Light/dark shell for the blog. Sets --blog-* CSS variables so the
// server-rendered article/listing markup (which uses those vars) recolours when
// the nav's dark toggle flips. Content is passed as children from the server
// page, so it stays in the SSR HTML for search engines.
export default function BlogChrome({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false)
  const vars = (dark
    ? { '--blog-bg': '#0a0b12', '--blog-surface': 'rgba(255,255,255,0.05)', '--blog-text': '#f4f5fb', '--blog-muted': 'rgba(244,245,251,0.62)', '--blog-border': 'rgba(255,255,255,0.1)' }
    : { '--blog-bg': '#ffffff', '--blog-surface': '#ffffff', '--blog-text': '#0f1119', '--blog-muted': 'rgba(15,17,25,0.6)', '--blog-border': 'rgba(15,17,25,0.1)' }
  ) as React.CSSProperties

  return (
    <div style={{ background: 'var(--blog-bg)', color: 'var(--blog-text)', minHeight: '100vh', fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif', ...vars }}>
      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />
      {children}
      <MarketingFooter dark={dark} />
    </div>
  )
}
