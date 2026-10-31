// Line icons for the email designer (SVG only, no emoji).
import type { BlockType } from './types'

const P: Record<string, string> = {
  header: 'M4 5h16v5H4z M7 14h10 M9 18h6',
  heading: 'M6 4v16 M18 4v16 M6 12h12',
  text: 'M4 6h16 M4 10h16 M4 14h12 M4 18h9',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15.5 9.5h.01',
  button: 'M3 8h18v8H3z M8 12h8',
  products: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  coupon: 'M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z M10 7v10',
  divider: 'M3 12h18',
  spacer: 'M12 3v6 M9 6l3-3 3 3 M12 21v-6 M9 18l3 3 3-3 M4 12h16',
  social: 'M8 12a2 2 0 1 0 0 .01 M16 7a2 2 0 1 0 0 .01 M16 17a2 2 0 1 0 0 .01 M10 11l4-3 M10 13l4 3',
  footer: 'M4 4h16v16H4z M4 15h16 M8 18h8',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  plus: 'M12 5v14 M5 12h14',
  desktop: 'M3 4h18v12H3z M8 20h8 M12 16v4',
  mobile: 'M7 2h10v20H7z M11 18h2',
  send: 'M4 12l16-8-6 16-2-7z M12 13l8-9',
  save: 'M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M20 20l-4-4',
  warning: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  check: 'M5 12l5 5 9-10',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7z M7 12h7a4 4 0 0 1 0 8H7z',
  italic: 'M10 4h8 M6 20h8 M14 4l-4 16',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1 M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  close: 'M6 6l12 12 M18 6L6 18',
  back: 'M15 18l-6-6 6-6',
  columns: 'M4 5h7v14H4z M13 5h7v14h-7z',
  video: 'M4 6h16v12H4z M10 9.5v5l4.5-2.5z',
  menu: 'M4 12h3 M10.5 12h3 M17 12h3 M4 7h16 M4 17h16',
  grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
  undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  palette: 'M12 3a9 9 0 0 0 0 18c1 0 1.5-.8 1.5-1.5 0-1-.8-1.4-.8-2.3 0-.8.6-1.2 1.5-1.2H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01 M17 11h.01',
  checks: 'M9 6h11 M9 12h11 M9 18h11 M4 6l1 1 2-2 M4 12l1 1 2-2 M4 18l1 1 2-2',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  template: 'M4 4h16v6H4z M4 14h7v6H4z M14 14h6v6h-6z',
  emoji: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8 M9 9.5h.01 M15 9.5h.01',
  inbox: 'M3 13h5l2 3h4l2-3h5 M5 5h14l2 8v6H3v-6z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
}

export function DIcon({ name, size = 16 }: { name: BlockType | keyof typeof P | string; size?: number }) {
  const d = P[name] || P.text
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(' M').map((seg, i) => <path key={i} d={(i ? 'M' : '') + seg} />)}
    </svg>
  )
}
