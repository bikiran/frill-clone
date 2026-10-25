// Which languages a business's calls are in, and how Colvy shows them.
// Safe for the browser (no server imports).
//
// Saved in companies.inbox_settings.call_languages:
//   languages  extra languages spoken on calls besides English (CALL_LANGUAGES). They're passed to speech recognition as hints, and
//              they decide whether a transcript is checked for Romanised
//              speech that wasn't written in its own script.
//   summary    the language the call summary and action items are written in:
//              'en' English, a language code ('ne' नेपाली) or '<code>-roman'
//              ('ne-roman' Roman Nepali) for languages people type in Roman letters.
//   view       which version of a translated transcript opens first:
//              'en' English, 'roman' Roman script, 'original' the spoken language's
//              own script. Each person's last choice wins over this.

export type CallLanguageCode = string
// 'en', a language code (its own script) or '<code>-roman' (Roman letters).
export type SummaryLanguage = string
export type TranscriptView = 'en' | 'roman' | 'original'
export type CallLanguageSettings = { languages: CallLanguageCode[]; summary: SummaryLanguage; view: TranscriptView }

export type CallLanguage = {
  code: string
  name: string
  native: string
  /** Gemini 3.5 Transcribe's code, or null when it isn't on Gemini's list (recognised by auto-detect only). */
  bcp47: string | null
  /** Written in its own script but also typed in Roman letters: what that's called. */
  roman?: string
}

/**
 * Languages a business can switch on, most common in Australian small
 * business first. Calls in any other language are still transcribed and
 * translated (speech recognition detects the language); listing one adds
 * recognition hints, its summary option and, where people type it in Roman
 * letters, the Roman tab.
 */
