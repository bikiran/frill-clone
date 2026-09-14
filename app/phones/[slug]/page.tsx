'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Landing-styled per-phone-feature pages (Coax-style). Data-driven, each with
// its own hero photo under an accent-tinted overlay. Copy is product-level;
// features still on the roadmap are worded as capabilities, not fabricated
// results.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', INK = '#0f1119'

type Band = { tag: string; title: string; body: string; bullets: string[] }
type Feat = {
  accent: string; eyebrow: string; name: string; title: string; sub: string; heroChips: string[]
  features: { icon: string; title: string; desc: string }[]
  bands: Band[]
  stats: { big: string; label: string }[]
  ctaHead: string
}

const PH: Record<string, Feat> = {
  'click-to-dial': {
    accent: GREEN, eyebrow: 'Click to dial', name: 'Click to Dial', title: 'Call anyone in one click',
    sub: 'Dial any customer straight from the conversation, contact or order — no copying numbers, no desk phone.',
    heroChips: ['One-click dial', 'From any tab', 'No hardware'],
    features: [
      { icon: 'phone', title: 'One-click calling', desc: 'Dial from any thread, contact or order.' },
      { icon: 'globe', title: 'In the browser', desc: 'Nothing to install — click and talk.' },
      { icon: 'user', title: 'Context on the call', desc: 'Their history is on screen as it connects.' },
      { icon: 'pen', title: 'Auto-logged', desc: 'Every call recorded on the timeline.' },
    ],
    bands: [
      { tag: 'No friction', title: 'From record to ringing', body: 'Every phone number across Colvy is clickable. See a number, click it, and you’re on the call — with the customer’s history already in view.', bullets: ['Click-to-dial everywhere', 'Caller context on connect', 'Notes saved to the thread'] },
      { tag: 'Built in', title: 'No desk phone required', body: 'Calls run in your browser, so click-to-dial works wherever you work.', bullets: ['Works in the browser', 'No hardware', 'Log every call automatically'] },
    ],
    stats: [{ big: '1-click', label: 'to dial' }, { big: '0', label: 'hardware' }, { big: 'Every', label: 'call logged' }],
    ctaHead: 'Start dialing in one click',
  },
  'browser-dialer': {
    accent: BLUE, eyebrow: 'Browser dialer', name: 'Browser Dialer', title: 'A full dialer in your browser',
    sub: 'Make and take business calls from any tab — no handsets, no softphone install, no IT ticket.',
    heroChips: ['No install', 'Any device', 'HD audio'],
    features: [
      { icon: 'globe', title: 'Runs anywhere', desc: 'Any modern browser, any computer.' },
      { icon: 'phone', title: 'Make & receive', desc: 'Full inbound and outbound calling.' },
      { icon: 'bolt', title: 'Nothing to install', desc: 'Open a tab and you’re ready to call.' },
      { icon: 'user', title: 'Caller context', desc: 'History and orders beside the call.' },
    ],
    bands: [
      { tag: 'Zero setup', title: 'Your phone system is a browser tab', body: 'No desk phones, no PBX hardware, no softphone downloads. The dialer lives in Colvy, right next to your conversations.', bullets: ['No hardware or install', 'Works on any computer', 'Calls logged automatically'] },
      { tag: 'Ready to answer', title: 'Pick up already informed', body: 'Inbound calls ring in the browser with the caller identified and their history on screen.', bullets: ['Screen pop on every ring', 'Full profile in view', 'Notes saved to the thread'] },
    ],
    stats: [{ big: '0', label: 'to install' }, { big: 'Any', label: 'browser' }, { big: 'HD', label: 'audio' }],
    ctaHead: 'Call from your browser',
  },
  'hd-audio': {
    accent: PURPLE, eyebrow: 'HD audio', name: 'HD Audio', title: 'Crystal-clear calls, every time',
    sub: 'High-definition voice so every call sounds professional — no crackle, no dropouts, no “can you hear me?”',
    heroChips: ['HD voice', 'Low latency', 'Reliable'],
    features: [
      { icon: 'bolt', title: 'HD voice', desc: 'Wideband audio for natural, clear calls.' },
      { icon: 'globe', title: 'Low latency', desc: 'Real-time conversation, no lag.' },
      { icon: 'phone', title: 'Reliable carriers', desc: 'Quality routing on every call.' },
      { icon: 'camera', title: 'Clean recordings', desc: 'Clear audio makes transcripts accurate.' },
    ],
    bands: [
      { tag: 'Sound the part', title: 'Every call sounds professional', body: 'Clear, high-definition audio means customers hear you the first time — and your recordings and transcripts come out clean.', bullets: ['Wideband HD voice', 'Stable, low-latency routing', 'Accurate transcripts'] },
      { tag: 'No excuses', title: 'Fewer “can you hear me?” moments', body: 'Reliable call quality keeps conversations flowing instead of stalling on a bad line.', bullets: ['Consistent quality', 'Fewer dropouts', 'Better first impressions'] },
    ],
    stats: [{ big: 'HD', label: 'voice quality' }, { big: 'Low', label: 'latency' }, { big: 'Clear', label: 'recordings' }],
    ctaHead: 'Sound crystal clear',
  },
  'numbers-porting': {
    accent: CYAN, eyebrow: 'Numbers & porting', name: 'Numbers & Porting', title: 'Your numbers, your cities',
    sub: 'Buy a local number in any Australian capital, assign one per location, or bring and port the number you already use.',
    heroChips: ['Local numbers', 'Per location', 'Bring your own'],
    features: [
      { icon: 'pin', title: 'Local numbers', desc: 'A number in any capital — Sydney to Perth.' },
      { icon: 'phone', title: 'Bring & port', desc: 'Move your existing number across.' },
      { icon: 'folder', title: 'Per location', desc: 'Assign a number to each business site.' },
      { icon: 'user', title: 'Your caller ID', desc: 'Ring and dial from the right number.' },
    ],
    bands: [
      { tag: 'Local presence', title: 'A number for every city you serve', body: 'Pick up local numbers across Australia so customers recognise the area code — and assign one to each location.', bullets: ['Local numbers in every capital', 'One per business location', 'Consistent caller ID'] },
      { tag: 'Keep your number', title: 'Port in what you already have', body: 'Already have a number your customers know? Bring it across to Colvy.', bullets: ['Port existing numbers', 'Buy new ones in minutes', 'Manage them in one place'] },
    ],
    stats: [{ big: 'Local', label: 'in every capital' }, { big: 'Port', label: 'your own' }, { big: 'Per', label: 'location' }],
    ctaHead: 'Get your numbers sorted',
  },
  'mobile-app': {
    accent: CORAL, eyebrow: 'Mobile app', name: 'Mobile App', title: 'Take Colvy calls anywhere',
    sub: 'Answer calls and messages on the go — the full inbox and dialer in your pocket, on iOS and Android.',
    heroChips: ['iOS & Android', 'Calls & chats', 'On the go'],
    features: [
      { icon: 'phone', title: 'Calls on mobile', desc: 'Make and take business calls anywhere.' },
      { icon: 'inbox', title: 'The whole inbox', desc: 'Chats, SMS and social in your pocket.' },
      { icon: 'bell', title: 'Push notifications', desc: 'Never miss a call or message.' },
      { icon: 'user', title: 'Full context', desc: 'Customer history on the small screen too.' },
    ],
    bands: [
      { tag: 'Out and about', title: 'Your business line, in your pocket', body: 'Away from the desk? Take calls and reply to customers from your phone, all from your business number — never your personal one.', bullets: ['iOS & Android', 'Business number, not personal', 'Everything syncs back'] },
      { tag: 'Always on', title: 'Never miss what matters', body: 'Push notifications bring calls and messages to you the moment they land.', bullets: ['Instant push alerts', 'Calls, SMS and social', 'Reply in a tap'] },
    ],
    stats: [{ big: 'iOS', label: '& Android' }, { big: 'Full', label: 'inbox on mobile' }, { big: 'Push', label: 'notifications' }],
    ctaHead: 'Put Colvy in your pocket',
  },
  'warm-transfer': {
    accent: GREEN, eyebrow: 'Warm transfer', name: 'Warm Transfer', title: 'Hand off calls the right way',
    sub: 'Brief a colleague before you pass the call across, so the customer never has to repeat themselves.',
    heroChips: ['Brief first', 'Smooth hand-off', 'No repeating'],
    features: [
      { icon: 'user', title: 'Brief before transfer', desc: 'Talk to your colleague first, privately.' },
      { icon: 'phone', title: 'Smooth hand-off', desc: 'Pass the live call across cleanly.' },
      { icon: 'inbox', title: 'Context travels', desc: 'History moves with the conversation.' },
      { icon: 'target', title: 'Right person', desc: 'Send it to whoever should own it.' },
    ],
    bands: [
      { tag: 'No cold hand-offs', title: 'Introduce, then transfer', body: 'Put the caller on hold, brief your teammate on who they are and what they need, then bring them in — a smooth, human hand-off.', bullets: ['Private brief first', 'Warm introduction', 'Customer never repeats themselves'] },
      { tag: 'Context included', title: 'The whole thread comes too', body: 'Whoever picks up sees the full history, so nothing is lost in the transfer.', bullets: ['Full history on hand-off', 'Notes and orders in view', 'Follow-ups stay attached'] },
    ],
    stats: [{ big: 'Warm', label: 'hand-offs' }, { big: '0', label: 'repeating' }, { big: 'Full', label: 'context' }],
    ctaHead: 'Hand off calls smoothly',
  },
  'call-forwarding': {
    accent: BLUE, eyebrow: 'Call forwarding', name: 'Call Forwarding', title: 'Send calls wherever you are',
    sub: 'Forward calls to any number or device, on the rules you set — so a ringing phone always reaches someone.',
    heroChips: ['Any number', 'Rules-based', 'Never missed'],
    features: [
      { icon: 'link', title: 'Forward anywhere', desc: 'To any number, mobile or device.' },
      { icon: 'calendar', title: 'Time-based rules', desc: 'Route by hours, day or on-call.' },
      { icon: 'target', title: 'The right person', desc: 'Send calls to whoever’s available.' },
      { icon: 'globe', title: 'Australian & international', desc: 'Forward locally or overseas.' },
    ],
    bands: [
      { tag: 'Always reachable', title: 'A ringing phone always finds someone', body: 'Forward calls to mobiles, teammates or an after-hours line so customers reach a human instead of a dead end.', bullets: ['Forward to any number', 'Time-based rules', 'Local or international'] },
      { tag: 'On your terms', title: 'Rules that fit your hours', body: 'Route by time of day, day of week or who’s on call — set it once and let it run.', bullets: ['Business-hours routing', 'After-hours fallback', 'On-call schedules'] },
    ],
    stats: [{ big: 'Any', label: 'number or device' }, { big: 'Rules', label: 'you set' }, { big: '24/7', label: 'reachable' }],
    ctaHead: 'Never miss a call',
  },
  'cascade-ring': {
    accent: PURPLE, eyebrow: 'Cascade ring', name: 'Cascade Ring', title: 'Ring the team, in order',
    sub: 'Ring devices and people one after another until someone picks up — so calls never fall through the cracks.',
    heroChips: ['In sequence', 'No missed calls', 'Your order'],
    features: [
      { icon: 'bell', title: 'Ring in sequence', desc: 'One device or person after another.' },
      { icon: 'target', title: 'Your order', desc: 'Set who rings first, second, next.' },
      { icon: 'user', title: 'Team coverage', desc: 'Someone is always next in line.' },
      { icon: 'chat', title: 'Fallback to text', desc: 'Miss it all? Auto-text the caller.' },
    ],
    bands: [
      { tag: 'Catch every call', title: 'Keep ringing until someone answers', body: 'If the first person is busy, the call moves to the next, then the next — down a list you control.', bullets: ['Sequential ring order', 'Configurable per team', 'No call left ringing out'] },
      { tag: 'Safety net', title: 'Nothing slips through', body: 'If nobody picks up, the caller gets an automatic text back so the lead isn’t lost.', bullets: ['Missed-call text-back', 'Voicemail capture', 'Follow-up task created'] },
    ],
    stats: [{ big: 'In order', label: 'ringing' }, { big: 'Team', label: 'coverage' }, { big: '0', label: 'dropped calls' }],
    ctaHead: 'Cover every call',
  },
  'simultaneous-ring': {
    accent: PINK, eyebrow: 'Simultaneous ring', name: 'Simultaneous Ring', title: 'Ring everyone at once',
    sub: 'Ring all your devices and teammates together so the fastest to answer gets the call — first come, first served.',
    heroChips: ['All at once', 'Fastest wins', 'No waiting'],
    features: [
      { icon: 'target', title: 'Ring all at once', desc: 'Every device and user rings together.' },
      { icon: 'bolt', title: 'Fastest answers', desc: 'Whoever’s free picks it up first.' },
      { icon: 'user', title: 'Team-wide', desc: 'Great for small, fast-moving teams.' },
      { icon: 'phone', title: 'Any device', desc: 'Desk, browser or mobile — all ring.' },
    ],
    bands: [
      { tag: 'Fast pickup', title: 'The quickest hand answers', body: 'Ring the whole team at once and let whoever’s available grab the call — ideal when speed to answer matters.', bullets: ['Everyone rings together', 'Fastest to answer wins', 'Fewer missed calls'] },
      { tag: 'Flexible', title: 'Mix it with other rules', body: 'Combine simultaneous ring with forwarding and fallbacks to build the flow your team needs.', bullets: ['Works with forwarding', 'Voicemail fallback', 'Missed-call text-back'] },
    ],
    stats: [{ big: 'All', label: 'ring at once' }, { big: 'Fastest', label: 'answers' }, { big: 'Fewer', label: 'missed calls' }],
    ctaHead: 'Answer faster as a team',
  },
  ivr: {
    accent: CYAN, eyebrow: 'IVR & auto-attendant', name: 'IVR & Auto-Attendant', title: 'Send callers to the right team',
    sub: 'A friendly menu that routes every caller to the right person or department — automatically, day or night.',
    heroChips: ['Press-1 menus', 'Smart routing', 'After hours'],
    features: [
      { icon: 'target', title: 'Menu routing', desc: 'Press 1 for sales, 2 for support…' },
      { icon: 'calendar', title: 'After-hours flows', desc: 'Different routing out of hours.' },
      { icon: 'user', title: 'To the right team', desc: 'Callers reach who can help fastest.' },
      { icon: 'chat', title: 'Fallbacks', desc: 'Voicemail or text-back if all busy.' },
    ],
    bands: [
      { tag: 'First impression', title: 'A tidy front door for your calls', body: 'An auto-attendant greets callers and routes them to the right place, so nobody waits on the wrong line.', bullets: ['Custom greeting & menu', 'Route by choice or number dialled', 'Works 24/7'] },
      { tag: 'Always covered', title: 'Handle after-hours gracefully', body: 'Out of hours, route to an on-call line, take a voicemail, or text the caller back.', bullets: ['After-hours routing', 'Voicemail capture', 'Missed-call text-back'] },
    ],
    stats: [{ big: 'Smart', label: 'routing' }, { big: '24/7', label: 'front door' }, { big: 'Right', label: 'team, every time' }],
    ctaHead: 'Route callers automatically',
  },
  'ai-call-intelligence': {
    accent: PURPLE, eyebrow: 'AI call intelligence', name: 'AI Call Intelligence', title: 'Know the caller before you answer',
    sub: 'The moment the phone rings, AI surfaces who’s calling, why they might be calling, and their full history — so every call starts informed.',
    heroChips: ['Caller context', 'AI summaries', 'On every ring'],
    features: [
      { icon: 'user', title: 'Caller context', desc: 'Who they are and their history, instantly.' },
      { icon: 'ai', title: 'AI summaries', desc: 'A tidy write-up after every call.' },
      { icon: 'camera', title: 'Transcribed', desc: 'Searchable transcripts of every call.' },
      { icon: 'bell', title: 'Follow-ups', desc: 'Next steps captured automatically.' },
    ],
    bands: [
      { tag: 'Context first', title: 'Pick up already informed', body: 'Every call rings with the caller identified and their past chats, orders and notes on screen — no more cold pickups.', bullets: ['Screen pop with history', 'Orders and notes in view', 'Ready before you say hello'] },
      { tag: 'After the call', title: 'Written up for you', body: 'Recording, transcript and an AI summary attach to the thread automatically, with follow-up tasks created.', bullets: ['Auto recording & transcript', 'AI summary on the thread', 'Follow-up tasks created'] },
    ],
    stats: [{ big: 'Every', label: 'call, in context' }, { big: 'AI', label: 'summaries' }, { big: 'Searchable', label: 'transcripts' }],
    ctaHead: 'Answer every call informed',
  },
  'ai-actions': {
    accent: CORAL, eyebrow: 'AI actions', name: 'AI Actions', title: 'The call ends, the work is done',
    sub: 'After a call, AI drafts the follow-up, creates tasks and updates the contact — so the admin doesn’t pile up.',
    heroChips: ['Auto-tasks', 'Contact updates', 'You approve'],
    features: [
      { icon: 'bolt', title: 'Auto-tasks', desc: 'Turn call outcomes into to-dos.' },
      { icon: 'user', title: 'Contact updates', desc: 'Keep records current, hands-free.' },
      { icon: 'ai', title: 'Drafted follow-ups', desc: 'A ready reply, waiting for your OK.' },
      { icon: 'lock', title: 'You’re in control', desc: 'Every action is yours to approve.' },
    ],
    bands: [
      { tag: 'Less admin', title: 'Wrap-up work, handled', body: 'The assistant turns what happened on the call into tasks, contact updates and a drafted follow-up — so the post-call admin doesn’t stack up.', bullets: ['Tasks from call outcomes', 'Contact fields updated', 'Follow-up drafted for you'] },
      { tag: 'In control', title: 'AI proposes, you decide', body: 'Actions are suggestions you approve, and every one is logged.', bullets: ['Human-in-the-loop', 'Only the actions you enable', 'Full audit trail'] },
    ],
    stats: [{ big: 'Auto', label: 'follow-ups' }, { big: 'Less', label: 'admin' }, { big: 'Every', label: 'action audited' }],
    ctaHead: 'Let AI do the wrap-up',
  },
  'call-recording': {
    accent: GREEN, eyebrow: 'Call recording', name: 'Call Recording', title: 'Record, transcribe, summarise',
    sub: 'Every call captured, transcribed and summarised on the thread — for quality, training and never forgetting a detail.',
    heroChips: ['Recorded', 'Transcribed', 'Summarised'],
    features: [
      { icon: 'camera', title: 'Recorded', desc: 'Every call captured automatically.' },
      { icon: 'pen', title: 'Transcribed', desc: 'A searchable transcript of each call.' },
      { icon: 'ai', title: 'AI summary', desc: 'The gist in a line, on the thread.' },
      { icon: 'search', title: 'Searchable', desc: 'Find any call by what was said.' },
    ],
    bands: [
      { tag: 'Never forget', title: 'The whole call, on the record', body: 'Recordings and transcripts attach to the conversation, so details are never lost and anyone can catch up.', bullets: ['Automatic recording', 'Full transcript', 'AI summary attached'] },
      { tag: 'Quality & training', title: 'Coach with real calls', body: 'Review real conversations to train the team and keep quality high — you control recording and access.', bullets: ['Review & coach', 'Access controls', 'Searchable archive'] },
    ],
    stats: [{ big: 'Every', label: 'call recorded' }, { big: 'Full', label: 'transcripts' }, { big: 'AI', label: 'summaries' }],
    ctaHead: 'Capture every call',
  },
  'call-reporting': {
    accent: BLUE, eyebrow: 'Call reporting', name: 'Call Reporting', title: 'See what your calls are doing',
    sub: 'Dashboards and analytics on call volume, response times and outcomes — so you can staff and coach with data.',
    heroChips: ['Dashboards', 'Response times', 'Outcomes'],
    features: [
      { icon: 'chart', title: 'Call analytics', desc: 'Volume, duration and trends at a glance.' },
      { icon: 'bell', title: 'Missed & answered', desc: 'See what you caught and what you missed.' },
      { icon: 'user', title: 'By person & team', desc: 'Understand who’s handling what.' },
      { icon: 'calendar', title: 'Over time', desc: 'Spot busy periods and staff for them.' },
    ],
    bands: [
      { tag: 'Know the numbers', title: 'Your calls, in a dashboard', body: 'See volume, answer rates and response times so you can staff the busy hours and fix the slow ones.', bullets: ['Volume & answer rates', 'Response-time trends', 'Per-person breakdowns'] },
      { tag: 'Coach with data', title: 'Turn insight into action', body: 'Spot patterns, set targets and coach the team with real numbers instead of hunches.', bullets: ['Missed-call trends', 'Busy-period insights', 'Team performance'] },
    ],
    stats: [{ big: 'Live', label: 'dashboards' }, { big: 'Per', label: 'person & team' }, { big: 'Trends', label: 'over time' }],
    ctaHead: 'Report on every call',
  },
  'missed-call-text-back': {
    accent: GREEN, eyebrow: 'Missed-call text-back', name: 'Missed Call Text Back', title: 'Miss a call, keep the lead',
    sub: 'When you can’t pick up, Colvy auto-texts the caller so the conversation continues instead of going cold.',
    heroChips: ['Auto-SMS', 'No lost leads', 'Instant'],
    features: [
      { icon: 'chat', title: 'Instant auto-SMS', desc: 'The caller hears back straight away.' },
      { icon: 'inbox', title: 'Continues in the inbox', desc: 'Their reply lands in the shared thread.' },
      { icon: 'pen', title: 'Your message', desc: 'On-brand text, sent for you.' },
      { icon: 'ai', title: 'AI can reply', desc: 'The assistant can answer the follow-up.' },
    ],
    bands: [
      { tag: 'No lost leads', title: 'A missed call isn’t a lost customer', body: 'The moment a call goes unanswered, the caller gets a friendly text — and the conversation carries on by SMS.', bullets: ['Instant auto-text', 'Reply lands in the inbox', 'Nothing goes cold'] },
      { tag: 'Keep talking', title: 'Turn the miss into a chat', body: 'From there it’s a normal conversation — answer by text, with AI drafting where it helps.', bullets: ['Two-way SMS', 'AI-drafted replies', 'Full history retained'] },
    ],
    stats: [{ big: 'Instant', label: 'text-back' }, { big: '0', label: 'lost leads' }, { big: '1', label: 'shared thread' }],
    ctaHead: 'Never lose a missed call',
  },
  voicemail: {
    accent: PURPLE, eyebrow: 'Voicemail', name: 'Voicemail', title: 'Voicemail that reads itself',
    sub: 'Voicemails transcribed, summarised and dropped into the inbox — read them in seconds instead of dialling in.',
    heroChips: ['Transcribed', 'Summarised', 'In the inbox'],
    features: [
      { icon: 'inbox', title: 'In the inbox', desc: 'Voicemails land beside every channel.' },
      { icon: 'pen', title: 'Transcribed', desc: 'Read the message, don’t dial in.' },
      { icon: 'ai', title: 'Summarised', desc: 'The point of the message, up top.' },
      { icon: 'bell', title: 'Follow-ups', desc: 'Turn a voicemail into a task.' },
    ],
    bands: [
      { tag: 'Read, don’t dial', title: 'Voicemail you can skim', body: 'Every voicemail is transcribed and summarised and dropped into the thread, so you triage them like messages.', bullets: ['Automatic transcription', 'AI summary', 'Right in the inbox'] },
      { tag: 'Never lost', title: 'Attached to the customer', body: 'Voicemails sit on the customer’s timeline with everything else, and can become follow-up tasks in a tap.', bullets: ['On the customer timeline', 'Searchable', 'One-tap follow-up'] },
    ],
    stats: [{ big: 'Read', label: 'not dialled' }, { big: 'AI', label: 'summaries' }, { big: '1', label: 'inbox' }],
    ctaHead: 'Modernise your voicemail',
  },
  voip: {
    accent: CYAN, eyebrow: 'VoIP phone system', name: 'VoIP Phone System', title: 'A phone system, built in',
    sub: 'Enterprise-grade cloud calling inside your inbox — no PBX, no hardware, no separate phone vendor.',
    heroChips: ['Cloud PBX', 'No hardware', 'One platform'],
    features: [
      { icon: 'phone', title: 'Cloud calling', desc: 'A complete phone system in the cloud.' },
      { icon: 'target', title: 'Routing & menus', desc: 'IVR, forwarding and ring rules built in.' },
      { icon: 'inbox', title: 'In your inbox', desc: 'Calls beside chats, SMS and email.' },
      { icon: 'chart', title: 'Managed in one place', desc: 'Numbers, users and reports together.' },
    ],
    bands: [
      { tag: 'One less vendor', title: 'Retire the old phone system', body: 'Everything a PBX does — numbers, routing, recording, reporting — lives inside Colvy, next to your conversations.', bullets: ['No PBX or hardware', 'Numbers, routing & recording', 'One bill, one platform'] },
      { tag: 'Scales with you', title: 'Add a line in minutes', body: 'Spin up numbers and users as you grow, without waiting on a telco.', bullets: ['Instant provisioning', 'Per-location numbers', 'Grow without hardware'] },
    ],
    stats: [{ big: '0', label: 'hardware' }, { big: '1', label: 'platform' }, { big: 'Cloud', label: 'PBX' }],
    ctaHead: 'Replace your phone system',
  },
  international: {
    accent: BLUE, eyebrow: 'International calling', name: 'International Calling', title: 'Call the world, affordably',
    sub: 'Reach customers in 100+ countries at competitive rates — all from the same browser dialer.',
    heroChips: ['100+ countries', 'Great rates', 'One dialer'],
    features: [
      { icon: 'globe', title: '100+ countries', desc: 'Dial almost anywhere in the world.' },
      { icon: 'tag', title: 'Competitive rates', desc: 'Fair per-minute pricing.' },
      { icon: 'phone', title: 'Same dialer', desc: 'No separate tool for overseas calls.' },
      { icon: 'user', title: 'Context included', desc: 'History travels with every call.' },
    ],
    bands: [
      { tag: 'Go global', title: 'Overseas customers, one dialer', body: 'Call internationally from the same browser dialer you use for local calls — with the customer’s history right there.', bullets: ['100+ countries', 'Competitive per-minute rates', 'Calls logged and summarised'] },
      { tag: 'No surprises', title: 'Clear, fair pricing', body: 'Transparent rates so international calling doesn’t become a nasty line on the bill.', bullets: ['Transparent rates', 'Usage in your reports', 'No hidden fees'] },
    ],
    stats: [{ big: '100+', label: 'countries' }, { big: 'Fair', label: 'rates' }, { big: '1', label: 'dialer' }],
    ctaHead: 'Call anywhere',
  },
  'command-centre': {
    accent: CORAL, eyebrow: 'Command centre', name: 'Command Centre', title: 'Every call, on one screen',
    sub: 'A live dashboard of calls in progress, queues and team status — with AI voice agents you can watch in real time.',
    heroChips: ['Live dashboard', 'Queues', 'AI voice agents'],
    features: [
      { icon: 'kanban', title: 'Live view', desc: 'Calls in progress and waiting, at a glance.' },
      { icon: 'user', title: 'Team status', desc: 'See who’s on a call and who’s free.' },
      { icon: 'ai', title: 'AI voice agents', desc: 'Watch AI handle calls in real time.' },
      { icon: 'target', title: 'Jump in', desc: 'Route, assign or take over instantly.' },
    ],
    bands: [
      { tag: 'Total visibility', title: 'Run the phones from one screen', body: 'See every live call, the queue and who’s available — and step in the moment something needs a hand.', bullets: ['Live calls & queues', 'Team availability', 'Route or take over'] },
      { tag: 'AI on the floor', title: 'Watch AI agents work', body: 'AI voice agents handle routine calls while you monitor and jump in whenever you like.', bullets: ['AI voice agents', 'Real-time monitoring', 'Human takeover anytime'] },
    ],
    stats: [{ big: 'Live', label: 'call dashboard' }, { big: 'Real-time', label: 'team status' }, { big: 'AI', label: 'voice agents' }],
    ctaHead: 'Take command of your calls',
  },
}

