export const getRelativeTime = (date: string | Date): string => {
  const now = new Date()
  // Naive DB timestamps ("2026-07-08 08:00:00") parse as LOCAL time in JS,
  // making just-posted ideas show "10 hours ago" in UTC+10. Treat them as UTC.
  let time: Date
  if (typeof date === 'string') {
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(date)
    time = new Date(hasTz ? date : date.replace(' ', 'T') + 'Z')
  } else {
    time = new Date(date)
  }
  const secondsAgo = Math.max(0, Math.floor((now.getTime() - time.getTime()) / 1000))

  if (secondsAgo < 30) return 'a few moments ago'
  if (secondsAgo < 60) return 'a few seconds ago'
  if (secondsAgo < 120) return 'a minute ago'
  
  const minutesAgo = Math.floor(secondsAgo / 60)
  if (minutesAgo < 60) return `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`
  
  const hoursAgo = Math.floor(minutesAgo / 60)
  if (hoursAgo < 24) return `${hoursAgo} hour${hoursAgo > 1 ? 's' : ''} ago`
  
  const daysAgo = Math.floor(hoursAgo / 24)
  if (daysAgo === 1) return 'yesterday'
  if (daysAgo < 7) return `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`
  
  const weeksAgo = Math.floor(daysAgo / 7)
  if (weeksAgo === 1) return '1 week ago'
  if (weeksAgo < 4) return `${weeksAgo} week${weeksAgo > 1 ? 's' : ''} ago`
  
  // After a month, show concrete date
  return time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: time.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}
