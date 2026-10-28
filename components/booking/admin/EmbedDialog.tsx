'use client'

import { useState } from 'react'
import { Modal, input, label, hint } from './shared'

// Copy-paste snippets for putting booking on the business's own website:
// an inline booking page that sizes itself, or a "Book now" button.

export default function EmbedDialog({ bookingUrl, services, onClose, flash }: {
  bookingUrl: string; services: { id: string; name: string; slug: string }[]; onClose: () => void; flash: (m: string) => void
}) {
  const [kind, setKind] = useState<'inline' | 'button'>('inline')
  const [service, setService] = useState('')
  const [color, setColor] = useState('#ff7a6b')
  const [text, setText] = useState('Book now')
  const url = service ? `${bookingUrl}/${service}` : bookingUrl
  const id = 'colvy-booking'

  const inline = `<iframe id="${id}" src="${url}?embed=1" title="Book online" style="width:100%;min-height:720px;border:0;display:block" loading="lazy"></iframe>
<script>
  window.addEventListener('message', function (e) {
    var f = document.getElementById('${id}');
    if (!f) return;
    if (e.data && e.data.type === 'colvy-booking-height') {
      f.style.height = e.data.height + 'px';
    }
    // A Reel / QR link that led to this page (?clv=): hand it to the booking page.
    var m = /[?&]clv=([^&#]+)/.exec(location.search);
    if (m && e.data && e.data.type === 'clv_request' && e.source === f.contentWindow) {
      f.contentWindow.postMessage({ colvy: true, type: 'clv', clv: decodeURIComponent(m[1]) }, e.origin);
    }
  });
</script>`
  const button = `<a href="${url}?src=link" target="_blank" rel="noopener"
   style="display:inline-block;padding:12px 22px;border-radius:12px;background:${color};color:#fff;font:600 15px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none">
  ${text.replace(/</g, '&lt;')}
</a>`
  const code = kind === 'inline' ? inline : button

  return (
    <Modal title="Add booking to your website" onClose={onClose} width={640}
      footer={<><button onClick={onClose} className="cv-btn">Done</button><button onClick={() => navigator.clipboard?.writeText(code).then(() => flash('Code copied — paste it into your website')).catch(() => {})} className="cv-btn cv-btn-primary">Copy code</button></>}>
      <div role="tablist" style={{ display: 'flex', gap: 2, background: '#f4f4f5', borderRadius: 999, padding: 3, marginBottom: 16, width: 'fit-content', maxWidth: '100%' }}>
        {([['inline', 'Booking page on your site'], ['button', '“Book now” button']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} style={{ height: 32, border: 'none', borderRadius: 999, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', background: kind === k ? '#fff' : 'transparent', boxShadow: kind === k ? '0 1px 3px rgba(0,0,0,.1), 0 0 0 .5px rgba(0,0,0,.04)' : 'none', color: kind === k ? 'var(--ink,#111)' : '#52525b' }}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 14 }}>
        <div>
          <span style={label}>Service</span>
          <select value={service} onChange={e => setService(e.target.value)} style={input}>
            <option value="">All services</option>
            {services.map(s => <option key={s.id} value={s.slug}>{s.name}</option>)}
          </select>
        </div>
        {kind === 'button' && (
          <>
            <div><span style={label}>Button text</span><input value={text} onChange={e => setText(e.target.value.slice(0, 40))} style={input} /></div>
            <div><span style={label}>Colour</span><input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ ...input, padding: 3, height: 36 }} /></div>
          </>
        )}
      </div>
      {kind === 'button' && (
        <div style={{ padding: 22, borderRadius: 16, background: '#fafafa', textAlign: 'center', marginBottom: 14 }}>
          <span style={{ display: 'inline-block', padding: '12px 22px', borderRadius: 12, background: color, color: '#fff', fontWeight: 600, fontSize: 15 }}>{text}</span>
        </div>
      )}
      <pre style={{ margin: 0, padding: 16, borderRadius: 16, background: '#18181b', color: '#e2e8f0', fontSize: 12, lineHeight: 1.55, overflowX: 'auto', whiteSpace: 'pre' }}>{code}</pre>
      <div style={hint}>
        {kind === 'inline'
          ? 'Paste it where the booking page should appear (WordPress: a “Custom HTML” block). It grows to fit as customers move through the steps; card payments open Stripe in the full window.'
          : 'Paste it anywhere — header, footer, a product page. It opens your booking page in a new tab.'}
      </div>
    </Modal>
  )
}
