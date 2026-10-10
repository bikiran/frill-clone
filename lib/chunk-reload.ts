// A deploy replaces the app's JS files. A tab still running the previous version
// then asks for a file that no longer exists ("Failed to load chunk …"). The fix
// is simply loading the new version — so the error screens do that once,
// automatically, instead of showing a dead end.

const KEY = 'colvy-chunk-reload-at'

export function isChunkLoadError(error: any): boolean {
  const text = `${error?.name || ''} ${error?.message || error || ''}`
  return /ChunkLoadError|Failed to load chunk|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text)
}

// Reload once. If the page already reloaded for this in the last 30 seconds,
// don't loop — return false so the screen offers the button instead.
export function reloadForNewVersion(force = false): boolean {
  if (typeof window === 'undefined') return false
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (!force && Date.now() - last < 30_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {}
  window.location.reload()
  return true
}