export const CALL_LANGUAGES: CallLanguage[] = [
  { code: 'ne', name: 'Nepali', native: 'नेपाली', bcp47: 'ne-NP', roman: 'Roman Nepali' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', bcp47: 'hi-IN', roman: 'Roman Hindi' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', bcp47: 'pa-IN', roman: 'Roman Punjabi' },
  { code: 'ur', name: 'Urdu', native: 'اردو', bcp47: null, roman: 'Roman Urdu' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', bcp47: 'bn-IN', roman: 'Roman Bengali' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', bcp47: null, roman: 'Roman Tamil' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', bcp47: 'te-IN', roman: 'Roman Telugu' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', bcp47: 'gu-IN', roman: 'Roman Gujarati' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', bcp47: 'mr-IN', roman: 'Roman Marathi' },
  { code: 'si', name: 'Sinhala', native: 'සිංහල', bcp47: null, roman: 'Roman Sinhala' },
  { code: 'zh', name: 'Mandarin', native: '普通话', bcp47: 'cmn-Hans-CN' },
  { code: 'yue', name: 'Cantonese', native: '粵語', bcp47: 'yue-Hant-HK' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', bcp47: 'vi-VN' },
  { code: 'ko', name: 'Korean', native: '한국어', bcp47: 'ko-KR' },
  { code: 'ja', name: 'Japanese', native: '日本語', bcp47: 'ja-JP' },
  { code: 'th', name: 'Thai', native: 'ไทย', bcp47: 'th-TH' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', bcp47: 'id-ID' },
  { code: 'fil', name: 'Filipino', native: 'Filipino', bcp47: 'fil-PH' },
  { code: 'ar', name: 'Arabic', native: 'العربية', bcp47: 'ar-EG', roman: 'Arabizi' },
  { code: 'fa', name: 'Persian', native: 'فارسی', bcp47: 'fa-IR', roman: 'Finglish' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά', bcp47: 'el-GR', roman: 'Greeklish' },
  { code: 'it', name: 'Italian', native: 'Italiano', bcp47: 'it-IT' },
  { code: 'es', name: 'Spanish', native: 'Español', bcp47: 'es-419' },
  { code: 'pt', name: 'Portuguese', native: 'Português', bcp47: 'pt-BR' },
]

const byCode = (c: string | null | undefined) => {
  const k = String(c || '').toLowerCase()
  return CALL_LANGUAGES.find(l => l.code === k) || CALL_LANGUAGES.find(l => k.startsWith(`${l.code}-`) || k === l.name.toLowerCase()) || null
}

/** Languages people also type in Roman letters (so a Roman version is worth showing). */
export const hasRomanForm = (code: string | null | undefined) => !!byCode(code)?.roman

/** The summary languages a business can choose, given the languages it has on. */
export function summaryOptions(languages: string[]): { value: SummaryLanguage; label: string }[] {
  const out = [{ value: 'en', label: 'English' }]
  for (const c of languages) {
    const l = byCode(c); if (!l) continue
    out.push({ value: l.code, label: l.native === l.name ? l.name : `${l.native} (${l.name})` })
    if (l.roman) out.push({ value: `${l.code}-roman`, label: l.roman })
  }
  return out
}

/** How to write the summary in that language, for the model ('' for English). */
export function summaryInstruction(summary: SummaryLanguage): string {
  if (!summary || summary === 'en') return ''
  const roman = summary.endsWith('-roman')
  const l = byCode(roman ? summary.slice(0, -6) : summary)
  if (!l) return ''
  return roman
    ? `Write "summary" and every "todos" item in ${l.name} using Roman (Latin) letters, the way ${l.name} speakers type it casually on their phones. Keep product names, amounts and English terms the staff use as they are.`
    : `Write "summary" and every "todos" item in ${l.name}${l.native !== l.name ? `, in its own script` : ''}. Keep product names, amounts and English terms the staff use as they are.`
}

export const DEFAULT_CALL_LANGUAGES: CallLanguageSettings = { languages: [], summary: 'en', view: 'en' }

export function callLanguageSettings(inboxSettings: any): CallLanguageSettings {
  const raw = inboxSettings && typeof inboxSettings === 'object' ? inboxSettings.call_languages : null
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CALL_LANGUAGES }
  const languages = [...new Set((Array.isArray(raw.languages) ? raw.languages : []).map((c: any) => byCode(c)?.code).filter(Boolean) as string[])]
  const summary: SummaryLanguage = summaryOptions(languages).some(o => o.value === raw.summary) ? raw.summary : 'en'
  const view: TranscriptView = raw.view === 'roman' || raw.view === 'original' ? raw.view : 'en'
  return { languages, summary, view }
}

/** BCP-47 hints for speech recognition: English plus the business's languages, or [] (detect anything). */
export function speechHints(s: CallLanguageSettings): string[] {
  const codes = s.languages.map(c => byCode(c)?.bcp47).filter(Boolean) as string[]
  // A language Gemini can't take as a hint is left to auto-detection.
  if (!codes.length || codes.length < s.languages.length) return []
  return ['en-GB', ...codes]
}

/** Is a detected language code English (or unknown)? Accepts 'en', 'en-AU', 'english'. */
export function isEnglish(lang: string | null | undefined): boolean {
  const l = String(lang || '').toLowerCase()
  return !l || l.startsWith('en')
}

/** Text written (at least partly) in a non-Latin script: Devanagari, Arabic, CJK and so on. */
export function hasNonLatinScript(text: string): boolean {
  // Ignore punctuation, digits and symbols; count letters outside Latin.
  return /[\u0370-\u03FF\u0900-\u097F\u0980-\u0DFF\u0600-\u06FF\u0400-\u04FF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(text || '')
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

// The most common words in spoken English. A call where few words are these
// is very likely in another language (Vietnamese, Spanish, Romanised Hindi).
const ENGLISH = new Set('the a an and or but to of in on at for with is are was were be been it its this that these those i you he she we they me my your our their him her them yes no yeah okay ok not do does did have has had can could will would just so what when where how why there here hi hello thanks thank please sorry right good sure like know get got one about from up out if all then now'.split(' '))

/** Latin-script text that reads as English (needs 20+ words to judge; shorter counts as English). */
export function looksEnglish(text: string): boolean {
  const words = (String(text || '').toLowerCase().match(/[a-z']+/g) || [])
  if (words.length < 20) return true
  const hits = words.filter(w => ENGLISH.has(w)).length
  return hits / words.length >= 0.18
}

/** "Nepali", from 'ne' / 'ne-NP' / 'nepali'. */
export function languageName(code: string | null | undefined): string {
  const c = String(code || '').toLowerCase()
  if (!c) return ''
  const known = byCode(c)
  if (known) return known.name
  try {
    const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(c.split('-')[0])
    if (n && n.toLowerCase() !== c) return n
  } catch {}
  return c.charAt(0).toUpperCase() + c.slice(1)
}

/** The language's own name, e.g. "नेपाली" (falls back to the English name). */
export function nativeName(code: string | null | undefined): string {
  return byCode(code)?.native || languageName(code)
}

/** "Roman Nepali" / "Roman script". */
export function romanName(code: string | null | undefined): string {
  return byCode(code)?.roman || 'Roman letters'
}
