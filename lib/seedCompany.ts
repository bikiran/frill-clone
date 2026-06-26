import { createClient } from '@supabase/supabase-js'

export async function seedCompanyData(companyId: string, companyName: string) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  ) as any

  const n = companyName || 'Your Company'

  try {
    // ── 1. STATUSES ────────────────────────────────────────────────
    await db.from('statuses').insert([
      { company_id: companyId, name: 'Under Review',  color: '#f59e0b', emoji: '🔍', order_index: 1 },
      { company_id: companyId, name: 'Planned',       color: '#6366f1', emoji: '📋', order_index: 2 },
      { company_id: companyId, name: 'In Progress',   color: '#3b82f6', emoji: '🚀', order_index: 3 },
      { company_id: companyId, name: 'Shipped',       color: '#10b981', emoji: '✅', order_index: 4 },
      { company_id: companyId, name: "Won't Do",      color: '#6b7280', emoji: '🚫', order_index: 5 },
    ])

    // ── 2. TOPICS ──────────────────────────────────────────────────
    const { data: topics } = await db.from('topics').insert([
      { company_id: companyId, name: 'Feature Request', emoji: '✨', color: '#6366f1' },
      { company_id: companyId, name: 'Bug Report',      emoji: '🐛', color: '#ef4444' },
      { company_id: companyId, name: 'Improvement',     emoji: '📈', color: '#10b981' },
      { company_id: companyId, name: 'Question',        emoji: '❓', color: '#f59e0b' },
    ]).select()

    const tIds = topics?.map((t: any) => t.id) || []

    // ── 3. IDEAS ───────────────────────────────────────────────────
    await db.from('ideas').insert([
      {
        company_id: companyId, votes: 47, likes: 14, status: 'planned',
        impact: 4, effort: 2, confidence: 4, reach: 5, priority: 'high',
        topic_id: tIds[0] || null, created_by_name: 'Alex M.',
        title: 'Dark mode support',
        description: 'Add a dark theme option for users who prefer it at night. This would reduce eye strain and save battery on OLED screens. I use this app late at night and the bright white is really harsh.',
      },
      {
        company_id: companyId, votes: 38, likes: 11, status: 'under_review',
        impact: 5, effort: 5, confidence: 3, reach: 5, priority: 'high',
        topic_id: tIds[0] || null, created_by_name: 'Sarah K.',
        title: 'Mobile app for iOS and Android',
        description: 'A native mobile app would make it so much easier to use on the go. Push notifications for important updates would be a huge plus. Currently the mobile web experience is okay but a native app would be much better.',
      },
      {
        company_id: companyId, votes: 29, likes: 8, status: 'in_progress',
        impact: 3, effort: 1, confidence: 5, reach: 4, priority: 'medium',
        topic_id: tIds[2] || null, created_by_name: 'James T.',
        title: 'Export data to CSV',
        description: 'Allow users to export all their data to CSV format for analysis in Excel or Google Sheets. This would be incredibly useful for reporting and sharing data with the team.',
      },
      {
        company_id: companyId, votes: 24, likes: 7, status: 'shipped',
        impact: 4, effort: 2, confidence: 5, reach: 4, priority: 'medium',
        topic_id: tIds[0] || null, created_by_name: 'Priya R.',
        title: 'Slack notifications integration',
        description: 'Connect with Slack to get real-time notifications when new ideas are submitted, votes are cast, or statuses change. Our team lives in Slack so this would be perfect.',
      },
      {
        company_id: companyId, votes: 19, likes: 5, status: 'planned',
        impact: 3, effort: 3, confidence: 4, reach: 3, priority: 'medium',
        topic_id: tIds[0] || null, created_by_name: 'Tom B.',
        title: 'Custom branding and white labeling',
        description: 'Let us customize the board with our own logo, brand colors and custom domain so it feels like a native part of our product rather than a third-party tool.',
      },
      {
        company_id: companyId, votes: 16, likes: 4, status: 'under_review',
        impact: 4, effort: 4, confidence: 3, reach: 3, priority: 'medium',
        topic_id: tIds[0] || null, created_by_name: 'Lisa H.',
        title: 'REST API access',
        description: 'A public REST API would allow us to integrate this with our existing tools and automate workflows. We want to pull ideas into our project management system automatically.',
      },
      {
        company_id: companyId, votes: 13, likes: 3, status: 'under_review',
        impact: 3, effort: 2, confidence: 4, reach: 4, priority: 'low',
        topic_id: tIds[2] || null, created_by_name: 'David W.',
        title: 'Weekly email digest',
        description: 'Send a weekly summary of top ideas, new votes, and status changes so we stay informed without having to log in every day. A digest format would be perfect.',
      },
      {
        company_id: companyId, votes: 11, likes: 3, status: 'under_review',
        impact: 2, effort: 1, confidence: 5, reach: 2, priority: 'low',
        topic_id: tIds[2] || null, created_by_name: 'Emma S.',
        title: 'Keyboard shortcuts for power users',
        description: 'Add keyboard shortcuts for common actions like submitting ideas, voting, and navigating the board. Would make the experience much faster for daily users.',
      },
      {
        company_id: companyId, votes: 9, likes: 2, status: 'under_review',
        impact: 2, effort: 2, confidence: 4, reach: 3, priority: 'low',
        topic_id: tIds[1] || null, created_by_name: 'Mike C.',
        title: 'Merge duplicate ideas',
        description: 'When two users submit similar ideas, admins should be able to merge them together so votes are combined. Right now we have duplicates splitting the votes.',
      },
      {
        company_id: companyId, votes: 7, likes: 2, status: 'under_review',
        impact: 3, effort: 3, confidence: 3, reach: 3, priority: 'low',
        topic_id: tIds[0] || null, created_by_name: 'Anna L.',
        title: 'Public roadmap embed widget',
        description: 'A small embeddable widget we can put on our marketing site showing the current roadmap status. Customers love seeing what\'s coming next.',
      },
    ])

    // ── 4. ANNOUNCEMENTS ───────────────────────────────────────────
    await db.from('announcements').insert([
      {
        company_id: companyId,
        title: `Welcome to ${n} Feedback! 🎉`,
        description: `We've just launched our public feedback board!\n\nThis is where you can:\n• Submit ideas and feature requests\n• Vote on what matters most to you\n• Track progress on our roadmap\n• Stay updated with our latest announcements\n\nWe read every single submission. Your feedback directly shapes what we build next.\n\nThank you for being part of our journey! 🚀`,
        tag: 'Update', status: 'published', likes: 12,
      },
      {
        company_id: companyId,
        title: 'CSV Export is now live ✅',
        description: `Based on your feedback, we've shipped CSV export!\n\nYou can now download all your data directly from the dashboard.\n\nHead to **Settings → Export** to try it out. You can export:\n• All ideas and votes\n• Comments and activity\n• User data\n\nThis was our #3 most voted feature — thank you to everyone who voted and left comments. You made this happen. 🙏`,
        tag: 'Feature', status: 'published', likes: 8,
      },
      {
        company_id: companyId,
        title: 'Dark mode is coming 🌙',
        description: `Great news for all the dark mode fans — we've started building it!\n\nWith 47 votes and countless comments, dark mode is officially in progress. We're targeting a release in the next 2 weeks.\n\nWhat's included:\n• Full dark theme across all pages\n• Auto-detect system preference\n• Manual toggle in settings\n\nFollow this announcement to get notified when it goes live!`,
        tag: 'Update', status: 'published', likes: 5,
      },
      {
        company_id: companyId,
        title: 'Slack integration shipped 🔔',
        description: `You asked, we built it!\n\nThe Slack integration is now live. Connect your workspace in **Admin → Integrations → Slack** and get notified in real time when:\n• New ideas are submitted\n• Ideas get new votes\n• Status changes happen\n• New comments are posted\n\nSetup takes less than 2 minutes. Enjoy!`,
        tag: 'Feature', status: 'published', likes: 6,
      },
    ])

    // ── 5. ROADMAP (update statuses on ideas) ─────────────────────
    // Already done via idea statuses above

    // ── 6. HELP ARTICLES ──────────────────────────────────────────
    await db.from('help_articles').insert([
      {
        company_id: companyId,
        title: `Getting started with ${n}`,
        category: 'Getting Started', status: 'published', featured: true, views: 142, likes: 28, media: [],
        content: `# Welcome to ${n}\n\nThis guide will help you get up and running in minutes.\n\n## Step 1: Create your account\n\nSign up with your email address or continue with Google or GitHub.\n\n## Step 2: Explore existing ideas\n\nBrowse ideas that have already been submitted. Vote on the ones that matter most to you — your votes directly influence our roadmap.\n\n## Step 3: Submit your first idea\n\nClick **"Share an Idea"** and describe what you'd like to see. The best ideas are specific and describe the problem, not just the solution.\n\n## Step 4: Follow the roadmap\n\nCheck our public roadmap to see what's **Planned**, **In Progress**, and **Shipped**.\n\n## Need help?\n\nBrowse our other help articles or contact support directly from the chat widget.`,
      },
      {
        company_id: companyId,
        title: 'How to submit a great idea',
        category: 'Getting Started', status: 'published', featured: true, views: 98, likes: 19, media: [],
        content: `# How to submit a great idea\n\n## Be specific\n\nInstead of *"make it faster"*, try *"reduce dashboard load time to under 2 seconds on mobile"*. Specific ideas get more votes and are easier for us to build.\n\n## Describe the problem, not just the solution\n\nExplain the problem you're facing. This helps us understand the context and sometimes find a better solution than the one you suggested.\n\n## Add details\n\nUse the description field to add context, screenshots, or examples. The more we understand your use case, the better.\n\n## Search first\n\nBefore submitting, search for similar ideas. If one already exists, vote on it instead — splitting votes makes ideas less visible.\n\n## Keep it focused\n\nOne idea per submission. If you have multiple requests, submit them separately so people can vote on each individually.`,
      },
      {
        company_id: companyId,
        title: 'Understanding the roadmap',
        category: 'Features', status: 'published', featured: true, views: 76, likes: 12, media: [],
        content: `# Understanding the roadmap\n\nOur roadmap gives you full visibility into what we're working on.\n\n## Status definitions\n\n| Status | Meaning |\n|--------|---------||\n| 🔍 Under Review | We've seen this and are evaluating it |\n| 📋 Planned | Confirmed — we're going to build this |\n| 🚀 In Progress | Being actively built right now |\n| ✅ Shipped | Done! Available to use |\n| 🚫 Won't Do | Not in our plans (with explanation) |\n\n## How ideas get on the roadmap\n\nIdeas with high community votes, strategic fit, and strong business cases get prioritised. We review the board every sprint.\n\n## ETA on features\n\nWe don't always give exact dates to avoid over-promising, but we try to give rough timeframes (e.g. "this quarter") when we can.\n\n## Following ideas\n\nClick the bell icon on any idea to get notified when its status changes.`,
      },
      {
        company_id: companyId,
        title: 'Voting and notifications',
        category: 'Features', status: 'published', featured: false, views: 54, likes: 9, media: [],
        content: `# Voting and notifications\n\n## How voting works\n\nEach user gets one vote per idea. You can unvote by clicking again. Votes are public.\n\nThe most voted ideas appear at the top of the board and get prioritised on our roadmap.\n\n## Email notifications\n\nWhen you vote on an idea, you automatically get notified when:\n- The status changes (e.g. Planned → In Progress)\n- It gets shipped\n\n## Announcement updates\n\nSubscribe to announcements to get emailed when we publish updates about new features, bug fixes, or roadmap changes.\n\n## Managing notifications\n\nGo to **Account → Notifications** to adjust your preferences. You can choose:\n- Instant emails\n- Daily digest\n- Weekly digest\n- No emails`,
      },
      {
        company_id: companyId,
        title: 'Integrations overview',
        category: 'Integrations', status: 'published', featured: false, views: 67, likes: 11, media: [],
        content: `# Integrations\n\n${n} connects with the tools your team already uses.\n\n## Available integrations\n\n### Slack\nGet notified in a Slack channel when new ideas are submitted, voted on, or change status. Set up in **Admin → Integrations → Slack**.\n\n### Zapier\nConnect ${n} to 5,000+ apps with Zapier. Use it to create Trello cards from ideas, add rows to Google Sheets, or trigger any automation.\n\n### Jira\nAutomatically create Jira issues from approved ideas. Perfect for syncing your feedback board with your development workflow.\n\n### REST API\nUse our API to build custom integrations. Available on Pro plan.\n\n## Setting up integrations\n\nGo to **Admin → Integrations** and click the integration you want to set up. Most take less than 2 minutes to configure.`,
      },
      {
        company_id: companyId,
        title: "Troubleshooting: I can't vote",
        category: 'Troubleshooting', status: 'published', featured: false, views: 89, likes: 14, media: [],
        content: `# Why can't I vote?\n\nHere are the most common reasons and how to fix them.\n\n## You're not logged in\n\nVoting requires an account. Click **Sign in** in the top right and create a free account or log in.\n\n## You've already voted\n\nEach user can only vote once per idea. If you've already voted, the button will appear highlighted. Click it again to unvote.\n\n## Guest voting is disabled\n\nThe board owner may have disabled guest voting. Create an account to vote.\n\n## The board is private\n\nThis board requires an invitation to access. Contact the board owner for access.\n\n## Still having issues?\n\nContact us via the chat widget in the bottom right corner and we'll help you out.`,
      },
      {
        company_id: companyId,
        title: 'Account settings and privacy',
        category: 'Getting Started', status: 'published', featured: false, views: 45, likes: 7, media: [],
        content: `# Account settings and privacy\n\n## Updating your profile\n\nGo to the top right menu → **My Profile** to update your name, avatar, and email address.\n\n## Changing your password\n\n1. Go to **My Profile**\n2. Scroll to **Change Password**\n3. Enter your new password and save\n\nIf you've forgotten your password, use **Forgot Password** on the sign-in page.\n\n## Deleting your account\n\nGo to **My Profile → Danger Zone → Delete Account**. This permanently deletes all your data including your submitted ideas and votes.\n\n## Privacy\n\nYour email address is never shown publicly. Your display name appears next to ideas you submit. See our Privacy Policy for full details.`,
      },
    ])

    console.log(`✓ Seeded ${n} (${companyId}) with full sample data`)
    return { success: true }
  } catch (err: any) {
    console.error('Seed error:', err.message)
    return { success: false, error: err.message }
  }
}
