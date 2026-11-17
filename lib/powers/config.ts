// Colvy Powers: the rules, the powers and the levels, and the clean-up that
// keeps a business's settings in bounds. Pure (no database), shared by the
// server, the screens and scripts/powers.test.mjs. docs/plans/colvy-powers.md
// has the plan.
//
// XP is earned and never spent; it decides the level. Colvy Coins are earned
// and spent on powers. Neither can be bought, cashed out or moved to another
// workspace. Levels unlock looks only, never permissions.

export type RuleId = 'resolve' | 'task' | 'job' | 'feedback' | 'thanks' | 'challenge'
export type Rule = { on: boolean; coins: number; xp: number }

export const RULES: { id: RuleId; label: string; hint: string; coins: number; xp: number }[] = [
  { id: 'resolve', label: 'Resolve a conversation', hint: 'Closed after a real reply from you. Reopening and closing again doesn’t pay twice.', coins: 10, xp: 10 },
  { id: 'task', label: 'Complete an assigned task', hint: 'A task you made for yourself and ticked within 10 minutes doesn’t count.', coins: 15, xp: 15 },
  { id: 'job', label: 'Complete a job', hint: 'Everyone assigned to the job.', coins: 25, xp: 25 },
  { id: 'feedback', label: 'Positive customer feedback', hint: 'A 4 or 5 star Google review that names you.', coins: 30, xp: 30 },
  { id: 'thanks', label: 'A teammate says thanks', hint: 'Each person can thank up to 3 teammates a day.', coins: 10, xp: 5 },
  { id: 'challenge', label: 'Finish a challenge', hint: 'The challenge’s own reward is used when it sets one.', coins: 50, xp: 50 },
]
export const RULE_IDS = RULES.map(r => r.id)

// ── Powers ───────────────────────────────────────────────────────────────────
export type PowerId =
  | 'priority_pin' | 'nudge' | 'vip_crown' | 'focus_shield' | 'double_xp' | 'confetti'
  | 'spotlight' | 'streak_saver' | 'team_boost' | 'custom_status' | 'gift' | 'mystery_box'

export type PowerDef = {
  id: PowerId
  name: string
  blurb: string
  price: number             // coins; for a gift, the most at once
  minutes: number           // how long it lasts; 0 = instant
  cooldown: number          // minutes before the same person can use it again
  daily: number             // uses per person per day; 0 = no limit
  target: 'teammate' | 'self' | 'team' | 'none'
  phase: 2 | 4
  color: string
  icon: string              // a key in components/powers/PowerIcon
}

