// The default comment categories for the Social Engagement Manager. Provisioned
// per company on first load, and reused by the AI classifier so a comment's
// category always maps to one of these. Order mirrors the product spec.
export const DEFAULT_SOCIAL_CATEGORIES: string[] = [
  'Non-English Language',
  'Humour / Banter',
  'Product or Service Inquiry',
  'Neutral / Mixed',
  'Spam or Self-promotion',
  'Positive Feedback',
  'Pre-sale Interest',
  'Duplicate or Repeated',
  'Unclear or Gibberish',
  'Tagging Friends',
  'Review or Testimonial',
  'Order or Delivery Issue',
  'Appreciation / Gratitude',
  'Campaign or Event Reaction',
  'Support Request',
  'Brand Mention',
  'Sarcasm / Trolling',
  'Complaint / Anger',
  'Negative Feedback',
]

// Stable slug for a category name — kebab-case, "/" and punctuation collapsed.
export function categorySlug(name: string): string {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
