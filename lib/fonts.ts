import { Bricolage_Grotesque, Instrument_Serif } from 'next/font/google'

// The two faces the report pages (Insights, Analytics, Announcements) use for
// titles and big numbers: Bricolage Grotesque for the heading and figures, and
// Instrument Serif italic for the one accent word in a title. Both are
// downloaded at build time and served from our own origin; a page opts in by
// putting `reportFonts` on its root element and using the CSS variables.

export const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  axes: ['opsz'],
})

export const fontAccent = Instrument_Serif({
  subsets: ['latin'],
  display: 'swap',
  weight: '400',
  style: ['italic'],
  variable: '--font-accent',
})

export const reportFonts = `${fontDisplay.variable} ${fontAccent.variable}`
