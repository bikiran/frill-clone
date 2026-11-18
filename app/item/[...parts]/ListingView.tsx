'use client'

import { useEffect, useRef, useState } from 'react'

// The buyer-facing listing page: photos, price, details and the ways to reach
// the business. "Chat now" opens the business's Colvy chat on this page, so
// the conversation arrives in their inbox with the listing attached.

type Props = {
  listing: {
    title: string; code: string; price: string; condition: string; pickup: string | null
    description: string | null; photos: string[]; source: string; sold: boolean; productUrl: string | null
  }
  business: { name: string; slug: string; logo: string | null; accent: string }
  textNumber: string | null
  textNumberLabel: string | null
  callNumber: string | null
  smsBody: string
}

const I = {
  chat: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>,
  sms: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 18h4" /></svg>,
  call: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z" /></svg>,
  bag: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" /></svg>,
  pin: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>,
  tag: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>,
  left: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>,
  right: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>,
}

export default function ListingView({ listing: l, business: b, textNumber, textNumberLabel, callNumber, smsBody }: Props) {
  const [shown, setShown] = useState(0)
  const strip = useRef<HTMLDivElement>(null)
  const photos = l.photos.length ? l.photos : []

  // The business's Colvy chat, on this page. It picks the listing up from the
  // page address, and the visit (?clv=) from there too.
  useEffect(() => {
    if (document.querySelector('script[data-colvy-listing]')) return
    const s = document.createElement('script')
    s.src = '/widget.js'
    s.async = true
    s.setAttribute('data-slug', b.slug)
    s.setAttribute('data-colvy-listing', '1')
    document.body.appendChild(s)
  }, [b.slug])

  const openChat = () => {
    // After this click has finished: the widget closes itself on any click
    // outside it, which would otherwise include this one. It may also still
    // be loading, so wait for it (up to ~8 seconds).
    let tries = 0
    const go = () => {
      if (document.querySelector('iframe[src*="/widget"]')) { window.dispatchEvent(new Event('colvy:open')); return }
      if (++tries < 32) window.setTimeout(go, 250)
    }
    window.setTimeout(go, 0)
  }

  const goTo = (i: number) => {
    const n = photos.length
    if (!n) return
    const next = (i + n) % n
    setShown(next)
    const el = strip.current
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }
  const onScroll = () => {
    const el = strip.current
    if (el && el.clientWidth) setShown(Math.round(el.scrollLeft / el.clientWidth))
  }

  const withClick = (url: string) => {
    try {
      const clv = new URLSearchParams(window.location.search).get('clv')
      if (!clv) return url
      const u = new URL(url)
      u.searchParams.set('clv', clv)
      return u.toString()
    } catch { return url }
  }

  const sms = textNumber ? `sms:${textNumber}?&body=${encodeURIComponent(smsBody)}` : null
  const accent = /^#[0-9a-f]{3,8}$/i.test(b.accent) ? b.accent : '#ff6a4d'

  return (
    <div className="lv">
      <style>{`
        .lv{min-height:100vh;background:#f6f6f4;color:#0f1119;font-family:inherit}
        .lv *{box-sizing:border-box}
        .lv-top{max-width:1120px;margin:0 auto;padding:18px 20px;display:flex;align-items:center;gap:12px}
        .lv-logo{width:40px;height:40px;border-radius:12px;object-fit:cover;background:#fff;box-shadow:0 0 0 1px rgba(15,17,25,.08)}
        .lv-initial{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:17px}
        .lv-biz{font-weight:800;font-size:16px;letter-spacing:-.01em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .lv-src{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px rgba(15,17,25,.08);font-size:12.5px;font-weight:700;color:#4b5060;white-space:nowrap}
        .lv-main{max-width:1120px;margin:0 auto;padding:4px 20px 40px;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:28px;align-items:start}
        .lv-gal{min-width:0}
        .lv-frame{position:relative}
        .lv-strip{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:26px;background:#e9e9e5;aspect-ratio:4/3;scrollbar-width:none}
        .lv-strip::-webkit-scrollbar{display:none}
        .lv-strip img{flex:0 0 100%;width:100%;height:100%;object-fit:cover;scroll-snap-align:start;display:block}
        .lv-nophoto{flex:0 0 100%;display:grid;place-items:center;color:#8a8f9c;font-weight:700}
        .lv-arrow{position:absolute;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:999px;border:0;background:rgba(255,255,255,.92);box-shadow:0 6px 18px -6px rgba(15,17,25,.35);display:grid;place-items:center;cursor:pointer;color:#0f1119}
        .lv-arrow.l{left:14px}.lv-arrow.r{right:14px}
        .lv-count{position:absolute;right:14px;bottom:14px;padding:5px 10px;border-radius:999px;background:rgba(15,17,25,.72);color:#fff;font-size:12px;font-weight:700}
        .lv-thumbs{display:flex;gap:10px;margin-top:12px;overflow-x:auto;padding-bottom:4px}
        .lv-thumb{flex:0 0 74px;height:74px;border-radius:14px;overflow:hidden;border:0;padding:0;cursor:pointer;opacity:.6;transition:opacity .2s,box-shadow .2s;background:#e9e9e5}
        .lv-thumb.on{opacity:1;box-shadow:0 0 0 2.5px ${accent}}
        .lv-thumb img{width:100%;height:100%;object-fit:cover;display:block}
        .lv-card{background:#fff;border-radius:26px;padding:26px;box-shadow:0 0 0 1px rgba(15,17,25,.06),0 24px 50px -36px rgba(15,17,25,.35);position:sticky;top:20px}
        .lv-sold{display:inline-flex;padding:6px 12px;border-radius:999px;background:#0f1119;color:#fff;font-size:12.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;margin-bottom:12px}
        .lv-title{font-size:clamp(24px,3vw,32px);line-height:1.12;font-weight:900;letter-spacing:-.02em;margin:0}
        .lv-price{font-size:28px;font-weight:900;letter-spacing:-.02em;margin:10px 0 0}
        .lv-chips{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0}
        .lv-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;background:#f3f3f1;font-size:13px;font-weight:700;color:#3d4250}
        .lv-chip-src{display:none}
        .lv-btns{display:grid;gap:10px;margin-top:22px}
        .lv-btn{display:flex;align-items:center;justify-content:center;gap:9px;height:52px;border-radius:999px;border:0;font:inherit;font-size:15.5px;font-weight:800;cursor:pointer;text-decoration:none;transition:transform .15s ease,box-shadow .2s ease}
        .lv-btn:active{transform:scale(.98)}
        .lv-btn.primary{background:${accent};color:#fff;box-shadow:0 12px 26px -14px ${accent}}
        .lv-btn.soft{background:#f3f3f1;color:#0f1119}
        .lv-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .lv-note{margin:14px 0 0;font-size:13.5px;line-height:1.5;color:#5b606e}
        .lv-note b{color:#0f1119}
        .lv-desc{grid-column:1/2;background:#fff;border-radius:26px;padding:26px;box-shadow:0 0 0 1px rgba(15,17,25,.06)}
        .lv-desc h2{margin:0 0 10px;font-size:18px;font-weight:900;letter-spacing:-.01em}
        .lv-desc p{margin:0;white-space:pre-wrap;font-size:15.5px;line-height:1.65;color:#2c303b}
        .lv-foot{text-align:center;padding:10px 20px 90px;font-size:12.5px;color:#8a8f9c}
        .lv-foot a{color:inherit;font-weight:700}
        @media (max-width:860px){
          .lv-src{display:none}
          .lv-chip-src{display:inline-flex}
          .lv-main{grid-template-columns:minmax(0,1fr);gap:18px;padding:0 16px 32px}
          .lv-top{padding:14px 16px}
          .lv-card{position:static;padding:22px}
          .lv-desc{grid-column:auto;padding:22px}
          .lv-strip{border-radius:22px}
          .lv-arrow{display:none}
        }
        @media (prefers-reduced-motion:reduce){.lv-btn,.lv-thumb{transition:none}}
      `}</style>

      <header className="lv-top">
        {b.logo
          ? <img className="lv-logo" src={b.logo} alt="" />
          : <span className="lv-initial" style={{ background: accent }} aria-hidden>{(b.name || '?').trim().charAt(0).toUpperCase()}</span>}
        <span className="lv-biz">{b.name}</span>
        <span className="lv-src">{I.tag} {l.source}</span>
      </header>

      <main className="lv-main">
        <section className="lv-gal" aria-label="Photos">
          <div className="lv-frame">
            <div className="lv-strip" ref={strip} onScroll={onScroll}>
              {photos.length
                ? photos.map((src, i) => <img key={src + i} src={src} alt={`${l.title}, photo ${i + 1} of ${photos.length}`} loading={i ? 'lazy' : 'eager'} />)
                : <div className="lv-nophoto">No photos yet</div>}
            </div>
            {photos.length > 1 && (
              <>
                <button type="button" className="lv-arrow l" aria-label="Previous photo" onClick={() => goTo(shown - 1)}>{I.left}</button>
                <button type="button" className="lv-arrow r" aria-label="Next photo" onClick={() => goTo(shown + 1)}>{I.right}</button>
                <span className="lv-count" aria-live="polite">{shown + 1} / {photos.length}</span>
              </>
            )}
          </div>
          {photos.length > 1 && (
            <div className="lv-thumbs">
              {photos.map((src, i) => (
                <button key={src + i} type="button" className={`lv-thumb ${i === shown ? 'on' : ''}`} aria-label={`Show photo ${i + 1}`} aria-current={i === shown} onClick={() => goTo(i)}>
                  <img src={src} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="lv-card">
          {l.sold && <span className="lv-sold">Sold</span>}
          <h1 className="lv-title">{l.title}</h1>
          {l.price && <p className="lv-price">{l.price}</p>}
          <div className="lv-chips">
            {l.condition && <span className="lv-chip">{l.condition}</span>}
            {l.pickup && <span className="lv-chip">{I.pin} {l.pickup}</span>}
            <span className="lv-chip lv-chip-src">{I.tag} {l.source}</span>
          </div>

          <div className="lv-btns">
            <button type="button" className="lv-btn primary" onClick={openChat}>{I.chat} {l.sold ? 'Ask about something similar' : 'Chat now'}</button>
            {(sms || callNumber) && (
              <div className={sms && callNumber ? 'lv-row' : ''}>
                {sms && <a className="lv-btn soft" href={sms}>{I.sms} Text us</a>}
                {callNumber && <a className="lv-btn soft" href={`tel:${callNumber}`}>{I.call} Call</a>}
              </div>
            )}
            {l.productUrl && !l.sold && (
              <a className="lv-btn soft" href={l.productUrl} onClick={e => { e.currentTarget.href = withClick(l.productUrl as string) }}>{I.bag} Buy online</a>
            )}
          </div>
          {textNumberLabel && !l.sold && (
            <p className="lv-note">Texting? Send <b>{l.code}</b> to <b>{textNumberLabel}</b> so we know which one you mean.</p>
          )}
          {l.sold && <p className="lv-note">This one has sold. Chat with us and we’ll let you know what else we have.</p>}
        </aside>

        {l.description && (
          <section className="lv-desc">
            <h2>About this item</h2>
            <p>{l.description}</p>
          </section>
        )}
      </main>

      <footer className="lv-foot">Questions and replies through <a href="https://colvy.com" target="_blank" rel="noopener">Colvy</a></footer>
    </div>
  )
}
