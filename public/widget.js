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
    var isCenter = pos.indexOf('center') !== -1
    // Reset
    btn.style.left = btn.style.right = btn.style.top = btn.style.bottom = 'auto'
    popup.style.left = popup.style.right = popup.style.top = popup.style.bottom = 'auto'
    popup.style.transform = ''
    // Horizontal
    if (isLeft) { btn.style.left = ox; popup.style.left = ox }
    else { btn.style.right = ox; popup.style.right = ox }
    // Vertical
    if (isCenter) {
      btn.style.top = '50%'; btn.style.transform = 'translateY(-50%)'
      popup.style.top = '50%'; popup.style.transform = 'translateY(-50%)'
    } else {
      btn.style.bottom = oy
      popup.style.bottom = 'calc(' + oy + ' + 68px)'
    }
    popup.style.transformOrigin = (isCenter ? 'center ' : 'bottom ') + (isLeft ? 'left' : 'right')
  }

  var CHAT_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  var CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'

  // Inject styles. Icon-only mode is a round button; icon+label is a pill.
  var style = document.createElement('style')
  style.textContent = [
    '#colvy-btn{position:fixed;z-index:999998;display:flex;align-items:center;gap:8px;border:none;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;font-weight:700;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.18);transition:transform 0.2s,box-shadow 0.2s}',
    '#colvy-btn.icon{width:56px;height:56px;border-radius:999px;justify-content:center;padding:0}',
    '#colvy-btn.pill{padding:12px 18px;border-radius:999px}',
    '#colvy-btn:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,0.22)}',
    '#colvy-popup{position:fixed;z-index:999999;width:360px;height:540px;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.2),0 0 0 1px rgba(0,0,0,0.06);overflow:hidden;border:none;transform-origin:bottom right;transition:transform 0.25s cubic-bezier(0.16,1,0.3,1),opacity 0.2s;opacity:0;transform:scale(0.85) translateY(12px);pointer-events:none}',
    '#colvy-popup.open{opacity:1;transform:scale(1) translateY(0);pointer-events:all}',
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
    else { popup.classList.remove('open'); renderBtn(false); notifyOpen(false) }
  }
  btn.addEventListener('click', toggle)

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

  function mount() { document.body.appendChild(btn); document.body.appendChild(popup); applyPosition() }

  // Keep the widget informed of the parent page as the visitor navigates, so the
  // conversation's Page History reflects the real business-site pages (not the
  // Colvy iframe URL). Fires on load and on SPA route changes.
  function sendPage() {
    try {
      var info = parentInfo()
      if (popup && popup.contentWindow) {
        popup.contentWindow.postMessage({ colvy: true, type: 'page', url: info.url, title: info.title }, BASE)
      }
    } catch (e) {}
  }
  window.addEventListener('load', sendPage)
  // Detect SPA navigations (pushState/replaceState/popstate).
  try {
    var _ps = history.pushState, _rs = history.replaceState
    history.pushState = function () { _ps.apply(this, arguments); setTimeout(sendPage, 50) }
    history.replaceState = function () { _rs.apply(this, arguments); setTimeout(sendPage, 50) }
    window.addEventListener('popstate', function () { setTimeout(sendPage, 50) })
  } catch (e) {}
  if (document.readyState !== 'loading') mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
