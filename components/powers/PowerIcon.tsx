// Line icons for Colvy Powers (24px grid, currentColor), and the coin.

const PATHS: Record<string, string[]> = {
  pin: ['M9 3.5h6l-1 5 3.5 3.5H6.5L10 8.5z', 'M12 12v8.5'],
  nudge: ['M8 13V6.5a1.5 1.5 0 0 1 3 0V12', 'M11 11V5a1.5 1.5 0 0 1 3 0v6', 'M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.6-2.2L4 15.4a1.5 1.5 0 0 1 2.3-1.9L8 15'],
  crown: ['M4 8l4 4 4-7 4 7 4-4-1.5 10h-13z', 'M5.5 21h13'],
  confetti: ['M4 20l5-13 8 8z', 'M14 4.5l1 1M18.5 8.5l1-1M16 3l-.5 2M20 6l-2 .5', 'M7.5 13.5l3 3'],
  shield: ['M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z', 'M9.5 12h5'],
  bolt: ['M13 2.5 4.5 13.5H12L11 21.5l8.5-11H12z'],
  spot: ['M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z'],
  flame: ['M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4-3-6-4-9.5-2 2-2.5 4-2.5 5.5-1-1-1.5-2-1.5-3.5-2.5 2-5 4.5-5 7.5A6.5 6.5 0 0 0 12 21z'],
  rocket: ['M12 15l-3-3c1.5-5 4.5-8 10-8.5-.5 5.5-3.5 8.5-8.5 10z', 'M9 12l-4-1 2.5-3h4', 'M12 15l1 4 3-2.5v-4', 'M6.5 17.5c-1 1-1.5 3-1.5 3s2-.5 3-1.5'],
  status: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8', 'M9 9.5h.01M15 9.5h.01'],
  gift: ['M4 11h16v9.5a.5.5 0 0 1-.5.5h-15a.5.5 0 0 1-.5-.5z', 'M3 7.5h18V11H3z', 'M12 7.5V21', 'M12 7.5S10.5 3 8 3.5 7 7.5 12 7.5zM12 7.5S13.5 3 16 3.5s1 4-4 4z'],
  box: ['M12 3 20 7.5v9L12 21l-8-4.5v-9z', 'M4 7.5 12 12l8-4.5', 'M12 12v9', 'M10 5.5l8 4.5'],
  thanks: ['M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z'],
  trophy: ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4', 'M12 13v4', 'M8.5 20.5h7', 'M10 17h4v3.5h-4z'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'M12 12h.01'],
}

export function PowerIcon({ name, size = 20, stroke = 1.8 }: { name: string; size?: number; stroke?: number }) {
  const d = PATHS[name] || PATHS.spot
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

/** The Colvy Coin: a small gold disc with a ring and a C. */
export function Coin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id="cvcoin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd75e" /><stop offset="1" stopColor="#f2a900" /></linearGradient>
      </defs>
      <circle cx="10" cy="10" r="9.2" fill="url(#cvcoin)" />
      <circle cx="10" cy="10" r="6.6" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.1" />
      <path d="M12.3 7.6a3.2 3.2 0 1 0 0 4.8" fill="none" stroke="#8a5a00" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

/** A thin progress ring with the level in the middle. */
export function LevelRing({ level, progress, size = 26, stroke = 3, color = 'var(--coral)' }: { level: number; progress: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress || 0))
  return (
    <span className="pw-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }} />
      </svg>
      <b style={{ fontSize: Math.max(9, size * 0.38) }}>{level}</b>
    </span>
  )
}