// All phone features — used for the "more" strip.
const ALL = Object.entries(PH).map(([slug, f]) => ({ slug, name: f.name }))

function useReveal(threshold = 0.14) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 28 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

export default function PhoneFeaturePage() {
  const params = useParams()
  const slug = (params?.slug as string) || 'click-to-dial'
  const f = PH[slug] || PH['click-to-dial']
  const accent = f.accent
  const [dark, setDark] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    return () => { l?.subscription?.unsubscribe() }
  }, [])

  const go = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try {
      const hostname = window.location.hostname
      if (hostname.includes('localhost') || hostname.includes('vercel.app')) { window.location.href = '/admin'; return }
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (co?.slug) { window.location.href = boardUrl(co.slug, '/admin'); return }
      await redirectToUserAdmin(user.id)
    } catch { await redirectToUserAdmin(user.id) }
  }

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: accent, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${accent}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes pfFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .pf-card,.pf-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .pf-card:hover{ transform:translateY(-6px); }
        .pf-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .pf-hero{ grid-template-columns:1fr !important; } .pf-band{ grid-template-columns:1fr !important; } .pf-hero-cta{ flex-wrap:nowrap !important; } .pf-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="pfFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="pf-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 60px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <a href="/phones" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: accent, textDecoration: 'none', marginBottom: 14 }}>← Phones</a>
            <div style={{ marginBottom: 8 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: accent + '18', color: accent, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}><FeatureIcon name={f.features[0].icon} color={accent} size={15} />{f.eyebrow}</span></div>
            <h1 style={{ fontSize: 'clamp(36px, 5.2vw, 60px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 18px' }}>{f.title}</h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>{f.sub}</p>
            <div className="pf-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="pf-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="pf-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${accent} 0%, ${accent}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${accent}44` }}>
            <img src={`/phones/${slug}.jpg`} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${accent}e6 0%, ${accent}59 42%, rgba(10,12,20,0.5) 115%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'pfFloat 6s ease-in-out infinite' }}><FeatureIcon name={f.features[0].icon} color="rgba(255,255,255,0.95)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {f.heroChips.map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '9px 16px', animation: `pfFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FEATURE GRID */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
          {f.features.map((ft, i) => (
            <Reveal key={ft.title} delay={(i % 4) * 0.05}>
              <div className="pf-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: accent + '16', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={ft.icon} color={accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{ft.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{ft.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BANDS */}
      {f.bands.map((b, i) => (
        <section key={b.title} style={{ background: i % 2 ? (dark ? 'rgba(255,255,255,0.02)' : accent + '08') : 'transparent', padding: 'clamp(40px, 6vw, 80px) 24px' }}>
          <div className="pf-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: i % 2 ? 'rtl' : 'ltr' }}>
            <div style={{ direction: 'ltr' }}>
              <Reveal>
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: accent }}>{b.tag}</span>
                <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>{b.title}</h2>
                <p style={{ fontSize: 16.5, lineHeight: 1.65, color: muted, margin: '0 0 20px' }}>{b.body}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {b.bullets.map(bl => (
                    <li key={bl} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, fontWeight: 600, color: text }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: accent + '1a', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{bl}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <div style={{ direction: 'ltr' }}>
              <Reveal delay={0.1}>
                <div style={{ position: 'relative', borderRadius: 24, minHeight: 280, overflow: 'hidden', background: `linear-gradient(140deg, ${accent}22, ${accent}05)`, border: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '32px 32px', opacity: 0.5 }} />
                  <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${accent}55`, animation: 'pfFloat 6s ease-in-out infinite' }}>
                    <FeatureIcon name={f.features[Math.min(i + 1, f.features.length - 1)].icon} color="#fff" size={44} />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      {/* MORE PHONE FEATURES */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 20px', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>More in <span style={{ color: accent }}>Phones</span></h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 22px', lineHeight: 1.55 }}>One phone system, every feature — explore the rest.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {ALL.filter(a => a.slug !== slug).map(a => (
              <a key={a.slug} href={`/phones/${a.slug}`} style={{ fontSize: 13.5, fontWeight: 700, color: text, background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 999, padding: '8px 16px', textDecoration: 'none' }}>{a.name}</a>
            ))}
          </div>
        </Reveal>
      </section>

      {/* STATS */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {f.stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 900, letterSpacing: '-0.03em', color: accent }}>{s.big}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${accent}, ${BLUE} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>{f.ctaHead}</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Start free, set up in about 45 minutes — no credit card, cancel anytime.</p>
            <button onClick={go} className="pf-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
