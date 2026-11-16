'use client'

// The Neon Nights theme (lib/seasonal-themes): an original 80s synthwave
// evening. Behind the app: a striped sun setting on the horizon, a city
// skyline with windows flickering on, a neon grid rolling toward you and palm
// trees swaying in front. At night: stars. Over it: a neon tube glowing along
// the app bar. Now and then: a convertible cruises along the bottom, a
// flamingo flies over, a banner plane tows "Stay rad" across the sky, an
// "OPEN 24/7" sign buzzes on at the edge, or a shooting star streaks past.
// The Colvy orb wears aviator shades and the accent turns hot pink.
//
// Like the other themes: transforms and opacity only, effects pause while the
// tab is hidden, and with reduced motion only the still scene shows.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rnd, useLater, useSceneFrame, useSceneHidden } from './kit'
import { takePreview } from '@/lib/seasonal-themes'

type Kind = 'cruise' | 'flamingo' | 'plane' | 'sign' | 'star'
type Fx =
  | { id: number; kind: 'cruise'; dir: 'r' | 'l'; hue: number }
  | { id: number; kind: 'flamingo'; dir: 'r' | 'l'; y: number }
  | { id: number; kind: 'plane'; y: number }
  | { id: number; kind: 'sign'; side: 'r' | 'l'; y: number }
  | { id: number; kind: 'star'; x: number; y: number }

const WEIGHTS: [Kind, number][] = [['cruise', 2.6], ['flamingo', 2], ['plane', 1.8], ['sign', 2], ['star', 1.6]]
const CARS = [['#ff2d95', '#22e4ff'], ['#22e4ff', '#ff2d95'], ['#ffd23f', '#ff2d95']]

// The night sky's stars and the skyline, the same every time.
const STARS = (() => {
  let seed = 7
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const a: string[] = [], b: string[] = []
  for (let i = 0; i < 70; i++) (i % 2 ? a : b).push(`${(r() * 100).toFixed(1)}vw ${(r() * 46).toFixed(1)}vh 0 ${r() < 0.15 ? '0.6px' : '0'} rgba(255,255,255,${(0.35 + r() * 0.6).toFixed(2)})`)
  return { a: a.join(','), b: b.join(',') }
})()
const SKYLINE = (() => {
  let seed = 23
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const towers: { x: number; w: number; h: number; neon: string | null }[] = []
  const wins: { x: number; y: number; i: number }[] = []
  let x = 0
  while (x < 1440) {
    // Taller towers out to the sides, lower ones in the middle where the sun sets.
    const w = 34 + Math.floor(r() * 60), h = (x > 470 && x < 970 ? 26 : 50) + Math.floor(r() * (x > 470 && x < 970 ? 44 : 104))
    towers.push({ x, w, h, neon: r() < 0.16 ? (r() < 0.5 ? '#ff2d95' : '#22e4ff') : null })
    for (let wy = 160 - h + 10; wy < 154; wy += 12) for (let wx = x + 7; wx < x + w - 8; wx += 11) if (r() < 0.3) wins.push({ x: wx, y: wy, i: wins.length })
    x += w + Math.floor(r() * 6)
  }
  return { towers, wins }
})()

function Palm({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`nn-palm ${className}`} style={style} viewBox="0 0 140 220" aria-hidden>
      <path className="nn-trunk" d="M62 220c4-40 8-80 6-120-1-20-4-34-8-46l8-2c5 14 8 30 9 48 2 40-2 80-5 120z" />
      <path className="nn-rings" d="M61 200h12M62 178h12M63 156h12M64 134h11M65 112h11M66 92h10M65 74h10" />
      <g className="nn-fronds">
        <path d="M66 52C46 30 20 28 2 40c20-4 38 2 52 18z" />
        <path d="M66 52C50 20 30 8 10 8c18 8 34 22 44 46z" />
        <path d="M66 52c4-28 18-46 40-50-14 12-24 28-28 52z" />
        <path d="M66 52c22-16 48-16 68-2-22-4-42 0-58 12z" />
        <path d="M66 52c20 0 44 12 54 34-16-14-34-20-52-22z" />
        <path d="M66 52c-18 4-38 20-44 44 10-20 26-32 46-36z" />
        <circle cx="66" cy="54" r="5" />
      </g>
    </svg>
  )
}

