// A help category's mark: its emoji from Settings → Help Categories if it has
// one, else an icon picked from what the category is about, on a tile in the
// category's colour (lib/help-shared helpCatColor).

import { helpCatColor, helpCatName, type HelpCatMap } from '@/lib/help-shared'

const ICONS: { test: RegExp; d: React.ReactNode }[] = [
  { test: /polic|terms|privacy|legal/i, d: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></> },
  { test: /guarant|gurant|warrant|doa|return|refund/i, d: <><path d="M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z" /><path d="M8.2 13.9 7 23l5-3 5 3-1.2-9.1" /></> },
  { test: /equip|setup|set-up|troubl|repair|fix|filter/i, d: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /> },
  { test: /fish|\blive|stock|\bcare\b|coral|plant/i, d: <><path d="M6.5 12c3-5 9-6 13.5-1.5-1 1-1 2 0 3C15.5 18 9.5 17 6.5 12z" /><path d="M6.5 12 2 8.5v7z" /><circle cx="15.5" cy="11.3" r=".9" fill="currentColor" /></> },
  { test: /start|begin|new|guide|cycle/i, d: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /></> },
  { test: /water|quality|test|ph\b|marine|salt|reef/i, d: <path d="M12 2.7s6.5 7 6.5 11.8a6.5 6.5 0 0 1-13 0C5.5 9.7 12 2.7 12 2.7z" /> },
  { test: /order|deliver|ship|post|pickup|collect/i, d: <><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></> },
  { test: /mainten|clean|service/i, d: <><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></> },
  { test: /bill|pay|price|account/i, d: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></> },
  { test: /integrat|api|connect/i, d: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></> },
]
const DOC = <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>

export default function HelpCatMark({ cat, catMap, size = 40 }: { cat: string | null | undefined; catMap?: HelpCatMap | null; size?: number }) {
  const color = helpCatColor(cat)
  const emoji = cat ? catMap?.[cat]?.icon : null
  const words = `${cat || ''} ${helpCatName(cat, catMap)}`
  const d = ICONS.find(i => i.test.test(words))?.d || DOC
  return (
    <span aria-hidden style={{
      width: size, height: size, flexShrink: 0, borderRadius: Math.round(size * 0.3), display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: emoji ? `color-mix(in srgb, ${color} 14%, #fff)` : `linear-gradient(140deg, color-mix(in srgb, ${color} 75%, #fff), ${color})`,
      color: '#fff', boxShadow: emoji ? 'none' : `inset 0 1px 0 rgba(255,255,255,.3), 0 8px 18px -10px ${color}`, fontSize: Math.round(size * 0.48),
    }}>
      {emoji || <svg width={Math.round(size * 0.48)} height={Math.round(size * 0.48)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>}
    </span>
  )
}
