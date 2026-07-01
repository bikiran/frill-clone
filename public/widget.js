/**
 * Colvy Feedback Widget — embed with:
 * <script src="https://colvy.com/widget.js" data-slug="your-slug" async></script>
 */
(function () {
  var script = document.currentScript || document.querySelector('script[data-slug]')
  var slug = script ? script.getAttribute('data-slug') : null
  if (!slug) { console.warn('[Colvy] data-slug attribute missing'); return }

  var BASE = 'https://colvy.com'
  var WIDGET_URL = BASE + '/widget?slug=' + encodeURIComponent(slug)

  // Inject styles
  var style = document.createElement('style')
  style.textContent = [
    '#colvy-btn{position:fixed;bottom:24px;right:24px;z-index:999998;display:flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;border:none;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;font-weight:700;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.18);transition:transform 0.2s,box-shadow 0.2s}',
    '#colvy-btn:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,0.22)}',
    '#colvy-popup{position:fixed;bottom:88px;right:24px;z-index:999999;width:360px;height:540px;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.2),0 0 0 1px rgba(0,0,0,0.06);overflow:hidden;border:none;transform-origin:bottom right;transition:transform 0.25s cubic-bezier(0.16,1,0.3,1),opacity 0.2s;opacity:0;transform:scale(0.85) translateY(12px);pointer-events:none}',
    '#colvy-popup.open{opacity:1;transform:scale(1) translateY(0);pointer-events:all}',
    '@media(max-width:480px){#colvy-popup{width:calc(100vw - 24px);height:70vh;bottom:80px;right:12px;left:12px}#colvy-btn{bottom:16px;right:16px}}',
  ].join('')
  document.head.appendChild(style)

  // Launcher button
  var btn = document.createElement('button')
  btn.id = 'colvy-btn'
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Give feedback</span>'

  // Iframe popup
  var popup = document.createElement('iframe')
  popup.id = 'colvy-popup'
  popup.src = WIDGET_URL
  popup.allow = 'clipboard-write'
  popup.setAttribute('loading', 'lazy')

  var open = false
  function toggle() {
    open = !open
    if (open) {
      popup.classList.add('open')
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span>Close</span>'
    } else {
      popup.classList.remove('open')
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Give feedback</span>'
    }
  }
  btn.addEventListener('click', toggle)

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (open && !btn.contains(e.target) && !popup.contains(e.target)) {
      open = false
      popup.classList.remove('open')
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Give feedback</span>'
    }
  })

  // Apply accent color from company data
  fetch(BASE + '/api/widget-data?slug=' + encodeURIComponent(slug))
    .then(function (r) { return r.json() })
    .then(function (d) {
      var color = d.company && d.company.accent_color ? d.company.accent_color : '#ff7a6b'
      btn.style.background = color
    })
    .catch(function () { btn.style.background = '#ff7a6b' })

  // Mount
  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(btn)
    document.body.appendChild(popup)
  })
  if (document.readyState !== 'loading') {
    document.body.appendChild(btn)
    document.body.appendChild(popup)
  }
})()