function Car({ body, trim }: { body: string; trim: string }) {
  return (
    <svg className="nn-car-svg" viewBox="0 0 240 78" aria-hidden>
      <defs>
        <linearGradient id="nn-car-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={body} /><stop offset="1" stopColor="#3a0b4d" /></linearGradient>
        <radialGradient id="nn-hl" cx="0" cy=".5" r="1"><stop offset="0" stopColor="rgba(255,240,180,.85)" /><stop offset="1" stopColor="rgba(255,240,180,0)" /></radialGradient>
      </defs>
      <path className="nn-beam" d="M226 44 340 22v50z" fill="url(#nn-hl)" />
      <path d="M150 30 132 12h-6l14 18z" fill={trim} opacity=".9" />
      <path d="M128 14l18 16" stroke="rgba(160,240,255,.55)" strokeWidth="3" />
      <path d="M58 30c8-8 16-9 22-6l4 6z" fill="#1a0d2b" />
      <path d="M8 50c0-10 6-16 16-18l40-4 92-1c22 0 46 4 62 12 10 5 14 10 14 16v4c0 3-2 5-5 5H13c-3 0-5-2-5-5z" fill="url(#nn-car-b)" />
      <path d="M14 46h214" stroke={trim} strokeWidth="2.4" opacity=".95" />
      <path d="M20 54h204" stroke="rgba(255,255,255,.18)" strokeWidth="1" />
      <rect x="224" y="40" width="10" height="5" rx="2" fill="#fff6c8" />
      <rect x="8" y="40" width="9" height="5" rx="2" fill="#ff315f" className="nn-tail" />
      <g className="nn-wheel" style={{ transformOrigin: '58px 62px' }}><circle cx="58" cy="62" r="14" fill="#140a22" /><circle cx="58" cy="62" r="7" fill="none" stroke={trim} strokeWidth="2" /><path d="M58 55v14M51 62h14" stroke={trim} strokeWidth="1.6" /></g>
      <g className="nn-wheel" style={{ transformOrigin: '186px 62px' }}><circle cx="186" cy="62" r="14" fill="#140a22" /><circle cx="186" cy="62" r="7" fill="none" stroke={trim} strokeWidth="2" /><path d="M186 55v14M179 62h14" stroke={trim} strokeWidth="1.6" /></g>
    </svg>
  )
}

function Flamingo() {
  return (
    <svg className="nn-fl-svg" viewBox="0 0 150 70" aria-hidden>
      <path d="M8 40c12 0 26 2 40 4" stroke="#ff8fc2" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M2 38l8 2M4 44l8-2" stroke="#ff8fc2" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="66" cy="42" rx="22" ry="11" fill="#ff6fb1" />
      <path className="nn-wing" d="M58 38c4-20 18-32 36-34-8 10-12 22-14 36z" fill="#ff4f9e" />
      <path className="nn-wing b" d="M62 44c4 16 14 24 28 26-6-8-8-16-10-26z" fill="#ff86c0" />
      <path d="M86 40c14-4 26-4 36 2 6 4 12 4 16 0" stroke="#ff6fb1" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="139" cy="40" r="4.6" fill="#ff6fb1" />
      <path d="M142 38c4 0 6 2 7 6-2-1-4-1-7-1z" fill="#1a0d2b" />
      <circle cx="140" cy="38.6" r="1" fill="#1a0d2b" />
    </svg>
  )
}