export const POWERS: PowerDef[] = [
  { id: 'priority_pin', name: 'Priority Pin', blurb: 'Pin a conversation to the top of a teammate’s inbox for 30 minutes. They can unpin it.', price: 100, minutes: 30, cooldown: 30, daily: 3, target: 'teammate', phase: 2, color: '#ff6a4d', icon: 'pin' },
  { id: 'nudge', name: 'Nudge', blurb: 'A friendly tap on the shoulder, with a short note.', price: 50, minutes: 0, cooldown: 10, daily: 5, target: 'teammate', phase: 2, color: '#7c5cff', icon: 'nudge' },
  { id: 'vip_crown', name: 'VIP Crown', blurb: 'A small crown next to your name for 24 hours.', price: 250, minutes: 24 * 60, cooldown: 24 * 60, daily: 1, target: 'self', phase: 2, color: '#f5b400', icon: 'crown' },
  { id: 'confetti', name: 'Confetti Bomb', blurb: 'A burst of confetti on the whole team’s screen, with your message.', price: 50, minutes: 0, cooldown: 60, daily: 3, target: 'team', phase: 2, color: '#ec4899', icon: 'confetti' },
  { id: 'focus_shield', name: 'Focus Shield', blurb: '30 minutes without playful pings from teammates. Customer messages and real alerts still come through.', price: 75, minutes: 30, cooldown: 60, daily: 4, target: 'self', phase: 4, color: '#0ea5e9', icon: 'shield' },
  { id: 'double_xp', name: 'Double XP', blurb: 'Your rewards give twice the XP for an hour. Coins stay the same.', price: 200, minutes: 60, cooldown: 24 * 60, daily: 1, target: 'self', phase: 4, color: '#22c55e', icon: 'bolt' },
  { id: 'spotlight', name: 'Spotlight', blurb: 'Put a teammate’s great work on everyone’s screen for a day.', price: 150, minutes: 24 * 60, cooldown: 12 * 60, daily: 1, target: 'teammate', phase: 4, color: '#f97316', icon: 'spot' },
  { id: 'streak_saver', name: 'Streak Saver', blurb: 'Keeps your streak alive through one missed day. Used for you automatically.', price: 150, minutes: 0, cooldown: 0, daily: 1, target: 'self', phase: 4, color: '#14b8a6', icon: 'flame' },
  { id: 'team_boost', name: 'Team Boost', blurb: 'Everyone earns 50% more XP for an hour.', price: 500, minutes: 60, cooldown: 24 * 60, daily: 1, target: 'team', phase: 4, color: '#6366f1', icon: 'rocket' },
  { id: 'custom_status', name: 'Custom Status', blurb: 'An emoji and a few words next to your name for 24 hours.', price: 100, minutes: 24 * 60, cooldown: 60, daily: 3, target: 'self', phase: 4, color: '#64748b', icon: 'status' },
  { id: 'gift', name: 'Coin Gift', blurb: 'Send some of your coins to a teammate. Coins only, never XP.', price: 100, minutes: 0, cooldown: 0, daily: 0, target: 'teammate', phase: 4, color: '#e11d48', icon: 'gift' },
  { id: 'mystery_box', name: 'Mystery Box', blurb: 'A surprise look for your profile: a badge colour or a name style. Looks only.', price: 100, minutes: 0, cooldown: 60, daily: 2, target: 'self', phase: 4, color: '#a855f7', icon: 'box' },
]
export const POWER_IDS = POWERS.map(p => p.id)
export const powerDef = (id: string) => POWERS.find(p => p.id === id) || null

// What a Mystery Box can hold: looks only, never coins, XP or anything useful
// at work, so nothing paid-for is a gamble.
export const COSMETICS: { id: string; kind: 'ring' | 'name'; label: string; value: string }[] = [
  { id: 'ring-sunset', kind: 'ring', label: 'Sunset ring', value: 'linear-gradient(135deg,#ff6a4d,#f5b400)' },
  { id: 'ring-ocean', kind: 'ring', label: 'Ocean ring', value: 'linear-gradient(135deg,#0ea5e9,#14b8a6)' },
  { id: 'ring-violet', kind: 'ring', label: 'Violet ring', value: 'linear-gradient(135deg,#7c5cff,#ec4899)' },
  { id: 'ring-mint', kind: 'ring', label: 'Mint ring', value: 'linear-gradient(135deg,#22c55e,#a3e635)' },
  { id: 'name-coral', kind: 'name', label: 'Coral name', value: '#ff6a4d' },
  { id: 'name-violet', kind: 'name', label: 'Violet name', value: '#7c5cff' },
  { id: 'name-teal', kind: 'name', label: 'Teal name', value: '#0d9488' },
]

// ── Levels ───────────────────────────────────────────────────────────────────
// XP for level L is 50·(L−1)²: level 5 at 800 XP (about a week of steady
// work), 10 at 4,050, 20 at 18,050, 30 at 42,050, 50 at 120,050.
export const TITLES: { level: number; title: string }[] = [
  { level: 1, title: 'Rookie' },
  { level: 5, title: 'Rising Star' },
  { level: 10, title: 'Specialist' },
  { level: 20, title: 'Champion' },
  { level: 30, title: 'Legend' },
  { level: 50, title: 'Colvy Master' },
]
export const MAX_LEVEL = 50
export const xpForLevel = (level: number) => 50 * Math.pow(Math.max(1, Math.min(MAX_LEVEL, Math.floor(level))) - 1, 2)

