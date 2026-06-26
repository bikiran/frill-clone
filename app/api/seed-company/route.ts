import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { companyId, companyName, clearFirst } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    }) as any

    const n = companyName || 'Your Company'
    const errors: string[] = []
    const done: string[] = []

    // Always clear first for reliability
    if (clearFirst) {
      await db.from('ideas').delete().eq('company_id', companyId)
      await db.from('announcements').delete().eq('company_id', companyId)
      await db.from('help_articles').delete().eq('company_id', companyId)
      await db.from('statuses').delete().eq('company_id', companyId)
      await db.from('topics').delete().eq('company_id', companyId)
    } else {
      // Check if already seeded
      const { count } = await db.from('ideas').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
      if ((count || 0) > 0) {
        return NextResponse.json({ success: true, skipped: true, existing: count })
      }
    }

    // STATUSES
    const { error: se } = await db.from('statuses').insert([
      { company_id: companyId, name: 'Under consideration', color: '#f97316', order_index: 1 },
      { company_id: companyId, name: 'Planned',             color: '#3b82f6', order_index: 2 },
      { company_id: companyId, name: 'In Development',      color: '#ea580c', order_index: 3 },
      { company_id: companyId, name: 'Shipped',             color: '#10b981', order_index: 4 },
    ])
    se ? errors.push(`statuses: ${se.message}`) : done.push('statuses')

    // TOPICS
    const { data: topics, error: te } = await db.from('topics').insert([
      { company_id: companyId, name: 'improvement',  emoji: '📈', color: '#10b981' },
      { company_id: companyId, name: 'misc',         emoji: '📌', color: '#6b7280' },
      { company_id: companyId, name: 'welcome',      emoji: '👋', color: '#6366f1' },
      { company_id: companyId, name: 'bug',          emoji: '🐛', color: '#ef4444' },
      { company_id: companyId, name: 'integrations', emoji: '🔗', color: '#f59e0b' },
    ]).select()
    te ? errors.push(`topics: ${te.message}`) : done.push('topics')

    const tIds: Record<string, string> = {}
    ;(topics || []).forEach((t: any) => { tIds[t.name] = t.id })

    // IDEAS
    const { error: ie } = await db.from('ideas').insert([
      {
        company_id: companyId, votes: 14, likes: 3, status: 'in_progress',
        topic_id: tIds['improvement'] || null, created_by_name: 'User',
        title: '[Example Idea] Priority scoring',
        description: 'Automatically calculate priority scores based on votes, effort, and impact to help prioritize the roadmap.',
      },
      {
        company_id: companyId, votes: 6, likes: 2, status: 'new',
        topic_id: tIds['improvement'] || null, created_by_name: 'User',
        title: '[Example Idea] Dark mode support',
        description: 'It would be great to have dark mode. Perhaps add an option to switch between light and dark themes. Maybe also add automatic dark mode based on system settings.',
      },
      {
        company_id: companyId, votes: 4, likes: 1, status: 'shipped',
        topic_id: tIds['improvement'] || null, created_by_name: 'User',
        title: '[Example Idea] Mobile app',
        description: 'Build native iOS and Android apps so customers can vote and view ideas on the go.',
      },
      {
        company_id: companyId, votes: 1, likes: 0, status: 'planned',
        topic_id: tIds['welcome'] || null, created_by_name: 'Team',
        title: `Welcome to ${n}! 👋`,
        description: `We're excited to hear your ideas. Share your suggestions and vote on what matters most to you.`,
      },
      // Extra ideas to fill all roadmap columns
      {
        company_id: companyId, votes: 3, likes: 1, status: 'new',
        topic_id: tIds['improvement'] || null, created_by_name: 'User',
        title: 'Keyboard shortcuts',
        description: 'Power users would love keyboard shortcuts for common actions like submitting ideas and navigating.',
      },
      {
        company_id: companyId, votes: 2, likes: 0, status: 'new',
        topic_id: tIds['bug'] || null, created_by_name: 'User',
        title: 'Fix slow load on mobile',
        description: 'The dashboard takes too long to load on mobile. Would love to see performance improvements.',
      },
      {
        company_id: companyId, votes: 5, likes: 2, status: 'planned',
        topic_id: tIds['integrations'] || null, created_by_name: 'User',
        title: 'Zapier integration',
        description: 'A Zapier integration would let us connect to hundreds of other tools automatically.',
      },
      {
        company_id: companyId, votes: 8, likes: 2, status: 'shipped',
        topic_id: tIds['improvement'] || null, created_by_name: 'User',
        title: '[Example Idea] Slack notifications',
        description: 'Get notified in Slack when new ideas are submitted or statuses change.',
      },
      {
        company_id: companyId, votes: 2, likes: 0, status: 'shipped',
        topic_id: tIds['improvement'] || null, created_by_name: 'User',
        title: 'CSV data export',
        description: 'Export all your ideas and votes to a CSV file for analysis.',
      },
    ])
    ie ? errors.push(`ideas: ${ie.message}`) : done.push('ideas')

    // ANNOUNCEMENTS  
    const { error: ae } = await db.from('announcements').insert([
      {
        company_id: companyId, status: 'published', likes: 1, views: 71, impressions: 63,
        title: 'Facebook login now here', tag: 'new_feature',
        description: 'You can now sign in with Facebook. Head to your account settings to connect.',
      },
      {
        company_id: companyId, status: 'published', likes: 3, views: 45, impressions: 312,
        title: 'New Dashboard Released', tag: 'improvement',
        description: `We've completely redesigned the dashboard.\n\nKey improvements:\n• Faster load times\n• Cleaner layout\n• Better mobile experience`,
      },
      {
        company_id: companyId, status: 'published', likes: 5, views: 120, impressions: 890, is_pinned: true,
        title: `Hello World! We're Using ${n} 🚀`, tag: 'new_feature',
        description: `Welcome to our feedback board!\n\nThis is where you can:\n• Submit ideas and feature requests\n• Vote on what matters most\n• Track our roadmap\n• Stay updated with announcements`,
      },
    ])
    ae ? errors.push(`announcements: ${ae.message}`) : done.push('announcements')

    // HELP ARTICLES
    const { error: he } = await db.from('help_articles').insert([
      {
        company_id: companyId, category: 'Getting Started', status: 'published', featured: true, views: 144, likes: 28, media: [],
        title: `Getting started with ${n}`,
        content: `# Getting started with ${n}\n\nWelcome to ${n}! This guide will help you set up your feedback board in minutes.\n\n## Step 1: Create your account\n\nSign up with your email address or continue with Google.\n\n## Step 2: Explore the board\n\nBrowse existing ideas and vote on the ones that matter to you.\n\n## Step 3: Submit your first idea\n\nClick "Share an Idea" and describe what you'd like to see built.\n\n## Step 4: Follow the roadmap\n\nCheck our roadmap to see what's planned, in progress, and shipped.`,
      },
      {
        company_id: companyId, category: 'Features', status: 'published', featured: true, views: 98, likes: 19, media: [],
        title: 'How to create and manage ideas',
        content: `# How to create and manage ideas\n\nIdeas are the core of ${n}. Here's how to manage them effectively.\n\n## Creating ideas\n\nClick "Share an Idea" on your board. Customers can also submit ideas directly.\n\n## Voting\n\nUsers can upvote ideas they care about. The most voted rise to the top.\n\n## Status management\n\nUpdate idea status: Under Review → Planned → In Development → Shipped.`,
      },
      {
        company_id: companyId, category: 'Integrations', status: 'published', featured: true, views: 203, likes: 41, media: [],
        title: `Embedding the ${n} widget`,
        content: `# Embedding the ${n} widget\n\nAdd ${n} to your app with a simple script snippet.\n\n## Installation\n\nPaste this code before the closing </body> tag:\n\n\`\`\`html\n<script src="https://widget.colvy.com/embed.js"></script>\n<script>\n  window.ColvyConfig = { slug: 'yourslug' }\n</script>\n\`\`\``,
      },
      {
        company_id: companyId, category: 'Features', status: 'published', featured: false, views: 76, likes: 12, media: [],
        title: 'Setting up your public roadmap',
        content: `# Setting up your public roadmap\n\nThe roadmap gives customers visibility into your product direction.\n\n## Statuses\n\n- **Under consideration** — Evaluating this idea\n- **Planned** — Confirmed, coming soon\n- **In Development** — Currently being built\n- **Shipped** — Live and available`,
      },
      {
        company_id: companyId, category: 'Features', status: 'published', featured: false, views: 54, likes: 9, media: [],
        title: 'Publishing announcements',
        content: `# Publishing announcements\n\nKeep customers updated with your changelog.\n\n## Creating an announcement\n\nGo to Admin → Announcements → New Announcement.\n\n## Subscribers\n\nUsers who subscribe get emailed when you publish.`,
      },
      {
        company_id: companyId, category: 'Integrations', status: 'published', featured: false, views: 67, likes: 11, media: [],
        title: 'Connecting Slack',
        content: `# Connecting Slack\n\nGet notified in Slack when new ideas are submitted.\n\n## Setup\n\n1. Go to Admin → Integrations → Slack\n2. Click "Connect Slack"\n3. Choose your workspace and channel\n4. Select which events to post`,
      },
      {
        company_id: companyId, category: 'Troubleshooting', status: 'published', featured: false, views: 89, likes: 14, media: [],
        title: "Why can't users vote?",
        content: `# Why can't users vote?\n\n## Guest voting disabled\n\nGo to Admin → Settings → Privacy and enable "Allow guest voting".\n\n## Already voted\n\nUsers can only vote once per idea. Click again to unvote.`,
      },
      {
        company_id: companyId, category: 'API', status: 'published', featured: false, views: 123, likes: 22, media: [],
        title: 'REST API overview',
        content: `# REST API overview\n\n## Authentication\n\n\`\`\`\nAuthorization: Bearer YOUR_API_KEY\n\`\`\`\n\n## Endpoints\n\n- GET /api/v1/ideas — List all ideas\n- POST /api/v1/ideas — Create an idea\n- GET /api/v1/announcements — List announcements`,
      },
      {
        company_id: companyId, category: 'Billing', status: 'published', featured: false, views: 46, likes: 7, media: [],
        title: 'Understanding your subscription',
        content: `# Understanding your subscription\n\n## Free plan\n\nUp to 5 team members, unlimited ideas, basic analytics.\n\n## Pro plan\n\nUnlimited team members, white labeling, API access, custom domains.\n\n## Changing plans\n\nGo to Admin → Billing to upgrade or downgrade.`,
      },
    ])
    he ? errors.push(`help_articles: ${he.message}`) : done.push(`help_articles`)

    return NextResponse.json({
      success: errors.length === 0,
      done,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