function Plane() {
  return (
    <svg className="nn-plane-svg" viewBox="0 0 330 56" aria-hidden>
      <rect x="0" y="12" width="206" height="32" rx="4" className="nn-banner" />
      <text x="103" y="34" textAnchor="middle" className="nn-banner-t">STAY RAD ✦</text>
      <path d="M206 28h34" stroke="#c6b8e8" strokeWidth="1.2" />
      <path d="M240 26c10-6 30-8 52-6l18 2c6 1 10 4 10 6s-4 5-10 6l-18 2c-22 2-42 0-52-6z" fill="#f4f1ff" />
      <path d="M262 22l10-14h8l-6 14zM262 34l10 14h8l-6-14z" fill="#ff2d95" />
      <path d="M240 26l-6-10h6l8 8z" fill="#22e4ff" />
      <circle cx="292" cy="27" r="3" fill="#22e4ff" />
      <g className="nn-prop" style={{ transformOrigin: '322px 28px' }}><rect x="320" y="14" width="4" height="28" rx="2" fill="#5b4a7d" /></g>
    </svg>
  )
}

const SHADES = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2d95"/><stop offset="1" stop-color="#22e4ff"/></linearGradient></defs><path d="M2 5h60" stroke="#1a0d2b" stroke-width="3" stroke-linecap="round"/><path d="M4 5h22c1 9-3 16-11 16S3 14 4 5zM38 5h22c1 9-3 16-11 16S37 14 38 5z" fill="url(#g)" stroke="#1a0d2b" stroke-width="2"/><path d="M26 7c2-2 10-2 12 0" stroke="#1a0d2b" stroke-width="2.4" fill="none"/><path d="M9 8l6 0M43 8l6 0" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/></svg>')}")`

