'use client'

import { useState, useMemo, useEffect, useRef } from 'react'

// A practical emoji set grouped the way people expect, each with search
// keywords. Deliberately data-only (no dependency) so it stays light.
type Group = { name: string; icon: string; items: [string, string][] }

const EMOJI_GROUPS: Group[] = [
  {
    name: 'Smileys & People', icon: '😀',
    items: [
      ['😀', 'grin smile happy'], ['😃', 'smile happy joy'], ['😄', 'smile happy laugh'],
      ['😁', 'beam grin happy'], ['😆', 'laugh satisfied'], ['😅', 'sweat laugh relief'],
      ['🤣', 'rofl laugh rolling'], ['😂', 'joy tears laugh'], ['🙂', 'slight smile'],
      ['🙃', 'upside down silly'], ['😉', 'wink'], ['😊', 'blush smile happy'],
      ['😇', 'innocent angel halo'], ['🥰', 'love hearts adore'], ['😍', 'heart eyes love'],
      ['😘', 'kiss blow love'], ['😋', 'yum tasty tongue'], ['😎', 'cool sunglasses'],
      ['🤩', 'star struck excited'], ['🥳', 'party celebrate'], ['🤔', 'thinking hmm'],
      ['🤨', 'raised eyebrow suspicious'], ['😐', 'neutral meh'], ['😴', 'sleep zzz tired'],
      ['😢', 'cry sad tear'], ['😭', 'sob cry sad'], ['😤', 'triumph huff'],
      ['😡', 'angry mad rage'], ['🤯', 'mind blown explode'], ['😱', 'scream shock fear'],
      ['🤗', 'hug'], ['🤝', 'handshake deal agree'], ['👍', 'thumbs up yes good like'],
      ['👎', 'thumbs down no bad'], ['👏', 'clap applause'], ['🙌', 'raise hands celebrate'],
      ['👋', 'wave hello hi bye'], ['🙏', 'pray thanks please'], ['💪', 'muscle strong'],
      ['👀', 'eyes look watch'], ['🧠', 'brain smart mind'], ['👤', 'person user profile'],
      ['👥', 'people users team group'], ['👨‍💻', 'developer coder engineer'], ['👩‍💻', 'developer coder engineer'],
      ['🧑‍🔧', 'mechanic technician support'], ['👷', 'worker construction build'], ['🕵️', 'detective search investigate'],
    ],
  },
  {
    name: 'Objects & Tools', icon: '🔧',
    items: [
      ['📁', 'folder file category'], ['📂', 'folder open'], ['🗂️', 'dividers files organise'],
      ['📄', 'page document article'], ['📃', 'page curl document'], ['📑', 'bookmark tabs'],
      ['📊', 'bar chart analytics stats'], ['📈', 'chart up growth increase'], ['📉', 'chart down decrease'],
      ['📋', 'clipboard list tasks'], ['📌', 'pin'], ['📎', 'paperclip attachment'],
      ['🔗', 'link chain integration url'], ['📏', 'ruler measure size'], ['✂️', 'scissors cut'],
      ['🔒', 'lock secure privacy'], ['🔓', 'unlock open'], ['🔑', 'key access password login'],
      ['🗝️', 'old key access'], ['🔨', 'hammer build fix'], ['🛠️', 'tools settings maintenance'],
      ['🔧', 'wrench fix repair troubleshoot'], ['⚙️', 'gear settings config'], ['🧰', 'toolbox tools kit'],
      ['🔌', 'plug power integration'], ['🔋', 'battery power'], ['💡', 'bulb idea tip light'],
      ['🔦', 'torch flashlight search'], ['🕯️', 'candle'], ['📦', 'package box shipping product'],
      ['📮', 'postbox mail'], ['✉️', 'envelope email mail'], ['📧', 'email mail'],
      ['📞', 'phone call telephone'], ['📱', 'mobile phone smartphone'], ['💻', 'laptop computer'],
      ['🖥️', 'desktop computer monitor'], ['⌨️', 'keyboard typing'], ['🖨️', 'printer print'],
      ['💾', 'floppy save disk'], ['💿', 'disc cd'], ['🗄️', 'file cabinet archive storage'],
      ['🗑️', 'trash delete bin remove'], ['🧾', 'receipt invoice billing'], ['💳', 'credit card billing payment'],
      ['💰', 'money bag payment revenue'], ['💵', 'cash money dollar'], ['🪙', 'coin money'],
      ['🛒', 'cart shopping order'], ['🛍️', 'shopping bags retail'], ['🏷️', 'label tag price'],
      ['📷', 'camera photo'], ['🎥', 'video camera film'], ['🎬', 'clapper video film'],
      ['🎙️', 'microphone podcast record'], ['🔔', 'bell notification alert'], ['🔕', 'bell off mute'],
      ['📣', 'megaphone announce marketing'], ['📢', 'loudspeaker announce'], ['🖼️', 'picture image frame'],
    ],
  },
  {
    name: 'Symbols & Status', icon: '⭐',
    items: [
      ['⭐', 'star favourite rating'], ['🌟', 'glowing star special'], ['✨', 'sparkles features new magic'],
      ['⚡', 'zap lightning fast api power'], ['🔥', 'fire hot trending'], ['💥', 'boom collision'],
      ['✅', 'check tick done complete success'], ['☑️', 'checkbox done'], ['✔️', 'check mark done'],
      ['❌', 'cross error fail no'], ['⛔', 'no entry blocked'], ['🚫', 'prohibited blocked ban'],
      ['⚠️', 'warning caution alert'], ['❗', 'exclamation important'], ['❓', 'question help faq'],
      ['💬', 'speech bubble chat message comment'], ['💭', 'thought bubble'], ['🗨️', 'speech left chat'],
      ['ℹ️', 'info information'], ['🆕', 'new'], ['🆓', 'free'],
      ['🔝', 'top up'], ['🔄', 'refresh sync reload update'], ['♻️', 'recycle reuse'],
      ['➕', 'plus add new'], ['➖', 'minus remove'], ['✏️', 'pencil edit write'],
      ['📝', 'memo note write article'], ['🖊️', 'pen write'], ['🔍', 'search find magnify'],
      ['🔎', 'search zoom find'], ['🎯', 'target goal aim'], ['🏆', 'trophy win award'],
      ['🥇', 'first place gold medal'], ['🎁', 'gift present reward'], ['🎉', 'party celebrate launch'],
      ['🎊', 'confetti celebrate'], ['❤️', 'heart love like'], ['💙', 'blue heart'],
      ['💚', 'green heart'], ['💛', 'yellow heart'], ['🧡', 'orange heart'], ['💜', 'purple heart'],
      ['🚀', 'rocket launch start getting started fast'], ['🛸', 'ufo'], ['🎈', 'balloon celebrate'],
    ],
  },
  {
    name: 'Places & Travel', icon: '🚚',
    items: [
      ['🏠', 'home house'], ['🏡', 'house garden'], ['🏢', 'office building company'],
      ['🏬', 'store shop department'], ['🏪', 'convenience store shop'], ['🏭', 'factory warehouse'],
      ['🏥', 'hospital medical'], ['🏦', 'bank'], ['🏫', 'school education'],
      ['📍', 'pin location place address'], ['🗺️', 'map roadmap'], ['🧭', 'compass navigate direction'],
      ['🚚', 'truck delivery shipping'], ['🚐', 'van delivery'], ['🚗', 'car'],
      ['🚲', 'bike bicycle'], ['✈️', 'plane flight travel'], ['🚢', 'ship boat freight'],
      ['⏰', 'alarm clock time schedule'], ['⏱️', 'stopwatch timer'], ['📅', 'calendar date schedule'],
      ['📆', 'calendar date'], ['🗓️', 'calendar spiral schedule'], ['🕐', 'clock time hour'],
    ],
  },
  {
    name: 'Nature & Animals', icon: '🐟',
    items: [
      ['🐟', 'fish aquarium'], ['🐠', 'tropical fish aquarium reef'], ['🐡', 'blowfish puffer'],
      ['🦈', 'shark'], ['🐙', 'octopus'], ['🦑', 'squid'], ['🦐', 'shrimp prawn'],
      ['🦀', 'crab'], ['🐚', 'shell'], ['🐢', 'turtle'], ['🐸', 'frog'],
      ['🦎', 'lizard reptile'], ['🐍', 'snake'], ['🐕', 'dog pet'], ['🐈', 'cat pet'],
      ['🐇', 'rabbit pet'], ['🐦', 'bird'], ['🦜', 'parrot bird'], ['🌊', 'wave water ocean sea'],
      ['💧', 'droplet water'], ['🪸', 'coral reef'], ['🪴', 'plant potted'], ['🌿', 'herb plant leaves'],
      ['🍃', 'leaves nature'], ['🌱', 'seedling grow new'], ['🌳', 'tree'], ['🌸', 'blossom flower'],
      ['🔆', 'bright light'], ['🌡️', 'thermometer temperature'], ['🧪', 'test tube chemistry water test'],
      ['🧫', 'petri dish bacteria'], ['🔬', 'microscope science'], ['🧬', 'dna science'],
    ],
  },
  {
    name: 'Food & Misc', icon: '🍽️',
    items: [
      ['🍽️', 'plate food dining'], ['🍕', 'pizza food'], ['🍔', 'burger food'],
      ['☕', 'coffee drink'], ['🍺', 'beer drink'], ['🥤', 'cup drink'],
      ['🎓', 'graduation education learn tutorial'], ['📚', 'books docs guide library'],
      ['📖', 'open book read guide'], ['🗞️', 'newspaper news'], ['🩺', 'stethoscope health diagnose'],
      ['💊', 'pill medicine'], ['🧼', 'soap clean'], ['🧹', 'broom clean maintenance'],
      ['🪣', 'bucket water'], ['🎨', 'palette design art'], ['🖌️', 'paintbrush design'],
      ['🎵', 'music note'], ['🎮', 'game controller'], ['🧩', 'puzzle piece plugin extension'],
      ['⚖️', 'scales legal terms balance'], ['🛡️', 'shield security protect'], ['🏳️', 'flag'],
    ],
  },
]

