export interface IndustryPreset {
  id: string
  label: string
  icon: string
  topics: string[]
  statuses: { key: string; label: string; color: string; bg: string }[]
  sampleIdeas: { title: string; description: string; status: string; votes: number }[]
}

export const INDUSTRIES: IndustryPreset[] = [
  {
    id: 'saas',
    label: 'SaaS / Software',
    icon: '💻',
    topics: ['feature-request', 'bug', 'integration', 'api', 'ui-ux', 'performance'],
    statuses: [
      { key: 'new', label: 'Under Review', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Planned', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'In Development', color: '#ea580c', bg: '#ffedd5' },
      { key: 'beta', label: 'Beta', color: '#f59e0b', bg: '#fef3c7' },
      { key: 'shipped', label: 'Released', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'Add dark mode support', description: 'Users want a dark theme option for nighttime usage', status: 'planned', votes: 47 },
      { title: 'Slack integration', description: 'Integrate with Slack for notifications', status: 'in_progress', votes: 32 },
      { title: 'Mobile app for iOS and Android', description: 'Native mobile apps with offline support', status: 'new', votes: 89 },
    ],
  },
  {
    id: 'school',
    label: 'Schools / Education',
    icon: '🎓',
    topics: ['curriculum', 'facilities', 'events', 'student-life', 'teachers', 'technology'],
    statuses: [
      { key: 'new', label: 'Suggested', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Approved', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'In Progress', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'Implemented', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'New science lab equipment', description: 'Upgrade biology lab with modern microscopes', status: 'planned', votes: 23 },
      { title: 'After-school coding club', description: 'Start a programming club for grades 9-12', status: 'in_progress', votes: 41 },
      { title: 'More vegetarian options in cafeteria', description: 'Add plant-based meal options daily', status: 'new', votes: 67 },
    ],
  },
  {
    id: 'retail',
    label: 'Retail Store',
    icon: '🛍️',
    topics: ['products', 'service', 'pricing', 'location', 'inventory', 'experience'],
    statuses: [
      { key: 'new', label: 'New Suggestion', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Considering', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'Coming Soon', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'Available Now', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'Loyalty rewards program', description: 'Earn points on every purchase', status: 'in_progress', votes: 56 },
      { title: 'Click and collect service', description: 'Order online, pick up in-store', status: 'shipped', votes: 89 },
      { title: 'Extended weekend hours', description: 'Stay open until 10pm on Saturdays', status: 'new', votes: 34 },
    ],
  },
  {
    id: 'wholesale',
    label: 'Wholesale / B2B',
    icon: '📦',
    topics: ['catalog', 'pricing', 'logistics', 'minimum-orders', 'payment-terms', 'shipping'],
    statuses: [
      { key: 'new', label: 'Proposed', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Approved', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'Implementing', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'Live', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'Bulk discount tiers', description: 'Better pricing for 1000+ unit orders', status: 'planned', votes: 28 },
      { title: 'Net 60 payment terms', description: 'Extended payment terms for established clients', status: 'new', votes: 19 },
      { title: 'Real-time inventory API', description: 'Live stock levels via API integration', status: 'in_progress', votes: 41 },
    ],
  },
  {
    id: 'aquarium',
    label: 'Aquarium / Pet Shop',
    icon: '🐠',
    topics: ['livestock', 'equipment', 'food', 'plants', 'aquascaping', 'maintenance'],
    statuses: [
      { key: 'new', label: 'Suggested', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Ordering', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'Coming Soon', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'In Stock', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'Stock more rare bettas', description: 'Bring in koi and galaxy bettas', status: 'planned', votes: 45 },
      { title: 'Live plant section', description: 'Dedicated area for aquatic plants', status: 'shipped', votes: 67 },
      { title: 'Aquascaping workshops', description: 'Monthly hands-on classes', status: 'new', votes: 32 },
    ],
  },
  {
    id: 'online',
    label: 'Online Store / E-commerce',
    icon: '🛒',
    topics: ['products', 'shipping', 'checkout', 'returns', 'mobile', 'support'],
    statuses: [
      { key: 'new', label: 'Suggested', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Planned', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'Building', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'Live', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'One-click checkout', description: 'Faster checkout with saved details', status: 'in_progress', votes: 78 },
      { title: 'Free returns within 30 days', description: 'No-questions-asked returns policy', status: 'shipped', votes: 92 },
      { title: 'Live chat support', description: 'Real-time support during business hours', status: 'planned', votes: 56 },
    ],
  },
  {
    id: 'creator',
    label: 'YouTube / Social Media Creator',
    icon: '🎬',
    topics: ['content-ideas', 'collaborations', 'tutorials', 'merch', 'community', 'tech'],
    statuses: [
      { key: 'new', label: 'Idea', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Filming Soon', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'Editing', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'Published', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'Q&A live stream every Friday', description: 'Weekly community engagement session', status: 'in_progress', votes: 234 },
      { title: 'Behind the scenes vlog', description: 'Show the creative process', status: 'new', votes: 189 },
      { title: 'Merch line with new logo', description: 'T-shirts, hoodies, and stickers', status: 'planned', votes: 312 },
    ],
  },
  {
    id: 'hospitality',
    label: 'Hospitality / Hotels',
    icon: '🏨',
    topics: ['rooms', 'amenities', 'service', 'dining', 'events', 'experience'],
    statuses: [
      { key: 'new', label: 'Feedback', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Planned', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'Renovating', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'Available', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: '24/7 room service', description: 'All-night dining options', status: 'planned', votes: 45 },
      { title: 'Rooftop pool and bar', description: 'Open seasonal rooftop venue', status: 'in_progress', votes: 89 },
      { title: 'Pet-friendly rooms', description: 'Dedicated rooms for guests with pets', status: 'shipped', votes: 67 },
    ],
  },
  {
    id: 'gym',
    label: 'Gym / Fitness',
    icon: '💪',
    topics: ['equipment', 'classes', 'trainers', 'facilities', 'schedule', 'membership'],
    statuses: [
      { key: 'new', label: 'Suggested', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Approved', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'Setting Up', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'Available', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'Add yoga classes on weekends', description: 'Morning yoga sessions for Saturday and Sunday', status: 'planned', votes: 56 },
      { title: 'More squat racks', description: 'Add 3 more racks during peak hours', status: 'in_progress', votes: 89 },
      { title: 'Sauna and steam room', description: 'Wellness facilities for post-workout', status: 'new', votes: 124 },
    ],
  },
  {
    id: 'restaurant',
    label: 'Restaurant / Cafe',
    icon: '🍽️',
    topics: ['menu', 'service', 'ambiance', 'pricing', 'dietary', 'hours'],
    statuses: [
      { key: 'new', label: 'Suggested', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Testing', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'On Menu', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'Permanent', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'Vegan menu options', description: 'Add 5+ vegan dishes to menu', status: 'in_progress', votes: 78 },
      { title: 'Brunch on weekends', description: 'Saturday and Sunday 10am-2pm', status: 'planned', votes: 92 },
      { title: 'Gluten-free pasta', description: 'Add gluten-free option to all pasta dishes', status: 'shipped', votes: 45 },
    ],
  },
  {
    id: 'florist',
    label: 'Florist / Plant Shop',
    icon: '💐',
    topics: ['flowers', 'plants', 'arrangements', 'delivery', 'subscriptions', 'workshops'],
    statuses: [
      { key: 'new', label: 'Suggested', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Sourcing', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'Available Soon', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'In Store', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'Weekly flower subscription', description: 'Fresh blooms delivered weekly', status: 'shipped', votes: 67 },
      { title: 'Workshop: Floral arrangement basics', description: 'Monthly 2-hour workshops', status: 'in_progress', votes: 45 },
      { title: 'Same-day delivery option', description: 'Order before 12pm for same-day delivery', status: 'planned', votes: 89 },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    icon: '🌟',
    topics: ['general', 'feedback', 'improvement', 'idea'],
    statuses: [
      { key: 'new', label: 'New', color: '#3b82f6', bg: '#dbeafe' },
      { key: 'planned', label: 'Planned', color: '#7c3aed', bg: '#ede9fe' },
      { key: 'in_progress', label: 'In Progress', color: '#ea580c', bg: '#ffedd5' },
      { key: 'shipped', label: 'Completed', color: '#059669', bg: '#d1fae5' },
    ],
    sampleIdeas: [
      { title: 'Welcome to your feedback board', description: 'This is where your customers share ideas', status: 'new', votes: 5 },
    ],
  },
]

export const getIndustryById = (id: string) => INDUSTRIES.find(i => i.id === id) || INDUSTRIES[INDUSTRIES.length - 1]
