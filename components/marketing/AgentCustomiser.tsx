'use client'

import { useEffect, useRef, useState } from 'react'
import AiBuddy from '@/components/AiBuddy'
import { BUDDY_SHAPES, BUDDY_SHAPE_LABEL, type BuddyShape } from '@/lib/buddy-shapes'
import { AGENT_ROLE_NAMES, DEFAULT_AGENT_FACES, hexToHue, hueToHex } from '@/lib/agent-faces'

// "Make them yours": the marketing site's try-it version of the face picker on
// the AI agents page (components/agents/AgentFace → FacePicker). A visitor
// picks an agent, names it, picks a shape and slides its colour, and sees how
// it shows in the inbox ("Kai is answering this conversation"). Nothing is
// saved. Until they touch it, it plays a short demo of its own.

const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'
const ORDER = ['support', 'sales', 'reception', 'operations', 'reputation'] as const
type Key = typeof ORDER[number]
type Look = { name: string; shape: BuddyShape; color: string }

const START: Record<Key, Look> = Object.fromEntries(ORDER.map(k => [k, { name: '', shape: DEFAULT_AGENT_FACES[k].shape, color: DEFAULT_AGENT_FACES[k].color }])) as Record<Key, Look>

// The demo: three agents get a name, a new shape and a new colour.
const SCRIPT: { key: Key; name: string; shape: BuddyShape; hue: number }[] = [
  { key: 'support', name: 'Kai', shape: 'flower', hue: 268 },
  { key: 'sales', name: 'Mia', shape: 'bubble', hue: 334 },
  { key: 'reception', name: 'Nova', shape: 'ghost', hue: 178 },
]

const HUE_TRACK = `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => `${hueToHex(i * 30)} ${(i / 12 * 100).toFixed(1)}%`).join(', ')})`

