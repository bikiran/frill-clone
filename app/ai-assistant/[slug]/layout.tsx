import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'
import { AI_SLUGS } from '@/lib/marketing-routes'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// The page is a client component, so the address is checked here: only the
// AI assistant pages that exist are built (lib/marketing-routes.ts mirrors AI in ./page.tsx),
// and any other address is a real 404, not a page with fallback copy.
export function generateStaticParams() {
  return AI_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

// Search titles and descriptions, from each page's own name, headline and
// intro in ./page.tsx (keys mirror AI; scripts/marketing-routes.test.mjs
// checks every page has one).
const META: Record<string, { title: string; description: string }> = {
  "ai-replies": { title: "AI Replies: Replies drafted in a blink", description: "The assistant drafts an on-brand answer for every message — ready to send, tweak or discard. You’re never staring at a blank reply box." },
  "knowledge-base": { title: "Knowledge Base: Answers from your own knowledge", description: "Teach the assistant your help center, docs and best replies, so every answer is accurate and on-brand — and it hands off when it isn’t sure." },
  "auto-summaries": { title: "Auto-Summaries: Every thread, summed up", description: "Long conversations and calls condensed to a line at the top, so anyone can pick up where things left off in seconds." },
  "ai-actions": { title: "AI Actions: AI that takes real action", description: "Beyond chat: the assistant looks up orders, checks stock, creates tasks and records sales — with a human approving anything that matters." },
  "auto-routing": { title: "Auto-Routing: Every conversation, to the right person", description: "The assistant reads each incoming message and sends it to the right teammate or team — automatically, the moment it lands." },
  "follow-ups": { title: "Follow-ups: Nothing slips through", description: "The assistant turns conversations into reminders and tasks, and nudges at the right moment — so the things you promised actually happen." },
  "tasks-reminders": { title: "Tasks & Reminders: Turn chats into to-dos", description: "Spin a task out of any conversation, assign it and set a reminder — so what you agreed to actually gets done." },
  "workflows": { title: "Workflows: Trigger actions on any event", description: "Build simple automations — when this happens, do that — so the routine runs itself while you focus on customers." },
  "human-in-control": { title: "Human in Control: AI proposes, you decide", description: "Every reply is a suggestion and every action is opt-in, with a full audit log. The assistant helps — it never goes rogue." },
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Not found', robots: { index: false } }
  return pageMeta({ title: m.title, description: m.description, path: `ai-assistant/${slug}` })
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!AI_SLUGS.includes(slug)) notFound()
  const m = META[slug]
  const path = `ai-assistant/${slug}`
  return (
    <>
      {m && <JsonLd data={[breadcrumbJsonLd(SITE_URL, [{ name: 'AI Assistant', path: 'ai-assistant' }, { name: m.title, path }])]} />}
      {children}
    </>
  )
}