export default function Neon({ calm }: { calm: boolean }) {
  const frame = useSceneFrame()
  const sceneHidden = useSceneHidden()
  const later = useLater()
  const [fx, setFx] = useState<Fx[]>([])
  const ids = useRef(0)
  const last = useRef<Kind | null>(null)
  const small = useMemo(() => typeof window !== 'undefined' && window.innerWidth < 700, [])

  const spawn = useCallback((f: Fx, life: number) => {
    setFx(list => [...list, f])
    later(() => setFx(list => list.filter(x => x.id !== f.id)), life)
  }, [later])

  const play = useCallback((kind: Kind) => {
    last.current = kind
    const id = ++ids.current
    if (kind === 'cruise') spawn({ id, kind, dir: Math.random() < 0.6 ? 'r' : 'l', hue: Math.floor(rnd(0, CARS.length)) }, 7600)
    else if (kind === 'flamingo') spawn({ id, kind, dir: Math.random() < 0.5 ? 'r' : 'l', y: rnd(6, 26) }, 11500)
    else if (kind === 'plane') spawn({ id, kind, y: rnd(3, 14) }, 16500)
    else if (kind === 'sign') spawn({ id, kind, side: Math.random() < 0.5 ? 'r' : 'l', y: rnd(30, 62) }, 6200)
    else spawn({ id, kind, x: rnd(8, 55), y: rnd(2, 16) }, 1800)
  }, [spawn])

  // Something happens every 10 to 20 seconds; the first is the cruise.
  useEffect(() => {
    if (calm) return
    let alive = true
    const pick = (): Kind => {
      const opts = WEIGHTS.filter(([k]) => k !== last.current)
      let r = Math.random() * opts.reduce((s, [, w]) => s + w, 0)
      for (const [k, w] of opts) { if ((r -= w) <= 0) return k }
      return 'cruise'
    }
    const loop = (first: boolean) => later(() => {
      if (!alive) return
      if (!document.hidden) play(first ? 'cruise' : pick())
      loop(false)
    }, first ? 2200 : rnd(10000, 20000))
    loop(true)
    return () => { alive = false }
  }, [calm, later, play])

  // Settings → Preview plays a bit of everything.
  useEffect(() => {
    const run = () => {
      play('cruise')
      later(() => play('sign'), 1200)
      later(() => play('plane'), 2200)
      later(() => play('flamingo'), 3800)
      later(() => play('star'), 6000)
    }
    const onPreview = () => { if (takePreview('neon')) run() }
    onPreview()
    window.addEventListener('colvy-season-preview', onPreview)
    return () => window.removeEventListener('colvy-season-preview', onPreview)
  }, [later, play])

  const vars = { '--nn-top': `${frame.top}px`, '--nn-left': `${frame.left}px` } as React.CSSProperties

  return (
    <>
      <style data-colvy-dark="">{CSS}</style>
      {!sceneHidden && <div className="nn-scene" style={vars} aria-hidden>
        <div className="nn-stars" style={{ boxShadow: STARS.a }} />
        <div className="nn-stars b" style={{ boxShadow: STARS.b }} />
        <div className="nn-sunbox"><div className="nn-sun"><i /></div></div>
        <svg className="nn-city" viewBox="0 0 1440 160" preserveAspectRatio="xMidYMax slice" aria-hidden>
          {SKYLINE.towers.map((t, i) => (
            <g key={i}>
              <rect x={t.x} y={160 - t.h} width={t.w} height={t.h} className="nn-tower" />
              {t.neon && <rect x={t.x + 1} y={160 - t.h + 1} width={t.w - 2} height={t.h} fill="none" stroke={t.neon} strokeWidth="1.6" className="nn-tower-neon" />}
            </g>
          ))}
          {SKYLINE.wins.map(w => <rect key={w.i} x={w.x} y={w.y} width="4" height="5" className="nn-win" style={{ '--i': w.i } as React.CSSProperties} />)}
        </svg>
        <div className="nn-horizon" />
        <div className="nn-grid"><div className="nn-grid-in" /></div>
        <Palm className="l" style={{ left: '-3%', height: 'clamp(170px, 40vh, 380px)' }} />
        <Palm className="l b" style={{ left: '6%', height: 'clamp(110px, 25vh, 240px)' }} />
        <Palm className="r" style={{ right: '-3%', height: 'clamp(180px, 42vh, 400px)' }} />
        {!small && <Palm className="r b" style={{ right: '7%', height: 'clamp(100px, 22vh, 220px)' }} />}
      </div>}

      <div className="nn-fx" style={vars} aria-hidden>
        <div className="nn-clip">
          <div className="nn-tube"><i /></div>
          {fx.map(f => {
            if (f.kind === 'cruise') {
              const [body, trim] = CARS[f.hue % CARS.length]
              return (
                <div key={f.id} className={`nn-cruise ${f.dir}`}>
                  <div className="nn-bounce">
                    <span className="nn-speed"><i /><i /><i /></span>
                    <Car body={body} trim={trim} />
                  </div>
                </div>
              )
            }
            if (f.kind === 'flamingo') return (
              <div key={f.id} className={`nn-flamingo ${f.dir}`} style={{ top: `calc(var(--nn-top) + ${f.y}vh)` }}>
                <div className="nn-glide"><Flamingo /></div>
              </div>
            )
            if (f.kind === 'plane') return (
              <div key={f.id} className="nn-plane" style={{ top: `calc(var(--nn-top) + ${f.y}vh)` }}>
                <div className="nn-glide"><Plane /></div>
              </div>
            )
            if (f.kind === 'sign') return (
              <div key={f.id} className={`nn-sign ${f.side}`} style={{ top: `${f.y}%` }}>
                <span className="nn-sign-in"><b>OPEN</b><small>24/7</small></span>
              </div>
            )
            return <i key={f.id} className="nn-shoot" style={{ left: `${f.x}%`, top: `calc(var(--nn-top) + ${f.y}vh)` }} />
          })}
        </div>
      </div>
    </>
  )
}

