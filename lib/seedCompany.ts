import { createClient } from '@supabase/supabase-js'

export async function seedCompanyData(companyId: string, companyName: string) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  ) as any

  const n = companyName || 'Your Company'
  const results: string[] = []

  try {
    // 1. STATUSES
    const { error: se } = await db.from('statuses').insert([
      { company_id: companyId, name: 'Under consideration', color: '#f97316', order_index: 1 },
      { company_id: companyId, name: 'Planned',             color: '#3b82f6', order_index: 2 },
      { company_id: companyId, name: 'In Development',      color: '#ea580c', order_index: 3 },
      { company_id: companyId, name: 'Shipped',             color: '#10b981', order_index: 4 },
    ])
    results.push(se ? `statuses: ${se.message}` : 'statuses ✓')

    // 2. TOPICS
    const { data: topics, error: te } = await db.from('topics').insert([
      { company_id: companyId, name: 'improvement',  emoji: '📈', color: '#10b981' },
      { company_id: companyId, name: 'misc',         emoji: '📌', color: '#6b7280' },
      { company_id: companyId, name: 'welcome',      emoji: '👋', color: '#6366f1' },
      { company_id: companyId, name: 'bug',          emoji: '🐛', color: '#ef4444' },
      { company_id: companyId, name: 'integrations', emoji: '🔗', color: '#f59e0b' },
    ]).select()
    results.push(te ? `topics: ${te.message}` : 'topics ✓')

    const tIds: Record<string, string> = {}
    ;(topics || []).forEach((t: any) => { tIds[t.name] = t.id })

    // 3. IDEAS
    const { error: ie } = await db.from('ideas').insert([
      {
        company_id: companyId, title: '[Example Idea] Priority scoring',
        description: 'Automatically calculate priority scores based on votes, effort, and impact to help prioritize the roadmap.',
        votes: 14, likes: 3, status: 'in_progress',
        topic_id: tIds['improvement'] || null, impact: 5, effort: 3, confidence: 4, reach: 4,
        created_by_name: 'User',
      },
      {
        company_id: companyId, title: '[Example Idea] Dark mode support',
        description: 'It would be great to have dark mode. Perhaps add an option to switch between light and dark themes. Maybe also add automatic dark mode based on system settings.',
        votes: 6, likes: 2, status: 'new',
        topic_id: tIds['improvement'] || null, impact: 4, effort: 2, confidence: 4, reach: 5,
        created_by_name: 'User',
      },
      {
        company_id: companyId, title: '[Example Idea] Mobile app',
        description: 'Build native iOS and Android apps so customers can vote and view ideas on the go.',
        votes: 4, likes: 1, status: 'shipped',
        topic_id: tIds['improvement'] || null, impact: 5, effort: 5, confidence: 3, reach: 5,
        created_by_name: 'User',
      },
      {
        company_id: companyId, title: `Welcome to ${n}! 👋`,
        description: `We're excited to hear your ideas. Share your suggestions and vote on what matters most to you.`,
        votes: 1, likes: 0, status: 'planned',
        topic_id: tIds['welcome'] || null, impact: 2, effort: 1, confidence: 5, reach: 3,
        created_by_name: 'Team',
      },
    ])
    results.push(ie ? `ideas: ${ie.message}` : 'ideas ✓')

    // 4. ANNOUNCEMENTS
    const { error: ae } = await db.from('announcements').insert([
      {
        company_id: companyId,
        title: 'Facebook login now here',
        description: 'You can now sign in with Facebook. Head to your account settings to connect your Facebook account.',
        tag: 'new_feature', status: 'published', views: 71, impressions: 63, likes: 1,
      },
      {
        company_id: companyId,
        title: 'New Dashboard Released',
        description: `We've completely redesigned the dashboard with a focus on simplicity and speed.\n\nKey improvements:\n• Faster load times\n• Cleaner layout\n• Better mobile experience\n\nLet us know what you think!`,
        tag: 'improvement', status: 'published', views: 45, impressions: 312, likes: 3,
      },
      {
        company_id: companyId,
        title: `Hello World! We're Using ${n} 🚀`,
        description: `Welcome to our feedback board!\n\nThis is where you can:\n• Submit ideas and feature requests\n• Vote on what matters most\n• Track our roadmap\n• Stay updated with announcements\n\nWe read every submission. Your feedback shapes what we build next.`,
        tag: 'new_feature', status: 'published', views: 120, impressions: 890, likes: 5, is_pinned: true,
      },
    ])
    results.push(ae ? `announcements: ${ae.message}` : 'announcements ✓')

    // 5. HELP ARTICLES
    const articles = [
      {
        title: `Getting started with ${n}`,
        content: `# Getting started with ${n}\n\nWelcome to ${n}! This guide will help you set up your feedback board in minutes.\n\n## Step 1: Create your account\n\nSign up with your email address or continue with Google.\n\n## Step 2: Explore the board\n\nBrowse existing ideas and vote on the ones that matter to you.\n\n## Step 3: Submit your first idea\n\nClick "Share an Idea" and describe what you'd like to see built.\n\n## Step 4: Follow the roadmap\n\nCheck our roadmap to see what's planned, in progress, and shipped.`,
        category: 'Getting Started', status: 'published', featured: true, views: 144, likes: 28,
      },
      {
        title: 'How to create and manage ideas',
        content: `# How to create and manage ideas\n\nIdeas are the core of ${n}. Here's how to manage them effectively.\n\n## Creating ideas\n\nClick "Share an Idea" on your board to submit new ideas. Customers can also submit directly.\n\n## Voting\n\nUsers can upvote ideas they care about. The most voted rise to the top.\n\n## Status management\n\nUpdate idea status: Under Review → Planned → In Development → Shipped.`,
        category: 'Features', status: 'published', featured: true, views: 98, likes: 19,
      },
      {
        title: `Embedding the ${n} widget`,
        content: `# Embedding the ${n} widget\n\nAdd ${n} to your app with a simple script snippet.\n\n## Installation\n\nPaste this code before the closing </body> tag:\n\n\`\`\`html\n<script src="https://widget.colvy.com/embed.js"></script>\n<script>\n  window.ColvyConfig = { slug: 'yourslug' }\n</script>\n\`\`\`\n\n## Configuration\n\nCustomize the widget color, position, and features from Admin → Settings.`,
        category: 'Integrations', status: 'published', featured: true, views: 203, likes: 41,
      },
      {
        title: 'Setting up your public roadmap',
        content: `# Setting up your public roadmap\n\nThe roadmap gives customers visibility into your product direction.\n\n## Statuses\n\n- **Under consideration** — Evaluating this idea\n- **Planned** — Confirmed, coming soon\n- **In Development** — Currently being built\n- **Shipped** — Live and available\n\n## How ideas get on the roadmap\n\nUpdate an idea's status from the admin panel to move it through the stages.`,
        category: 'Features', status: 'published', featured: false, views: 76, likes: 12,
      },
      {
        title: 'Publishing announcements',
        content: `# Publishing announcements\n\nKeep customers updated with Announcements (your changelog).\n\n## Creating an announcement\n\nGo to Admin → Announcements → New Announcement.\n\n## Tags\n\nUse tags like Feature, Bug Fix, Improvement to categorize updates.\n\n## Subscribers\n\nUsers who subscribe get emailed when you publish.`,
        category: 'Features', status: 'published', featured: false, views: 54, likes: 9,
      },
      {
        title: 'Connecting Slack',
        content: `# Connecting Slack\n\nGet notified in Slack when new ideas are submitted.\n\n## Setup\n\n1. Go to Admin → Integrations → Slack\n2. Click "Connect Slack"\n3. Choose your workspace and channel\n4. Select which events to post\n\n## Events\n\nGet notified on new ideas, comments, status changes, and new votes.`,
        category: 'Integrations', status: 'published', featured: false, views: 67, likes: 11,
      },
      {
        title: "Why can't users vote?",
        content: `# Why can't users vote?\n\n## Guest voting disabled\n\nGo to Admin → Settings → Privacy and ensure "Allow guest voting" is enabled.\n\n## User not logged in\n\nIf you've disabled guest voting, users must sign in to vote.\n\n## Already voted\n\nUsers can only vote once per idea. Click again to unvote.`,
        category: 'Troubleshooting', status: 'published', featured: false, views: 89, likes: 14,
      },
      {
        title: 'REST API overview',
        content: `# REST API overview\n\n${n} provides a REST API for programmatic access.\n\n## Authentication\n\n\`\`\`\nAuthorization: Bearer YOUR_API_KEY\n\`\`\`\n\n## Endpoints\n\n- GET /api/v1/ideas — List all ideas\n- POST /api/v1/ideas — Create an idea\n- GET /api/v1/announcements — List announcements\n\n## Rate limiting\n\n1,000 requests per hour per API key.`,
        category: 'API', status: 'published', featured: false, views: 123, likes: 22,
      },
      {
        title: 'Understanding your subscription',
        content: `# Understanding your subscription\n\n## Free plan\n\nUp to 5 team members, unlimited ideas, basic analytics.\n\n## Pro plan\n\nUnlimited team members, white labeling, API access, custom domains, advanced analytics.\n\n## Changing plans\n\nGo to Admin → Billing to upgrade or downgrade at any time.`,
        category: 'Billing', status: 'published', featured: false, views: 46, likes: 7,
      },
    ]

    const { error: he } = await db.from('help_articles').insert(
      articles.map(a => ({ ...a, company_id: companyId, media: [] }))
    )
    results.push(he ? `help_articles: ${he.message}` : 'help_articles ✓')

    // 7. SAMPLE FORM — a customer feedback form
    const sampleForm = {
      company_id: companyId,
      title: 'Customer Feedback Form',
      welcome_message: 'Help us improve! This takes about 2 minutes.',
      thank_you_message: "Thank you for your feedback! We read every response.",
      is_published: true,
      show_confetti: true,
      theme: { color: '#ff7a6b' },
      end_actions: [{ type: 'website', label: 'Visit our board', url: '' }],
      questions: [
        {
          id: 'q1', type: 'nps', title: 'How likely are you to recommend us to a friend?',
          description: '0 = Not at all likely, 10 = Extremely likely', required: true,
        },
        {
          id: 'q2', type: 'multiple_choice', title: 'What do you use us for?',
          description: 'Select the option that best describes you.',
          required: true,
          options: ['Product feedback', 'Bug reporting', 'Feature requests', 'Internal roadmap'],
        },
        {
          id: 'q3', type: 'rating', title: 'How would you rate your overall experience?',
          description: '', required: true,
        },
        {
          id: 'q4', type: 'long_text', title: 'What could we do better?',
          description: 'Be as specific as you like — we read every response.',
          required: false,
        },
        {
          id: 'q5', type: 'email', title: "What's your email? (optional)",
          description: "We'll only use this to follow up on your feedback.", required: false,
        },
      ],
    }
    const { error: fe } = await db.from('forms').insert(sampleForm)
    results.push(fe ? `forms: ${fe.message}` : 'forms ✓')

    console.log(`Seed results for ${companyId}:`, results.join(', '))
    return { success: true, results }
  } catch (err: any) {
    console.error('Seed error:', err.message)
    return { success: false, error: err.message, results }
  }
}