export default function AgentCustomiser({ dark = false, id }: { dark?: boolean; id?: string }) {
  const [looks, setLooks] = useState<Record<Key, Look>>(START)
  const [sel, setSel] = useState<Key>('support')
  const [pop, setPop] = useState(0)          // bumps to replay the face's "pop" when its shape changes
  const [playing, setPlaying] = useState(false)
  const touched = useRef(false)
  const root = useRef<HTMLElement | null>(null)

  const look = looks[sel]
  const shown = look.name.trim() || AGENT_ROLE_NAMES[sel]
  const set = (k: Key, patch: Partial<Look>) => setLooks(l => ({ ...l, [k]: { ...l[k], ...patch } }))

  // The visitor takes over: the demo stops where it is.
  const takeOver = () => { if (!touched.current) { touched.current = true; setPlaying(false) } }

  // Plays once, when the section comes into view (not with reduced motion).
  useEffect(() => {
    const el = root.current
    if (!el || typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const wait = (ms: number) => new Promise<void>(res => { timers.push(setTimeout(res, ms)) })
    const run = async () => {
      setPlaying(true)
      for (const step of SCRIPT) {
        if (cancelled || touched.current) break
        setSel(step.key)
        await wait(700)
        for (let i = 1; i <= step.name.length; i++) {
          if (cancelled || touched.current) return
          set(step.key, { name: step.name.slice(0, i) })
          await wait(110)
        }
        await wait(450)
        if (cancelled || touched.current) return
        set(step.key, { shape: step.shape }); setPop(p => p + 1)
        await wait(650)
        // Slide the colour there in small steps.
        const from = hexToHue(DEFAULT_AGENT_FACES[step.key].color)
        let delta = step.hue - from
        if (delta > 180) delta -= 360
        if (delta < -180) delta += 360
        for (let i = 1; i <= 14; i++) {
          if (cancelled || touched.current) return
          set(step.key, { color: hueToHex((from + (delta * i) / 14 + 360) % 360) })
          await wait(45)
        }
        await wait(1300)
      }
      if (!cancelled) setPlaying(false)
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { io.disconnect(); if (!touched.current) run() }
    }, { threshold: 0.45 })
    io.observe(el)
    return () => { cancelled = true; io.disconnect(); timers.forEach(clearTimeout) }
  }, [])

  const text = dark ? '#f4f5fb' : '#0f1119'
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.58)'
  const line = dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,17,25,0.09)'
  const card = dark ? '#12131b' : '#ffffff'
  const soft = dark ? 'rgba(255,255,255,0.05)' : '#f6f5f2'

  return (
    <section ref={root} id={id} className={`acz${dark ? ' dk' : ''}`} style={{ background: dark ? '#0a0b10' : '#ffffff', padding: 'clamp(64px, 9vw, 110px) 24px', overflow: 'hidden' }}>
      <style>{CSS}</style>
      <div className="acz-grid">
        <div className="acz-copy">
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, marginBottom: 14 }}>Make them yours</div>
          <h2 style={{ fontSize: 'clamp(30px, 4.6vw, 54px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, margin: '0 0 18px', color: text }}>
            Name them. Style them.<br /><span style={{ color: look.color, transition: 'color .3s' }}>They’re your team.</span>
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: muted, margin: '0 0 26px', maxWidth: 480 }}>
            Every agent gets its own name, face and colour, or a photo of your choosing. Your team sees it on its drafts and replies, and in the bar that shows which agent is answering, so you always know who did what.
          </p>
          <ul className="acz-points">
            {[
              { t: 'A name your team uses', d: '“Kai” instead of “Support Agent”, everywhere in Colvy.' },
              { t: '12 shapes, any colour', d: 'A star, a ghost, a speech bubble… then slide the colour.' },
              { t: 'Or a photo', d: 'Your logo, your mascot, your shop dog.' },
              { t: 'Eyes that follow you', d: 'They blink, look around and keep an eye on the inbox.' },
            ].map(p => (
              <li key={p.t} style={{ borderColor: line }}>
                <b style={{ color: text }}>{p.t}</b>
                <span style={{ color: muted }}>{p.d}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* The studio */}
        <div className="acz-studio" style={{ background: card, borderColor: line }} onPointerDown={takeOver} onKeyDown={takeOver}>
          <div className="acz-tabs" role="tablist" aria-label="Agents">
            {ORDER.map(k => (
              <button key={k} type="button" role="tab" aria-selected={sel === k} className={`acz-tab${sel === k ? ' on' : ''}`}
                onClick={() => setSel(k)} style={{ borderColor: sel === k ? looks[k].color : line, color: text, background: sel === k ? soft : 'transparent' }}>
                <AiBuddy size={26} color={looks[k].color} shape={looks[k].shape} />
                <span>{looks[k].name.trim() || AGENT_ROLE_NAMES[k].replace(' Agent', '')}</span>
              </button>
            ))}
          </div>

          <div className="acz-stage" style={{ background: `radial-gradient(120% 90% at 50% 0%, ${look.color}26, transparent 70%), ${soft}` }}>
            <div key={pop} className="acz-face"><AiBuddy size={132} color={look.color} shape={look.shape} shadow /></div>
            <div className="acz-name" style={{ color: text }}>{shown}{playing && <span className="acz-caret" style={{ background: look.color }} />}</div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted }}>{look.name.trim() ? AGENT_ROLE_NAMES[sel] : 'Give it a name'}</div>
          </div>

          <div className="acz-controls">
            <label className="acz-label" htmlFor="acz-name" style={{ color: muted }}>Name</label>
            <input id="acz-name" className="acz-input" value={look.name} maxLength={30} placeholder={AGENT_ROLE_NAMES[sel]}
              onChange={e => set(sel, { name: e.target.value.replace(/[<>"`]/g, '').slice(0, 30) })}
              style={{ color: text, background: soft, borderColor: line }} />

            <p className="acz-label" style={{ color: muted }}>Shape</p>
            <div className="acz-shapes" role="radiogroup" aria-label="Shape">
              {BUDDY_SHAPES.map(s => (
                <button key={s} type="button" role="radio" aria-checked={look.shape === s} title={BUDDY_SHAPE_LABEL[s]} aria-label={BUDDY_SHAPE_LABEL[s]}
                  className={`acz-shape${look.shape === s ? ' on' : ''}`} onClick={() => { set(sel, { shape: s }); setPop(p => p + 1) }}
                  style={{ borderColor: look.shape === s ? look.color : 'transparent', background: look.shape === s ? soft : 'transparent' }}>
                  <AiBuddy size={30} color={look.color} shape={s} />
                </button>
              ))}
            </div>

            <label className="acz-label" htmlFor="acz-hue" style={{ color: muted }}>Colour</label>
            <input id="acz-hue" type="range" min={0} max={359} value={hexToHue(look.color)} className="acz-hue" aria-label="Colour"
              onChange={e => set(sel, { color: hueToHex(Number(e.target.value)) })} style={{ background: HUE_TRACK, ['--thumb' as string]: look.color } as React.CSSProperties} />
          </div>

          {/* How it shows in the inbox, like the real "answering" bar. */}
          <div className="acz-preview" style={{ borderColor: line }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted, marginBottom: 10 }}>In your inbox</div>
            <div className="acz-bar" style={{ background: soft }}>
              <span className="acz-bar-face"><AiBuddy size={34} color={look.color} shape={look.shape} /><i /></span>
              <span className="acz-bar-tx">
                <span style={{ color: text }}><b>{shown}</b> is answering this conversation</span>
                <small style={{ color: muted }}>Suggests replies for your team to send.</small>
              </span>
            </div>
            <div className="acz-draft" style={{ background: `${look.color}17`, borderColor: `${look.color}40`, color: text }}>
              <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: look.color, fontWeight: 700 }}>Draft by {shown}</span>
              Your order #4821 left our store this morning. Tracking: AusPost 33LHX0019. 🐠
            </div>
          </div>
          <p className="acz-note" style={{ color: muted }}>{playing ? 'Playing a demo. Tap anything to take over.' : 'Try it. Nothing here is saved.'}</p>
        </div>
      </div>
    </section>
  )
}