const ALL_ITEMS: [string, string][] = EMOJI_GROUPS.flatMap(g => g.items)

interface Props {
  value?: string
  onSelect: (emoji: string) => void
  onClose?: () => void
  /** Rendered inline rather than as a floating panel. */
  inline?: boolean
}

export default function EmojiPicker({ value, onSelect, onClose, inline }: Props) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { searchRef.current?.focus() }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return EMOJI_GROUPS[group].items
    // Match on the emoji itself or any of its keywords; keyword matches that
    // start with the query rank first so "car" finds 🚗 before 🃏.
    const scored = ALL_ITEMS
      .map(([e, kw]) => {
        if (e === q) return { e, kw, score: 0 }
        const words = kw.split(' ')
        if (words.some(w => w === q)) return { e, kw, score: 1 }
        if (words.some(w => w.startsWith(q))) return { e, kw, score: 2 }
        if (kw.includes(q)) return { e, kw, score: 3 }
        return null
      })
      .filter(Boolean) as { e: string; kw: string; score: number }[]
    scored.sort((a, b) => a.score - b.score)
    return scored.map(s => [s.e, s.kw] as [string, string])
  }, [query, group])

  const body = (
    <div style={{ width: 300 }}>
      {/* Search */}
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative' }}>
          <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search emoji…"
            style={{ width: '100%', padding: '8px 28px 8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }} />
          {query && (
            <button type="button" onClick={() => setQuery('')}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Group tabs (hidden while searching, since results span all groups) */}
      {!query.trim() && (
        <div style={{ display: 'flex', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
          {EMOJI_GROUPS.map((g, i) => (
            <button key={g.name} type="button" onClick={() => setGroup(i)} title={g.name}
              style={{ flex: 1, fontSize: 16, lineHeight: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: group === i ? 'var(--peach)' : 'transparent', cursor: 'pointer' }}>
              {g.icon}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div style={{ maxHeight: 220, overflowY: 'auto', padding: 8 }}>
        {results.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center', padding: '18px 0', margin: 0 }}>
            No emoji match “{query}”.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
            {results.map(([e, kw], i) => (
              <button key={`${e}-${i}`} type="button" title={kw} onClick={() => onSelect(e)}
                style={{ fontSize: 19, lineHeight: 1, padding: '6px 0', borderRadius: 7, border: '1px solid ' + (value === e ? 'var(--coral)' : 'transparent'), background: value === e ? 'var(--peach)' : 'transparent', cursor: 'pointer' }}>
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (inline) return body
  return (
    <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 80, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.16)', overflow: 'hidden' }}>
      {body}
    </div>
  )
}
