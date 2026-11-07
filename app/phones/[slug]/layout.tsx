import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'
import { PHONE_SLUGS } from '@/lib/marketing-routes'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// The page is a client component, so the address is checked here: only the
// phone features that exist are built (lib/marketing-routes.ts mirrors PH in ./page.tsx),
// and any other address is a real 404, not a page with fallback copy.
export function generateStaticParams() {
  return PHONE_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

// Search titles and descriptions, from each page's own name, headline and
// intro in ./page.tsx (keys mirror PH; scripts/marketing-routes.test.mjs
// checks every page has one).
const META: Record<string, { title: string; description: string }> = {
  "click-to-dial": { title: "Click to Dial: Call anyone in one click", description: "Dial any customer straight from the conversation, contact or order — no copying numbers, no desk phone." },
  "browser-dialer": { title: "Browser Dialer: A full dialer in your browser", description: "Make and take business calls from any tab — no handsets, no softphone install, no IT ticket." },
  "hd-audio": { title: "HD Audio: HD voice on the Colvy side of every call", description: "Calls in the Colvy app and browser use the Opus HD codec, so your end of the conversation sounds fuller and clearer." },
  "numbers-porting": { title: "Numbers & Porting: Keep your number, or get a new one", description: "Request a port in Colvy and our team handles the paperwork with the carriers, typically within 1 to 3 weeks." },
  "mobile-app": { title: "Mobile App: Take Colvy calls anywhere", description: "Answer calls and messages on the go — the full inbox and dialer in your pocket, on iOS and Android." },
  "warm-transfer": { title: "Warm Transfer: Hand off calls the right way", description: "Brief a colleague before you pass the call across, so the customer never has to repeat themselves." },
  "call-forwarding": { title: "Call Forwarding: Forward calls to your mobile", description: "Send calls to an Australian mobile or landline: every call, only when you’re closed, after your team’s phones have rung, or when a caller picks it from your…" },
  "cascade-ring": { title: "Cascade Ring: Ring the team in order", description: "Ring one person at a time, in the order you choose, then everyone, then your mobile if you like. Anyone offline or already on a call is skipped." },
  "simultaneous-ring": { title: "Simultaneous Ring: Ring everyone at once", description: "Ring everyone who’s available at once so the fastest to answer gets the call. Teammates already on a call are skipped." },
  "ivr": { title: "IVR & Auto-Attendant: Press-1 menus for your number", description: "Greet callers and let them press a key to reach the right place: ring the team, ring someone in order, forward to a mobile, leave a voicemail, talk to the AI…" },
  "ai-receptionist": { title: "AI Receptionist: An AI that answers when you can’t", description: "Choose when the AI answers your business number — out of hours, when nobody picks up, or always — and it handles the common questions, takes messages and texts…" },
  "ai-call-intelligence": { title: "AI Call Intelligence: Know the caller before you answer", description: "The moment the phone rings, AI surfaces who’s calling, why they might be calling, and their full history — so every call starts informed." },
  "ai-actions": { title: "AI Actions: The call ends, the work is done", description: "After a call, AI drafts the follow-up, creates tasks and updates the contact — so the admin doesn’t pile up." },
  "call-recording": { title: "Call Recording: Record, transcribe, summarise", description: "Every call captured, transcribed and summarised on the thread — for quality, training and never forgetting a detail." },
  "call-reporting": { title: "Call Reporting: See what your calls are doing", description: "Dashboards on call volume, answer and miss rates, talk time and busy hours — so you can staff and coach with data." },
  "missed-call-text-back": { title: "Missed Call Text Back: Miss a call, keep the lead", description: "When you can’t pick up, Colvy auto-texts the caller so the conversation continues instead of going cold." },
  "voicemail": { title: "Voicemail that reads itself", description: "Voicemails transcribed, summarised and dropped into the inbox — read them in seconds instead of dialling in." },
  "voip": { title: "VoIP Phone System: A phone system, built in", description: "Cloud calling inside your inbox — no PBX, no hardware, no separate phone vendor." },
  "international": { title: "International calling is coming", description: "We’re working on international calling from the Colvy dialer. Today, Colvy numbers are Australian, and calls run in the browser and the Colvy app." },
  "command-centre": { title: "Command Centre: Every call, on one screen", description: "A live dashboard of calls in progress, missed callers and team status — with the AI receptionist’s calls right beside your team’s." },
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Not found', robots: { index: false } }
  return pageMeta({ title: m.title, description: m.description, path: `phones/${slug}` })
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!PHONE_SLUGS.includes(slug)) notFound()
  const m = META[slug]
  const path = `phones/${slug}`
  return (
    <>
      {m && <JsonLd data={[breadcrumbJsonLd(SITE_URL, [{ name: 'Phones', path: 'phones' }, { name: m.title, path }])]} />}
      {children}
    </>
  )
}
