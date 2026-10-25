// Which languages a business's calls are in, and how Colvy shows them.
// Safe for the browser (no server imports).
//
// Saved in companies.inbox_settings.call_languages:
//   languages  extra languages spoken on calls besides English (['ne'] to
//              start). They're passed to speech recognition as hints, and
//              they decide whether a transcript is checked for Romanised
//              speech that wasn't written in its own script.
//   summary    the language the call summary and action items are written in:
//              'en' English, 'ne' नेपाली, 'ne-roman' Roman Nepali.
//   view       which version of a translated transcript opens first:
//              'en' English, 'roman' Roman script, 'original' the spoken language's
//              own script. Each person's last choice wins over this.

export type CallLanguageCode = 'ne' | 'hi'
export type SummaryLanguage = 'en' | 'ne' | 'ne-roman'
export type TranscriptView = 'en' | 'roman' | 'original'
export type CallLanguageSettings = { languages: CallLanguageCode[]; summary: SummaryLanguage; view: TranscriptView }

/** Languages a business can switch on. Order is the order shown. */
export const CALL_LANGUAGES: { code: CallLanguageCode; name: string; native: string; bcp47: string; romanName: string }[] = [
  { code: 'ne', name: 'Nepali', native: 'नेपाली', bcp47: 'ne-NP', romanName: 'Roman Nepali' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', bcp47: 'hi-IN', romanName: 'Roman Hindi' },
]

export const SUMMARY_LANGUAGES: { value: SummaryLanguage; label: string; needs?: CallLanguageCode }[] = [
  { value: 'en', label: 'English' },
  { value: 'ne', label: 'नेपाली (Nepali)', needs: 'ne' },
  { value: 'ne-roman', label: 'Roman Nepali', needs: 'ne' },
]

export const DEFAULT_CALL_LANGUAGES: CallLanguageSettings = { languages: [], summary: 'en', view: 'en' }

export function callLanguageSettings(inboxSettings: any): CallLanguageSettings {
  const raw = inboxSettings && typeof inboxSettings === 'object' ? inboxSettings.call_languages : null
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CALL_LANGUAGES }
  const known = new Set(CALL_LANGUAGES.map(l => l.code))
  const languages = (Array.isArray(raw.languages) ? raw.languages : []).filter((c: any) => known.has(c)) as CallLanguageCode[]
  const summaryOpt = SUMMARY_LANGUAGES.find(s => s.value === raw.summary)
  const summary: SummaryLanguage = summaryOpt && (!summaryOpt.needs || languages.includes(summaryOpt.needs)) ? summaryOpt.value : 'en'
  const view: TranscriptView = raw.view === 'roman' || raw.view === 'original' ? raw.view : 'en'
  return { languages: [...new Set(languages)], summary, view }
}

/** BCP-47 hints for speech recognition: English plus the business's languages, or [] (detect anything). */
export function speechHints(s: CallLanguageSettings): string[] {
  if (!s.languages.length) return []
  return ['en-GB', ...s.languages.map(c => CALL_LANGUAGES.find(l => l.code === c)!.bcp47)]
}

/** Is a detected language code English (or unknown)? Accepts 'en', 'en-AU', 'english'. */
export function isEnglish(lang: string | null | undefined): boolean {
  const l = String(lang || '').toLowerCase()
  return !l || l.startsWith('en')
}

/** Text written (at least partly) in a non-Latin script: Devanagari, Arabic, CJK and so on. */
export function hasNonLatinScript(text: string): boolean {
  // Ignore punctuation, digits and symbols; count letters outside Latin.
  return /[ऀ-ॿঀ-෿؀-ۿЀ-ӿ฀-๿぀-ヿ一-鿿가-힯]/.test(text || '')
}

// Everyday Nepali written in English letters ("ma bholi aauchu, order ready cha?").
// Only used to decide whether a Latin-script transcript is worth a closer look
// when the business has said its calls can be in Nepali.
const ROMAN_NEPALI = /\b(cha|chha|chaina|huncha|hunchha|hunna|garnu|garchu|garchhu|gareko|garne|hajur|tapai|tapaai|timi|malai|hamro|mero|bholi|aaja|hijo|kati|kaha|kasari|ramro|dai|didi|bhai|bahini|ani|pani|ko|lai|bhayo|bhaneko|bhanne|thikai|thik|huss|hus|parcha|parchha|sakchu|sakincha|aauchu|aaunchu|jaanchu|janchu|kina|kun|yo|tyo|ekchin|dhanyabad|namaste)\b/gi

/** Does Latin text look like Romanised Nepali? Needs several distinct hits. */
export function looksRomanNepali(text: string): boolean {
  const hits = new Set((String(text || '').match(ROMAN_NEPALI) || []).map(w => w.toLowerCase()))
  return hits.size >= 4
}

/** "Nepali", from 'ne' / 'ne-NP' / 'nepali'. */
export function languageName(code: string | null | undefined): string {
  const c = String(code || '').toLowerCase()
  if (!c) return ''
  const known = CALL_LANGUAGES.find(l => c === l.code || c.startsWith(`${l.code}-`) || c === l.name.toLowerCase())
  if (known) return known.name
  try {
    const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(c.split('-')[0])
    if (n && n.toLowerCase() !== c) return n
  } catch {}
  return c.charAt(0).toUpperCase() + c.slice(1)
}

/** The language's own name, e.g. "नेपाली" (falls back to the English name). */
export function nativeName(code: string | null | undefined): string {
  const c = String(code || '').toLowerCase().split('-')[0]
  return CALL_LANGUAGES.find(l => l.code === c)?.native || languageName(code)
}

/** "Roman Nepali" / "Roman script". */
export function romanName(code: string | null | undefined): string {
  const c = String(code || '').toLowerCase().split('-')[0]
  return CALL_LANGUAGES.find(l => l.code === c)?.romanName || 'Roman script'
}
