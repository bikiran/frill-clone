/**
 * Format timestamp as relative time (e.g., "just now", "2 hours ago")
 */
export function getRelativeTime(dateString: string | Date): string {
  // DB TIMESTAMP columns come back WITHOUT timezone info (e.g. "2026-07-08 08:00:00").
  // new Date() parses those as LOCAL time, which made a just-posted idea show
  // "10 hours ago" for users in UTC+10. Treat naive timestamps as UTC.
  let date: Date
  if (typeof dateString === 'string') {
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(dateString)
    date = new Date(hasTz ? dateString : dateString.replace(' ', 'T') + 'Z')
  } else {
    date = dateString
  }
  const now = new Date()
  const diff = Math.max(0, now.getTime() - date.getTime())
  
  // Convert to seconds
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (seconds < 30) return 'just now'
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) !== 1 ? 's' : ''} ago`
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) !== 1 ? 's' : ''} ago`
  
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) !== 1 ? 's' : ''} ago`
}

/**
 * Get user display name - shows account name if logged in, otherwise anonymous
 * Respects company settings for guest feedback visibility
 */
export function getUserDisplayName(
  userId: string | null,
  userName: string | null,
  userEmail: string | null,
  allowGuestFeedback: boolean
): string {
  if (userId && userName) {
    return userName
  }
  
  if (userId && userEmail) {
    return userEmail.split('@')[0]
  }
  
  if (allowGuestFeedback) {
    return 'Anonymous'
  }
  
  return 'Guest User'
}
