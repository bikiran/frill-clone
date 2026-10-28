// What customers say about Colvy: the /testimonials page and the rating in the
// marketing footer read this list.
//
// Real quotes only. Each one is from a named person who sent it to us (the
// "Add yours" form on /testimonials emails support@colvy.com) and agreed to
// the exact wording, with the rating they gave. Nothing here is written by
// us, edited beyond typos, or averaged in from other review sites. Invented or
// "illustrative" testimonials are misleading to customers (and against the
// ACCC's and FTC's rules), so the page shows an honest empty state instead.
//
// To add one: copy their wording exactly, set `date` to when they sent it
// (YYYY-MM-DD), and only add a photo or logo they sent or agreed to.

export type Testimonial = {
  name: string
  role: string
  company: string
  /** 1–5, as they gave it. */
  rating: number
  quote: string
  /** When they sent it, YYYY-MM-DD. */
  date: string
  /** Their company's logo, if they're happy for it to be shown. */
  logo?: string
  /** Their photo, if they sent one for this. */
  photo?: string
  url?: string
}

export const TESTIMONIALS: Testimonial[] = []

/** The average rating (one decimal) and how many, or null with none yet. */
export function ratingSummary(list: Testimonial[] = TESTIMONIALS): { average: number; count: number } | null {
  const rated = list.filter(t => t.rating >= 1 && t.rating <= 5)
  if (!rated.length) return null
  const average = Math.round((rated.reduce((n, t) => n + t.rating, 0) / rated.length) * 10) / 10
  return { average, count: rated.length }
}