export function levelFor(xp: number) {
  const x = Math.max(0, Math.floor(Number(xp) || 0))
  let level = Math.min(MAX_LEVEL, Math.floor(Math.sqrt(x / 50)) + 1)
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= x) level++
  while (level > 1 && xpForLevel(level) > x) level--
  const title = [...TITLES].reverse().find(t => level >= t.level)!.title
  const from = xpForLevel(level)
  const to = level >= MAX_LEVEL ? from : xpForLevel(level + 1)
  return { level, title, xp: x, from, to, progress: to > from ? (x - from) / (to - from) : 1 }
}

// ── Settings ─────────────────────────────────────────────────────────────────
export type PowerSetting = { on: boolean; price: number; cooldown: number; daily: number }
export type PowersConfig = {
  rules: Record<RuleId, Rule>
  caps: { coins: number; xp: number; thanks: number; gift: number; targetHourly: number }
  powers: Record<PowerId, PowerSetting>
  leaderboard: 'everyone' | 'team' | 'off'
  who: { roles: string[]; locations: string[] }   // empty = everyone on the team
}

export const DEFAULT_CAPS = { coins: 150, xp: 300, thanks: 3, gift: 200, targetHourly: 4 }
export const ROLE_CHOICES = ['owner', 'admin', 'editor'] as const

export function defaultConfig(): PowersConfig {
  return {
    rules: Object.fromEntries(RULES.map(r => [r.id, { on: true, coins: r.coins, xp: r.xp }])) as Record<RuleId, Rule>,
    caps: { ...DEFAULT_CAPS },
    powers: Object.fromEntries(POWERS.map(p => [p.id, { on: true, price: p.price, cooldown: p.cooldown, daily: p.daily }])) as Record<PowerId, PowerSetting>,
    leaderboard: 'everyone',
    who: { roles: [], locations: [] },
  }
}