const CSS = `
.acz-grid{max-width:1240px;margin:0 auto;display:grid;grid-template-columns:0.95fr 1.05fr;gap:clamp(32px,5vw,72px);align-items:center}
.acz-grid > *{min-width:0}
.acz-points{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.acz-points li{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border-radius:16px;border:1px solid;font-size:14px;line-height:1.45}
.acz-points b{font-size:15px;font-weight:800;letter-spacing:-.01em}
.acz-studio{border:1px solid;border-radius:28px;padding:18px;box-shadow:0 30px 80px -40px rgba(15,17,25,.35)}
.acz.dk .acz-studio{box-shadow:none}
.acz-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;margin-bottom:14px}
.acz-tabs::-webkit-scrollbar{display:none}
.acz-tab{display:inline-flex;align-items:center;gap:7px;flex-shrink:0;height:40px;padding:0 12px 0 7px;border-radius:999px;border:1.5px solid;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:border-color .2s,background-color .2s}
.acz-tab span{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acz-stage{display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 16px 20px;border-radius:22px;transition:background .35s}
.acz-face{animation:aczPop .5s cubic-bezier(.34,1.56,.64,1)}
.acz-face > svg{animation:aczBob 4.2s ease-in-out infinite}
@keyframes aczPop{0%{transform:scale(.82)}100%{transform:scale(1)}}
@keyframes aczBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.acz-name{display:inline-flex;align-items:center;gap:3px;margin-top:10px;font-size:24px;font-weight:900;letter-spacing:-.02em;min-height:30px}
.acz-caret{width:2px;height:24px;border-radius:2px;animation:aczBlink 1s steps(1) infinite}
@keyframes aczBlink{50%{opacity:0}}
.acz-controls{padding:16px 4px 4px}
.acz-label{display:block;margin:0 0 8px;font-family:${MONO};font-size:10.5px;letter-spacing:.1em;text-transform:uppercase}
.acz-input{width:100%;box-sizing:border-box;height:44px;padding:0 14px;border-radius:12px;border:1px solid;font:inherit;font-size:15px;font-weight:600;outline:none;margin-bottom:16px}
.acz-input:focus{box-shadow:0 0 0 3px rgba(255,106,77,.18)}
.acz-shapes{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:16px}
.acz-shape{display:flex;align-items:center;justify-content:center;aspect-ratio:1;border-radius:14px;border:2px solid;cursor:pointer;padding:0;transition:transform .2s cubic-bezier(.34,1.56,.64,1),background-color .2s,border-color .2s}
.acz-shape:hover{transform:translateY(-2px)}
.acz-shape:focus-visible,.acz-tab:focus-visible{outline:2px solid #ff6a4d;outline-offset:2px}
.acz-hue{-webkit-appearance:none;appearance:none;width:100%;height:14px;border-radius:999px;outline:none;margin:2px 0 6px;cursor:pointer}
.acz-hue::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:var(--thumb);border:4px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.acz-hue::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:var(--thumb);border:4px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.acz-hue:focus-visible{box-shadow:0 0 0 3px rgba(255,106,77,.25)}
.acz-preview{margin-top:16px;padding-top:16px;border-top:1px dashed}
.acz-bar{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px}
.acz-bar-face{position:relative;flex-shrink:0}
.acz-bar-face i{position:absolute;right:-3px;bottom:-3px;width:12px;height:12px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2.5px #fff}
.acz.dk .acz-bar-face i{box-shadow:0 0 0 2.5px #12131b}
.acz-bar-tx{display:flex;flex-direction:column;gap:2px;min-width:0;font-size:14.5px;line-height:1.35}
.acz-bar-tx small{font-size:12.5px}
.acz-draft{display:flex;flex-direction:column;gap:5px;margin:10px 0 0 auto;max-width:86%;padding:11px 14px;border-radius:16px 16px 4px 16px;border:1px solid;font-size:14px;line-height:1.45;transition:background-color .3s,border-color .3s}
.acz-note{margin:12px 4px 0;font-size:12.5px;text-align:center}
@media (max-width:900px){.acz-grid{grid-template-columns:1fr}}
@media (max-width:520px){.acz-points{grid-template-columns:1fr}.acz-studio{padding:12px;border-radius:22px}.acz-shapes{gap:4px}}
@media (prefers-reduced-motion:reduce){.acz-face,.acz-face > svg,.acz-caret{animation:none}}
`