// Its own colours for dusk (light) and night (dark); DarkTheme skips this sheet.
const CSS = `
html[data-season="neon"]{--coral:#ff2d95 !important;--coral-hover:#e0177c !important;--peach:rgba(255,45,149,.12) !important}
html[data-season="neon"] .inbox-root{background:transparent !important}
html[data-season="neon"] .colvy-ai-orb-wrap .cvo::after{content:'';position:absolute;left:50%;top:30%;width:88%;height:34%;transform:translateX(-50%) rotate(-4deg);background:${SHADES} center/contain no-repeat;pointer-events:none;z-index:3;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))}

.nn-scene{position:fixed;top:0;right:0;bottom:0;left:var(--nn-left);z-index:-1;pointer-events:none;overflow:hidden;contain:strict;
  --H:clamp(180px,36vh,340px);--G:calc(var(--H) * .5);--sun:clamp(130px,20vw,300px);
  --grid:rgba(255,45,149,.55);--grid2:rgba(34,228,255,.35);--floor:#f6e6ff;--tower:#7b4a9e;--win:#ffe08a;--palm:#3b1150;
  background:linear-gradient(180deg,#ffd9ec 0%,#ffc2d6 32%,#ffb38f calc(100% - var(--G) - 40px),#ffe39b calc(100% - var(--G)),var(--floor) calc(100% - var(--G)))}
html[data-theme="dark"] .nn-scene{--grid:rgba(255,45,149,.75);--grid2:rgba(34,228,255,.5);--floor:#12052a;--tower:#1c0a35;--win:#ffd36b;--palm:#07020f;
  background:linear-gradient(180deg,#07021a 0%,#170838 30%,#3d0f5c 58%,#a3246f calc(100% - var(--G) - 30px),#ff6f61 calc(100% - var(--G)),var(--floor) calc(100% - var(--G)))}
.nn-stars{position:absolute;left:0;top:0;width:1.6px;height:1.6px;border-radius:50%;display:none;animation:nn-twinkle 4.5s ease-in-out infinite alternate}
.nn-stars.b{animation-duration:6.5s;animation-delay:-3s}
html[data-theme="dark"] .nn-stars{display:block}
.nn-sunbox{position:absolute;left:0;right:0;top:0;bottom:var(--G);overflow:hidden}
.nn-sun{position:absolute;left:50%;bottom:calc(var(--sun) * -.08);width:var(--sun);height:var(--sun);margin-left:calc(var(--sun) * -.5);border-radius:50%;
  background:linear-gradient(180deg,#fff27a 0%,#ffb84d 38%,#ff5e9a 70%,#ff2d95 100%);
  -webkit-mask:linear-gradient(180deg,#000 52%,transparent 52% 55%,#000 55% 63%,transparent 63% 67%,#000 67% 74%,transparent 74% 79%,#000 79% 85%,transparent 85% 91%,#000 91%);
  mask:linear-gradient(180deg,#000 52%,transparent 52% 55%,#000 55% 63%,transparent 63% 67%,#000 67% 74%,transparent 74% 79%,#000 79% 85%,transparent 85% 91%,#000 91%);
  animation:nn-sun 9s ease-in-out infinite alternate}
.nn-sun i{position:absolute;inset:-30%;border-radius:50%;background:radial-gradient(circle,rgba(255,94,154,.45),transparent 62%);-webkit-mask:none;mask:none}
html[data-theme="dark"] .nn-sun{filter:drop-shadow(0 0 30px rgba(255,45,149,.55))}
.nn-city{position:absolute;left:0;bottom:var(--G);width:100%;height:calc(var(--H) * .62)}
.nn-tower{fill:var(--tower)}
.nn-tower-neon{opacity:.85;filter:drop-shadow(0 0 3px currentColor)}
.nn-win{fill:var(--win);opacity:.85;animation:nn-win 7s steps(1) infinite;animation-delay:calc(var(--i) * -0.73s)}
html:not([data-theme="dark"]) .nn-win{opacity:.6}
.nn-horizon{position:absolute;left:0;right:0;bottom:calc(var(--G) - 1px);height:3px;background:linear-gradient(90deg,transparent,#ff2d95 18%,#22e4ff 50%,#ff2d95 82%,transparent);box-shadow:0 0 14px 2px rgba(255,45,149,.6)}
.nn-grid{position:absolute;left:-40%;right:-40%;bottom:0;height:var(--G);overflow:hidden;transform:perspective(320px) rotateX(58deg);transform-origin:50% 100%;
  -webkit-mask:linear-gradient(180deg,transparent,#000 45%);mask:linear-gradient(180deg,transparent,#000 45%)}
.nn-grid-in{position:absolute;left:0;right:0;top:-64px;bottom:0;background-image:linear-gradient(var(--grid) 2px,transparent 2px),linear-gradient(90deg,var(--grid2) 2px,transparent 2px);background-size:64px 64px;animation:nn-roll 1.6s linear infinite}
.nn-palm{position:absolute;bottom:-6px;aspect-ratio:140/220;transform-origin:47% 100%;animation:nn-sway 6s ease-in-out infinite alternate}
.nn-palm.r{transform:scaleX(-1);animation-name:nn-sway-r}
.nn-palm.b{animation-duration:7.5s;animation-delay:-2s}
.nn-trunk,.nn-fronds{fill:var(--palm)}
.nn-rings{stroke:rgba(255,255,255,.08);stroke-width:2;fill:none}
html[data-theme="dark"] .nn-palm{filter:drop-shadow(0 0 1px rgba(255,45,149,.65))}

.nn-fx{position:fixed;inset:0;z-index:48;pointer-events:none;overflow:hidden}
.nn-clip{position:absolute;top:0;right:0;bottom:0;left:var(--nn-left);overflow:hidden}
.nn-tube{position:absolute;left:0;right:0;top:calc(var(--nn-top) - 1px);height:3px}
.nn-tube i{position:absolute;inset:0;border-radius:3px;background:linear-gradient(90deg,#ff2d95,#ff7ad9 30%,#22e4ff 60%,#ff2d95);box-shadow:0 0 8px 1px rgba(255,45,149,.75),0 0 18px 2px rgba(34,228,255,.35);animation:nn-buzz 1.8s steps(1) both,nn-hum 3.4s ease-in-out 1.8s infinite alternate}
.nn-cruise{position:absolute;bottom:6px;left:0;width:clamp(150px,15vw,220px);animation:nn-drive-r 7.4s cubic-bezier(.45,.05,.55,.95) both}
.nn-cruise.l{animation-name:nn-drive-l}
.nn-cruise.l .nn-bounce{transform:scaleX(-1)}
.nn-bounce{position:relative}
.nn-car-svg{display:block;width:100%;height:auto;overflow:visible;animation:nn-bump .5s ease-in-out infinite alternate;filter:drop-shadow(0 6px 10px rgba(60,10,80,.35))}
html[data-theme="dark"] .nn-car-svg{filter:drop-shadow(0 0 10px rgba(255,45,149,.45))}
.nn-beam{opacity:0}
html[data-theme="dark"] .nn-beam{opacity:1}
.nn-wheel{animation:nn-spin .35s linear infinite}
.nn-tail{filter:drop-shadow(0 0 4px #ff315f)}
.nn-speed{position:absolute;right:96%;top:42%;display:flex;flex-direction:column;gap:6px}
.nn-speed i{display:block;height:2px;width:46px;border-radius:2px;background:linear-gradient(90deg,transparent,#ff7ad9);animation:nn-streak .5s linear infinite}
.nn-speed i:nth-child(2){width:30px;margin-left:14px;background:linear-gradient(90deg,transparent,#22e4ff);animation-delay:-.2s}
.nn-speed i:nth-child(3){width:38px;margin-left:6px;animation-delay:-.35s}
.nn-flamingo{position:absolute;left:0;width:clamp(90px,8vw,130px);animation:nn-fly-r 11s linear both}
.nn-flamingo.l{animation-name:nn-fly-l}
.nn-flamingo.l .nn-glide{transform:scaleX(-1)}
.nn-glide{animation:nn-glide 2.6s ease-in-out infinite alternate}
.nn-fl-svg{display:block;width:100%;height:auto;overflow:visible;filter:drop-shadow(0 4px 6px rgba(120,20,80,.25))}
.nn-wing{transform-box:fill-box;transform-origin:20% 100%;animation:nn-flap .5s ease-in-out infinite alternate}
.nn-wing.b{transform-origin:20% 0;animation-direction:alternate-reverse}
.nn-plane{position:absolute;left:0;width:clamp(220px,22vw,330px);animation:nn-tow 16s linear both}
.nn-plane-svg{display:block;width:100%;height:auto;overflow:visible}
.nn-banner{fill:#fff;stroke:#ff2d95;stroke-width:2}
.nn-banner-t{font:900 16px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.14em;fill:#ff2d95}
.nn-prop{animation:nn-prop .12s linear infinite}
.nn-sign{position:absolute}
.nn-sign.r{right:12px;animation:nn-sign-r 6s cubic-bezier(.3,1.3,.5,1) both}
.nn-sign.l{left:12px;animation:nn-sign-l 6s cubic-bezier(.3,1.3,.5,1) both}
.nn-sign-in{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 16px 8px;border-radius:14px;background:rgba(20,6,40,.88);box-shadow:inset 0 0 0 2px #22e4ff,0 0 14px 2px rgba(34,228,255,.55),0 10px 24px rgba(0,0,0,.25);animation:nn-buzz 1.4s steps(1) .5s both}
.nn-sign-in b{font:900 22px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.16em;color:#ffe3f3;text-shadow:0 0 4px #ff2d95,0 0 10px #ff2d95,0 0 20px #ff2d95}
.nn-sign-in small{font:800 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.3em;color:#d6fbff;text-shadow:0 0 6px #22e4ff}
.nn-shoot{position:absolute;width:150px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,rgba(255,122,217,.95));transform-origin:100% 50%;opacity:0;animation:nn-shoot 1.6s ease-out both}
.nn-shoot::after{content:'';position:absolute;right:-3px;top:-3px;width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 10px 4px rgba(255,45,149,.8)}

@keyframes nn-twinkle{from{opacity:.35}to{opacity:1}}
@keyframes nn-sun{from{transform:translateY(0)}to{transform:translateY(6%)}}
@keyframes nn-win{0%,100%{opacity:.85}43%{opacity:.1}47%{opacity:.85}71%{opacity:.25}}
@keyframes nn-roll{from{transform:translateY(0)}to{transform:translateY(64px)}}
@keyframes nn-sway{from{transform:rotate(-1.6deg)}to{transform:rotate(1.8deg)}}
@keyframes nn-sway-r{from{transform:scaleX(-1) rotate(-1.6deg)}to{transform:scaleX(-1) rotate(1.8deg)}}
@keyframes nn-buzz{0%{opacity:0}8%{opacity:1}12%{opacity:.15}18%{opacity:1}24%{opacity:.3}30%,100%{opacity:1}}
@keyframes nn-hum{from{opacity:.82}to{opacity:1}}
@keyframes nn-drive-r{from{transform:translateX(-260px)}to{transform:translateX(calc(100vw + 40px))}}
@keyframes nn-drive-l{from{transform:translateX(calc(100vw + 40px))}to{transform:translateX(-260px)}}
@keyframes nn-bump{from{transform:translateY(0)}to{transform:translateY(-1.5px)}}
@keyframes nn-spin{to{transform:rotate(360deg)}}
@keyframes nn-streak{from{transform:translateX(10px);opacity:0}40%{opacity:1}to{transform:translateX(-22px);opacity:0}}
@keyframes nn-fly-r{from{transform:translateX(-160px)}to{transform:translateX(calc(100vw + 40px))}}
@keyframes nn-fly-l{from{transform:translateX(calc(100vw + 40px))}to{transform:translateX(-160px)}}
@keyframes nn-glide{from{translate:0 -6px}to{translate:0 8px}}
@keyframes nn-flap{from{transform:scaleY(1)}to{transform:scaleY(-.55)}}
@keyframes nn-tow{from{transform:translateX(-360px)}to{transform:translateX(calc(100vw + 40px))}}
@keyframes nn-prop{to{transform:scaleY(.2)}}
@keyframes nn-sign-r{0%{transform:translateX(140%) rotate(6deg)}14%{transform:translateX(0) rotate(-2deg)}20%,82%{transform:translateX(0) rotate(0)}100%{transform:translateX(140%) rotate(6deg)}}
@keyframes nn-sign-l{0%{transform:translateX(-140%) rotate(-6deg)}14%{transform:translateX(0) rotate(2deg)}20%,82%{transform:translateX(0) rotate(0)}100%{transform:translateX(-140%) rotate(-6deg)}}
@keyframes nn-shoot{0%{opacity:0;transform:translate(0,0) rotate(18deg)}15%{opacity:1}100%{opacity:0;transform:translate(34vw,11vw) rotate(18deg)}}
@media (prefers-reduced-motion:reduce){.nn-scene *,.nn-fx *{animation:none !important;transition:none !important}.nn-shoot{display:none}}
`