const int = (v: any, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A business's saved config, filled in with defaults and kept in bounds. */
export function cleanConfig(raw: any): PowersConfig {
  const d = defaultConfig()
  const src = raw && typeof raw === 'object' ? raw : {}
  const rules = { ...d.rules }
  for (const r of RULES) {
    const v = src.rules?.[r.id]
    if (v && typeof v === 'object') rules[r.id] = { on: v.on !== false, coins: int(v.coins, 0, 500, r.coins), xp: int(v.xp, 0, 500, r.xp) }
  }
  const caps = {
    coins: int(src.caps?.coins, 0, 5000, d.caps.coins),
    xp: int(src.caps?.xp, 0, 10000, d.caps.xp),
    thanks: int(src.caps?.thanks, 0, 20, d.caps.thanks),
    gift: int(src.caps?.gift, 0, 5000, d.caps.gift),
    targetHourly: int(src.caps?.targetHourly, 1, 20, d.caps.targetHourly),
  }
  const powers = { ...d.powers }
  for (const p of POWERS) {
    const v = src.powers?.[p.id]
    if (v && typeof v === 'object') powers[p.id] = {
      on: v.on !== false,
      price: int(v.price, 1, 10000, p.price),
      cooldown: int(v.cooldown, 0, 7 * 24 * 60, p.cooldown),
      daily: int(v.daily, 0, 50, p.daily),
    }
  }
  const leaderboard = ['everyone', 'team', 'off'].includes(src.leaderboard) ? src.leaderboard : d.leaderboard
  const roles = Array.isArray(src.who?.roles) ? src.who.roles.map((x: any) => String(x).toLowerCase()).filter((x: string) => (ROLE_CHOICES as readonly string[]).includes(x)) : []
  const locations = Array.isArray(src.who?.locations) ? src.who.locations.filter((x: any) => typeof x === 'string' && UUID.test(x)).slice(0, 50) : []
  return { rules, caps, powers, leaderboard, who: { roles: Array.from(new Set(roles)) as string[], locations } }
}

/** May this person take part? Owners always may; otherwise their role and location must be on the lists (an empty list allows everyone). */
export function canTakePart(cfg: PowersConfig, person: { role?: string | null; locationId?: string | null; isOwner?: boolean }): boolean {
  if (person.isOwner) return true
  const role = String(person.role || 'editor').toLowerCase()
  if (cfg.who.roles.length && !cfg.who.roles.includes(role)) return false
  if (cfg.who.locations.length && !(person.locationId && cfg.who.locations.includes(person.locationId))) return false
  return true
}

// ── Anti-abuse helpers ───────────────────────────────────────────────────────
const TRIVIAL = new Set([
  'ok', 'okay', 'k', 'kk', 'thanks', 'thank you', 'thx', 'ty', 'cheers', 'yes', 'no', 'yep', 'nope', 'sure', 'done',
  'hi', 'hello', 'hey', 'bye', 'test', 'testing', 'great', 'cool', 'np', 'no worries', 'will do', 'noted', 'ok thanks',
  'ok thank you', 'thanks!', 'ok!', 'perfect', 'awesome', 'got it',
])

/** A reply that counts as real work: a few words, not a one-word acknowledgement. */
export function isMeaningfulReply(text: any): boolean {
  const t = String(text || '').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim()
  if (t.length < 12) return false
  const words = t.split(' ').filter(w => /[\p{L}\p{N}]/u.test(w))
  if (words.length < 3) return false
  const bare = t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()
  if (TRIVIAL.has(bare)) return false
  if (/^(.)\1+$/.test(bare.replace(/ /g, ''))) return false   // "aaaaaaa…"
  return true
}

/** A task its own assignee made and ticked within 10 minutes: no reward. */
export function isTrivialSelfTask(task: { created_by_id?: string | null; created_at?: string | null; completed_at?: string | null }, userId: string): boolean {
  if (!task.created_by_id || task.created_by_id !== userId) return false
  const made = Date.parse(String(task.created_at || '')), done = Date.parse(String(task.completed_at || ''))
  if (!Number.isFinite(made) || !Number.isFinite(done)) return true
  return done - made < 10 * 60_000
}

/** The one teammate a review names by first name, or null (none, or more than one could match). */
export function teammateNamedIn(text: any, team: { id: string; name: string }[]): string | null {
  const body = ` ${String(text || '').toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ')} `
  const firsts = new Map<string, string[]>()
  for (const m of team) {
    const first = String(m.name || '').trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}'-]/gu, '')
    if (!first || first.length < 3) continue
    firsts.set(first, [...(firsts.get(first) || []), m.id])
  }
  const hits: string[] = []
  for (const [first, ids] of firsts) {
    if (!body.includes(` ${first} `) && !body.includes(` ${first}'s `)) continue
    if (ids.length > 1) return null          // two Sams: can't tell who
    hits.push(ids[0])
  }
  return hits.length === 1 ? hits[0] : null
}

/** Effective XP after Double XP (×2) and Team Boost (×1.5). Coins never multiply. */
export function boostedXp(xp: number, o: { double?: boolean; team?: boolean }) {
  let x = xp
  if (o.double) x *= 2
  if (o.team) x *= 1.5
  return Math.round(x)
}

/** The leaderboard periods: Monday-started weeks and calendar months, as local dates. */
export function periodStart(today: string, period: 'week' | 'month'): string {
  if (period === 'month') return today.slice(0, 8) + '01'
  const d = new Date(today + 'T00:00:00Z')
  const back = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}
/** "2026-W47"-style key for a week, from its Monday. */
export function weekKey(today: string): string {
  const d = new Date(today + 'T00:00:00Z')
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const wk = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 864e5 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`
}
