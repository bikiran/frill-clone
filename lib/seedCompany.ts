import { createClient } from '@supabase/supabase-js'

// Creates sample data for a new company so their dashboard feels alive
export async function seedCompanyData(companyId: string, companyName: string) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  ) as any

  try {
    // ── 1. Statuses ────────────────────────────────────────────────
    const { data: statuses } = await db.from('statuses').insert([
      { company_id: companyId, name: 'Under Review',   color: '#f59e0b', emoji: '🔍', order: 1 },
      { company_id: companyId, name: 'Planned',        color: '#6366f1', emoji: '📋', order: 2 },
      { company_id: companyId, name: 'In Progress',    color: '#3b82f6', emoji: '🚀', order: 3 },
      { company_id: companyId, name: 'Shipped',        color: '#10b981', emoji: '✅', order: 4 },
      { company_id: companyId, name: 'Won\'t Do',      color: '#6b7280', emoji: '🚫', order: 5 },
    ]).select()

    // ── 2. Topics ──────────────────────────────────────────────────
    const { data: topics } = await db.from('topics').insert([
      { company_id: companyId, name: 'Feature Request', emoji: '✨', color: '#6366f1' },
      { company_id: companyId, name: 'Bug Report',      emoji: '🐛', color: '#ef4444' },
      { company_id: companyId, name: 'Improvement',     emoji: '📈', color: '#10b981' },
      { company_id: companyId, name: 'Question',        emoji: '❓', color: '#f59e0b' },
    ]).select()

    const topicIds = topics?.map((t: any) => t.id) || []

    // ── 3. Ideas ───────────────────────────────────────────────────
    const sampleIdeas = [
      { title: 'Dark mode support', description: 'Add a dark theme option for users who prefer it at night. This would reduce eye strain and save battery on OLED screens.', votes: 47, status: 'planned', impact: 4, effort: 2, confidence: 4, reach: 5 },
      { title: 'Mobile app', description: 'A native iOS and Android app would make it much easier to use on the go. Push notifications for updates would be a big plus.', votes: 38, status: 'under_review', impact: 5, effort: 5, confidence: 3, reach: 5 },
      { title: 'Export to CSV', description: 'Allow users to export their data to CSV format for analysis in Excel or Google Sheets.', votes: 29, status: 'in_progress', impact: 3, effort: 1, confidence: 5, reach: 4 },
      { title: 'Slack integration', description: 'Connect with Slack to get real-time notifications when new ideas are submitted or votes are cast.', votes: 24, status: 'shipped', impact: 4, effort: 2, confidence: 5, reach: 4 },
      { title: 'Custom branding options', description: 'Let us customise the board with our own logo, colours and fonts to match our brand.', votes: 19, status: 'planned', impact: 3, effort: 3, confidence: 4, reach: 3 },
      { title: 'API access', description: 'A public REST API would allow us to integrate your platform with our existing tools and workflows.', votes: 15, status: 'under_review', impact: 4, effort: 4, confidence: 3, reach: 3 },
      { title: 'Email digest', description: 'Weekly email summary of top ideas, new votes, and status changes so we stay informed without logging in every day.', votes: 12, status: 'under_review', impact: 3, effort: 2, confidence: 4, reach: 4 },
      { title: 'Keyboard shortcuts', description: 'Power users would love keyboard shortcuts for common actions like submitting ideas and navigating the board.', votes: 8, status: 'under_review', impact: 2, effort: 1, confidence: 5, reach: 2 },
    ]

    const ideasToInsert = sampleIdeas.map((idea, i) => ({
      ...idea,
      company_id: companyId,
      created_by_name: 'Sample User',
      topic_id: topicIds[i % topicIds.length] || null,
      likes: Math.floor(idea.votes * 0.3),
    }))

    const { data: ideas } = await db.from('ideas').insert(ideasToInsert).select()

    // ── 4. Announcements ───────────────────────────────────────────
    await db.from('announcements').insert([
      {
        company_id: companyId,
        title: `Welcome to ${companyName} Feedback! 🎉`,
        description: `We've just launched our public feedback board powered by Colvy.\n\nThis is where you can:\n• Submit ideas and feature requests\n• Vote on what matters most to you\n• Track progress on our roadmap\n• Stay updated with our latest announcements\n\nWe read every single submission. Your feedback directly shapes what we build next. Thank you for being part of our journey!`,
        tag: 'Update',
        status: 'published',
        likes: 12,
      },
      {
        company_id: companyId,
        title: 'CSV Export is now live ✅',
        description: `Based on your feedback, we've shipped CSV export!\n\nYou can now download all your data directly from the dashboard. Head to Settings → Export to try it out.\n\nThis was our #3 most requested feature — thank you to everyone who voted and left comments. You made this happen.`,
        tag: 'Feature',
        status: 'published',
        likes: 8,
      },
      {
        company_id: companyId,
        title: 'Dark mode — now in progress 🌙',
        description: `Great news for all the dark mode fans — we've started building it!\n\nBased on the 47 votes and countless comments, dark mode is officially in progress. We're aiming to ship it in the next 2 weeks.\n\nFollow this announcement to get notified when it's live.`,
        tag: 'Update',
        status: 'published',
        likes: 5,
      },
    ])

    // ── 5. Help Articles ───────────────────────────────────────────
    await db.from('help_articles').insert([
      {
        company_id: companyId,
        title: `Getting started with ${companyName}`,
        content: `# Welcome to ${companyName}\n\nThis guide will help you get up and running quickly.\n\n## Step 1: Create your account\n\nSign up with your email address or continue with Google.\n\n## Step 2: Explore the board\n\nBrowse existing ideas and vote on the ones that matter to you.\n\n## Step 3: Submit your first idea\n\nClick "Share an Idea" and describe what you'd like to see built.\n\n## Step 4: Follow the roadmap\n\nCheck our roadmap to see what's planned, in progress, and shipped.`,
        category: 'Getting Started', status: 'published', featured: true, views: 142, likes: 28, media: [],
      },
      {
        company_id: companyId,
        title: 'How to submit an idea',
        content: `# How to submit an idea\n\n## Writing a great idea\n\nThe best ideas are clear and specific. Instead of "make it faster", try "reduce page load time on the dashboard to under 2 seconds".\n\n## Adding details\n\nDescribe the problem you're trying to solve, not just the solution. This helps us understand the context.\n\n## Voting\n\nUpvote ideas you agree with. The most voted ideas get prioritised on our roadmap.\n\n## Comments\n\nLeave a comment to share your specific use case — this helps us build the right solution.`,
        category: 'Features', status: 'published', featured: true, views: 98, likes: 19, media: [],
      },
      {
        company_id: companyId,
        title: 'Understanding the roadmap',
        content: `# Understanding the roadmap\n\nOur roadmap gives you visibility into what we're working on.\n\n## Statuses\n\n- 🔍 **Under Review** — We're evaluating this idea\n- 📋 **Planned** — Confirmed, coming soon\n- 🚀 **In Progress** — Currently being built\n- ✅ **Shipped** — Live and available\n- 🚫 **Won't Do** — Not in our plans\n\n## How ideas get on the roadmap\n\nIdeas with high votes and strong community support get prioritised. Keep voting!`,
        category: 'Features', status: 'published', featured: false, views: 76, likes: 12, media: [],
      },
      {
        company_id: companyId,
        title: 'Notifications and updates',
        content: `# Staying updated\n\n## Following announcements\n\nSubscribe to announcements to get emailed when we ship new features or post updates.\n\n## Idea notifications\n\nWhen you vote on an idea, you'll automatically get notified when its status changes.\n\n## Email preferences\n\nManage your notification preferences from your account settings. You can choose to receive instant, daily, or weekly digests.`,
        category: 'Features', status: 'published', featured: false, views: 54, likes: 9, media: [],
      },
      {
        company_id: companyId,
        title: 'Privacy and data',
        content: `# Privacy and your data\n\n## What we collect\n\nWe collect your email address and the feedback you submit. That's it.\n\n## How we use it\n\nYour data is used solely to improve our product and communicate with you about your submissions.\n\n## Deleting your account\n\nYou can delete your account and all associated data at any time from Account Settings → Danger Zone.\n\n## Questions?\n\nContact us at support@${companyName.toLowerCase().replace(/\s/g, '')}.com`,
        category: 'Troubleshooting', status: 'published', featured: false, views: 45, likes: 7, media: [],
      },
    ])

    // ── 6. A sample poll ───────────────────────────────────────────
    try {
      await db.from('polls').insert({
        company_id: companyId,
        title: 'What should we build next?',
        description: 'Help us prioritise our roadmap by voting on what matters most to you.',
        status: 'active',
        options: JSON.stringify([
          { id: '1', text: 'Mobile app', votes: 24 },
          { id: '2', text: 'Dark mode', votes: 18 },
          { id: '3', text: 'API access', votes: 12 },
          { id: '4', text: 'More integrations', votes: 9 },
        ]),
      })
    } catch {} // polls table might not exist

    console.log(`✓ Seeded company ${companyId} with sample data`)
    return { success: true }
  } catch (err: any) {
    console.error('Seed error:', err.message)
    return { success: false, error: err.message }
  }
}
