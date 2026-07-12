/**
 * Colvy Feedback Widget — embed with:
 * <script src="https://colvy.com/widget.js" data-slug="your-slug" async></script>
 */
(function () {
  var script = document.currentScript || document.querySelector('script[data-slug]')
  var slug = script ? script.getAttribute('data-slug') : null
  if (!slug) { console.warn('[Colvy] data-slug attribute missing'); return }

  var BASE = 'https://colvy.com'
  // The widget runs in an iframe, so it can't see the host page's URL by itself.
  // Pass the REAL parent page URL + title (this script runs on the business site).
  function parentInfo() {
    try {
      return {
        url: window.location.href,
        title: document.title || '',
      }
    } catch (e) { return { url: '', title: '' } }
  }
  var pi = parentInfo()
  var WIDGET_URL = BASE + '/widget?slug=' + encodeURIComponent(slug)
    + '&purl=' + encodeURIComponent(pi.url)
    + '&ptitle=' + encodeURIComponent(pi.title)

  // Config (populated from /api/widget-data): default is CHAT ICON ONLY.
  var cfg = { mode: 'icon', label: 'Chat with us', color: '#ff7a6b', position: 'bottom-right', offsetX: '24', offsetXUnit: 'px', offsetY: '24', offsetYUnit: 'px' }

  function applyPosition() {
    var ox = (cfg.offsetX || '24') + (cfg.offsetXUnit || 'px')
    var oy = (cfg.offsetY || '24') + (cfg.offsetYUnit || 'px')
    var pos = cfg.position || 'bottom-right'
    var isLeft = pos.indexOf('left') !== -1
    var isTop = pos.indexOf('top') !== -1
    var isMiddle = pos.indexOf('middle') !== -1 || pos.indexOf('center') !== -1
    // Reset
    btn.style.left = btn.style.right = btn.style.top = btn.style.bottom = 'auto'
    popup.style.left = popup.style.right = popup.style.top = popup.style.bottom = 'auto'
    btn.style.transform = ''
    popup.style.transform = ''
    // Horizontal
    if (isLeft) { btn.style.left = ox; popup.style.left = ox }
    else { btn.style.right = ox; popup.style.right = ox }
    // Vertical: top / middle / bottom
    if (isMiddle) {
      btn.style.top = '50%'; btn.style.transform = 'translateY(-50%)'
      popup.style.top = '50%'; popup.style.transform = 'translateY(-50%)'
    } else if (isTop) {
      btn.style.top = oy
      // Popup hangs below the bubble when it's at the top.
      popup.style.top = 'calc(' + oy + ' + 68px)'
    } else {
      btn.style.bottom = oy
      popup.style.bottom = 'calc(' + oy + ' + 68px)'
    }
    popup.style.transformOrigin = (isMiddle ? 'center ' : (isTop ? 'top ' : 'bottom ')) + (isLeft ? 'left' : 'right')
  }

  var CHAT_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  var CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'

  // Inject styles. Icon-only mode is a round button; icon+label is a pill.
  var style = document.createElement('style')
  style.textContent = [
    '#colvy-btn{position:fixed;z-index:999998;display:flex;align-items:center;gap:8px;border:none;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;font-weight:700;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.18);transition:transform 0.2s,box-shadow 0.2s;touch-action:none;user-select:none;-webkit-user-select:none}',
    // Children must not swallow clicks — this made the bubble only clickable on
    // certain spots. The whole button is now a reliable hit target.
    '#colvy-btn *{pointer-events:none}',
    '#colvy-btn.icon{width:56px;height:56px;border-radius:999px;justify-content:center;padding:0}',
    '#colvy-btn.pill{padding:12px 18px;border-radius:999px}',
    '#colvy-btn:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,0.22)}',
    '#colvy-btn.dragging{cursor:grabbing;transition:none;transform:scale(1.06);box-shadow:0 12px 36px rgba(0,0,0,0.28)}',
    '#colvy-popup{position:fixed;z-index:999999;width:360px;height:540px;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.2),0 0 0 1px rgba(0,0,0,0.06);overflow:hidden;border:none;transform-origin:bottom right;transition:transform 0.25s cubic-bezier(0.16,1,0.3,1),opacity 0.2s,width 0.22s ease,height 0.22s ease;opacity:0;transform:scale(0.85) translateY(12px);pointer-events:none}',
    '#colvy-popup.open{opacity:1;transform:scale(1) translateY(0);pointer-events:all}',
    // Size modes driven by the widget header buttons.
    '#colvy-popup.compact{width:320px;height:440px}',
    '#colvy-popup.expanded{width:440px;height:660px}',
    '#colvy-popup.fullscreen{width:100vw!important;height:100vh!important;top:0!important;left:0!important;right:auto!important;bottom:auto!important;border-radius:0;transform:none!important}',
    '@media(max-width:480px){#colvy-popup{width:calc(100vw - 24px);height:70vh;bottom:84px;right:12px;left:12px}#colvy-btn{bottom:16px;right:16px}}',
  ].join('')
  document.head.appendChild(style)

  // Launcher button
  var btn = document.createElement('button')
  btn.id = 'colvy-btn'

  function renderBtn(isOpen) {
    var iconOnly = cfg.mode !== 'icon_label'
    btn.className = iconOnly ? 'icon' : 'pill'
    if (isOpen) {
      btn.innerHTML = CLOSE_ICON + (iconOnly ? '' : '<span>Close</span>')
    } else {
      btn.innerHTML = CHAT_ICON + (iconOnly ? '' : '<span>' + (cfg.label || 'Chat with us') + '</span>')
    }
  }
  renderBtn(false)

  // Iframe popup
  var popup = document.createElement('iframe')
  popup.id = 'colvy-popup'
  popup.src = WIDGET_URL
  popup.allow = 'clipboard-write'
  popup.setAttribute('loading', 'lazy')

  var open = false
  function toggle() {
    open = !open
    if (open) { popup.classList.add('open'); renderBtn(true); clearBadge(); notifyOpen(true) }
    else { popup.classList.remove('open'); popup.classList.remove('fullscreen', 'expanded', 'compact'); btn.style.display = ''; applyPosition(); renderBtn(false); notifyOpen(false) }
  }

  // ── Drag the bubble to any of 6 zones ─────────────────────────────────────
  // Visitors can reposition the launcher: top/middle/bottom × left/right. The
  // choice is remembered per site. A drag must NOT trigger the open/close click.
  var POSITIONS = ['top-left','top-right','middle-left','middle-right','bottom-left','bottom-right']
  var dragging = false, moved = false, startX = 0, startY = 0

  function savedPosition() {
    try {
      var p = localStorage.getItem('colvy_bubble_pos')
      if (p && POSITIONS.indexOf(p) !== -1) return p
    } catch (e) {}
    return null
  }
  function savePosition(p) { try { localStorage.setItem('colvy_bubble_pos', p) } catch (e) {} }

  // Snap the bubble to the nearest zone based on where it was dropped.
  function snapZone(x, y) {
    var vw = window.innerWidth, vh = window.innerHeight
    var horiz = x < vw / 2 ? 'left' : 'right'
    var vert = y < vh / 3 ? 'top' : (y > (vh * 2) / 3 ? 'bottom' : 'middle')
    return vert + '-' + horiz
  }

  function onDragStart(e) {
    dragging = true; moved = false
    var pt = e.touches ? e.touches[0] : e
    startX = pt.clientX; startY = pt.clientY
    btn.classList.add('dragging')
  }
  function onDragMove(e) {
    if (!dragging) return
    var pt = e.touches ? e.touches[0] : e
    var dx = pt.clientX - startX, dy = pt.clientY - startY
    // Only count as a drag once past a small threshold, so taps still open it.
    if (!moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return
    moved = true
    e.preventDefault && e.preventDefault()
    // Follow the finger/cursor freely while dragging.
    btn.style.left = (pt.clientX - btn.offsetWidth / 2) + 'px'
    btn.style.top = (pt.clientY - btn.offsetHeight / 2) + 'px'
    btn.style.right = 'auto'; btn.style.bottom = 'auto'; btn.style.transform = 'scale(1.06)'
  }
  function onDragEnd(e) {
    if (!dragging) return
    dragging = false
    btn.classList.remove('dragging')
    if (!moved) return // it was a tap → the click handler opens the widget
    var pt = (e.changedTouches ? e.changedTouches[0] : e)
    var zone = snapZone(pt.clientX, pt.clientY)
    cfg.position = zone
    savePosition(zone)
    btn.style.transform = ''
    applyPosition()
  }

  btn.addEventListener('mousedown', onDragStart)
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  btn.addEventListener('touchstart', onDragStart, { passive: true })
  window.addEventListener('touchmove', onDragMove, { passive: false })
  window.addEventListener('touchend', onDragEnd)

  btn.addEventListener('click', function (e) {
    // Suppress the click that ends a drag.
    if (moved) { moved = false; e.preventDefault(); e.stopPropagation(); return }
    toggle()
  })

  // Unread badge shown on the bubble when an agent replies while closed.
  var badge = document.createElement('span')
  badge.id = 'colvy-badge'
  badge.style.cssText = 'position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;line-height:18px;text-align:center;display:none;box-shadow:0 1px 4px rgba(0,0,0,0.3);font-family:-apple-system,sans-serif'
  btn.style.position = btn.style.position || 'fixed'
  btn.appendChild(badge)
  var unread = 0
  function showBadge(n) { unread = n; badge.textContent = n > 9 ? '9+' : String(n); badge.style.display = 'block' }
  function clearBadge() { unread = 0; badge.style.display = 'none' }

  function notifyOpen(isOpen) {
    try { if (popup.contentWindow) popup.contentWindow.postMessage({ colvy: true, type: 'widget_open', open: isOpen }, BASE) } catch (e) {}
  }

  // Listen for signals from the widget iframe (new agent messages, etc).
  window.addEventListener('message', function (e) {
    var d = e.data
    if (!d || !d.colvy) return
    // The iframe can ask for the current parent page (fallback if purl wasn't
    // in the initial src, e.g. cached old iframe). Reply with the real URL.
    if (d.type === 'request_parent_page') { sendPage(); return }
    if (d.type === 'size') { setSize(d.mode); return }
    if (d.type === 'close') { if (open) toggle(); setSize('normal'); return }
    if (d.type === 'new_message' && !open) {
      // Agent replied while the widget is closed: badge it and gently bounce.
      showBadge((unread || 0) + (d.count || 1))
      btn.animate ? btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 420 }) : null
      if (d.autoOpen) { toggle() } // optional auto-open if the widget requests it
    }
    if (d.type === 'request_open' && !open) toggle()
  })

  document.addEventListener('click', function (e) {
    if (open && !btn.contains(e.target) && !popup.contains(e.target)) {
      open = false; popup.classList.remove('open'); renderBtn(false)
    }
  })

  // Load config: accent colour + bubble mode/label from company settings.
  fetch(BASE + '/api/widget-data?slug=' + encodeURIComponent(slug))
    .then(function (r) { return r.json() })
    .then(function (d) {
      if (d.company && d.company.accent_color) cfg.color = d.company.accent_color
      var wc = d.company && d.company.widget_config ? d.company.widget_config : {}
      if (wc.bubble_mode) cfg.mode = wc.bubble_mode
      if (wc.text) cfg.label = wc.text
      if (wc.color) cfg.color = wc.color
      btn.style.background = cfg.color
      renderBtn(open)
      if (wc.bubble_position) cfg.position = wc.bubble_position
      if (wc.offset_x !== undefined) cfg.offsetX = wc.offset_x
      if (wc.offset_x_unit) cfg.offsetXUnit = wc.offset_x_unit
      if (wc.offset_y !== undefined) cfg.offsetY = wc.offset_y
      if (wc.offset_y_unit) cfg.offsetYUnit = wc.offset_y_unit
      applyPosition()
    })
    .catch(function () { btn.style.background = cfg.color })

  function mount() {
    document.body.appendChild(btn); document.body.appendChild(popup)
    // Restore the visitor's dragged position, if they set one.
    var sp = savedPosition()
    if (sp) cfg.position = sp
    applyPosition()
  }

  // Size modes: normal | compact | expanded | fullscreen (driven from the
  // widget's own header buttons inside the iframe).
  function setSize(mode) {
    popup.classList.remove('compact', 'expanded', 'fullscreen')
    if (mode === 'compact' || mode === 'expanded' || mode === 'fullscreen') {
      popup.classList.add(mode)
    }
    if (mode === 'fullscreen') {
      // Hide the launcher so it doesn't float over the full-screen panel.
      btn.style.display = 'none'
    } else {
      btn.style.display = ''
      applyPosition()
    }
  }

  // ── Page history ─────────────────────────────────────────────────────────
  // This script runs on the BUSINESS site, so it can see the real URLs (the
  // widget iframe cannot). Record every page the visitor views and hand the
  // whole history to the widget, so agents see the real journey.
  var PAGE_KEY = 'colvy_page_history'

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(PAGE_KEY)
      var arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr : []
    } catch (e) { return [] }
  }

  function recordPage() {
    try {
      var info = parentInfo()
      if (!info.url) return loadHistory()
      var hist = loadHistory()
      var last = hist[hist.length - 1]
      // Skip consecutive duplicates (e.g. hash changes on the same page).
      if (!last || last.url !== info.url) {
        hist.push({ url: info.url, title: info.title || '', ts: new Date().toISOString() })
        // Keep it bounded.
        if (hist.length > 50) hist = hist.slice(hist.length - 50)
        sessionStorage.setItem(PAGE_KEY, JSON.stringify(hist))
      }
      return hist
    } catch (e) { return loadHistory() }
  }

  // Record the page we loaded on, immediately.
  recordPage()

  function sendPage() {
    try {
      var hist = recordPage()
      var info = parentInfo()
      if (popup && popup.contentWindow) {
        popup.contentWindow.postMessage({
          colvy: true, type: 'page',
          url: info.url, title: info.title,
          history: hist,
        }, BASE)
      }
    } catch (e) {}
  }

  window.addEventListener('load', sendPage)

  // CRITICAL: the iframe may not exist yet when 'load' fires, so the postMessage
  // would go nowhere and the widget would never learn the real page URL (which is
  // why Page History kept showing the Colvy widget URL). Send again as soon as
  // the iframe itself has loaded, and retry a few times to cover slow starts.
  popup.addEventListener('load', function () {
    sendPage()
    var tries = 0
    var iv = setInterval(function () {
      tries++
      sendPage()
      if (tries >= 3) clearInterval(iv)
    }, 700)
  })
  // Detect SPA navigations (pushState/replaceState/popstate) and hash changes.
  try {
    var _ps = history.pushState, _rs = history.replaceState
    history.pushState = function () { _ps.apply(this, arguments); setTimeout(sendPage, 50) }
    history.replaceState = function () { _rs.apply(this, arguments); setTimeout(sendPage, 50) }
    window.addEventListener('popstate', function () { setTimeout(sendPage, 50) })
    window.addEventListener('hashchange', function () { setTimeout(sendPage, 50) })
  } catch (e) {}
  if (document.readyState !== 'loading') mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
