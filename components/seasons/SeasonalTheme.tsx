'use client'

// Plays the seasonal theme that's running (lib/seasonal-themes): its scene and
// effects load only while it's on, so a normal day costs nothing.

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { currentSeason, setAppearance, subscribeAppearance, type SeasonId } from '@/lib/seasonal-themes'

const Halloween = dynamic(() => import('./Halloween'), { ssr: false })
const Christmas = dynamic(() => import('./Christmas'), { ssr: false })

export default function SeasonalTheme() {
  const pathname = usePathname() || '/'
  const [season, setSeason] = useState<SeasonId | null>(null)
  const [calm, setCalm] = useState(false)

  useEffect(() => {
    const sync = () => setSeason(currentSeason()?.def.id || null)
    const off = subscribeAppearance(sync)
    // The page decides too (the admin, the board, or a plain page like checkout).
    setAppearance({})
    return off
  }, [pathname])

  useEffect(() => {
    // A dated theme starts and ends on its own while the tab stays open.
    const t = setInterval(() => setAppearance({}), 30 * 60 * 1000)
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMq = () => setCalm(mq.matches)
    onMq(); mq.addEventListener('change', onMq)
    return () => { clearInterval(t); mq.removeEventListener('change', onMq) }
  }, [])

  if (season === 'halloween') return <Halloween calm={calm} />
  if (season === 'christmas') return <Christmas calm={calm} />
  return null
}
