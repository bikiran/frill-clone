'use client'

// The Social links block's settings: tap a logo to add that network, type a
// handle or paste a link (the logo follows a pasted link: a TikTok link in
// any row becomes TikTok), pick how the icons look. The business's own
// links (last email, connected accounts, website) are a tap away.

import { useEffect, useRef, useState } from 'react'
import { DIcon } from './icons'
import type { SocialLink, SocialLook } from './types'
import { MAX_SOCIAL_LINKS, SOCIAL, SOCIAL_LOOKS, SOCIAL_NETWORKS, detectNetwork, prettyUrl, socialIconPath, socialLook, socialUrl, type Network } from './social'

const Logo = ({ network, look = 'brand', size = 28 }: { network: Network; look?: SocialLook; size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={socialIconPath(network, look)} width={size} height={size} alt="" aria-hidden="true" className="eds-logo" draggable={false} />
)

export default function SocialFields({ links, look, suggestions, update }: {
  links: SocialLink[]
  look?: SocialLook
  suggestions?: SocialLink[]
  update: (p: { links?: SocialLink[]; look?: SocialLook }) => void
}) {
  const [focusAt, setFocusAt] = useState<number | null>(null)
  const [paste, setPaste] = useState('')
  const [pasteErr, setPasteErr] = useState('')
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const current = socialLook(look)
  const full = links.length >= MAX_SOCIAL_LINKS

  useEffect(() => {
    if (focusAt == null) return
    inputs.current[focusAt]?.focus()
    setFocusAt(null)
  }, [focusAt, links.length])

  const setLinks = (next: SocialLink[]) => update({ links: next })
  const setRow = (i: number, patch: Partial<SocialLink>) => setLinks(links.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const addLink = (l: SocialLink, focus = true) => {
    if (full) return
    setLinks([...links, l])
    if (focus && !l.url) setFocusAt(links.length)
  }
  // A logo already in the list takes you to its row; otherwise it adds one.
  const tapNetwork = (n: Network) => {
    const at = links.findIndex(l => l.network === n && !l.url.trim())
    const has = links.findIndex(l => l.network === n)
    if (at >= 0) setFocusAt(at)
    else if (has >= 0 && n !== 'website') setFocusAt(has)
    else addLink({ network: n, url: '' })
  }
  const typed = (i: number, v: string) => {
    // A link from another network moves the row to it.
    const found = detectNetwork(v)
    setRow(i, found && found !== links[i].network ? { url: v, network: found } : { url: v })
  }
  const tidy = (i: number) => {
    const l = links[i]; if (!l?.url.trim()) return
    let network = l.network
    const raw = l.url.trim()
    // Someone else's site pasted into a social row is a website.
    if (network !== 'website' && network !== 'whatsapp' && !detectNetwork(raw) && /^(https?:\/\/|www\.)/i.test(raw)) network = 'website'
    const url = socialUrl(network, raw)
    if (url && (url !== l.url || network !== l.network)) setRow(i, { url, network })
  }
  const addPasted = (v: string) => {
    const raw = v.trim(); if (!raw) return
    const network = detectNetwork(raw) || 'website'
    const url = socialUrl(network, raw)
    if (!url) { setPasteErr('That doesn’t look like a link. Paste the whole address, like instagram.com/yourshop.'); return }
    if (links.some(l => socialUrl(l.network, l.url) === url)) { setPasteErr(`${SOCIAL[network].label} is already in the list.`); setPaste(''); return }
    addLink({ network, url }, false)
    setPaste(''); setPasteErr('')
  }

  // One of each network is offered; a network already in the list isn't.
  const inList = (s: SocialLink) => links.some(l => l.network === s.network || socialUrl(l.network, l.url) === s.url)
  const offer = (suggestions || []).filter(s => !inList(s))

  return (
    <div className="eds">
      <style href="colvy-ed-social" precedence="default">{EDS_CSS}</style>

      {links.length > 0 && (
        <div className="eds-rows">
          {links.map((l, i) => {
            const url = socialUrl(l.network, l.url)
            const shown = l.url.trim()
            const hint = !shown ? null
              : !url ? <span className="eds-hint bad">{l.network === 'whatsapp' ? 'Type a mobile number, like 0412 345 678' : l.network === 'website' ? 'Type your website, like yourshop.com.au' : `Type @yourname or paste your ${SOCIAL[l.network].label} link`}</span>
              : url !== shown ? <span className="eds-hint">Opens {prettyUrl(url)}</span> : null
            return (
              <div key={i} className="eds-row">
                <Logo network={l.network} look={current === 'text' ? 'brand' : current} size={34} />
                <div className="eds-field">
                  <input ref={el => { inputs.current[i] = el }} className="ed-input" value={l.url} placeholder={SOCIAL[l.network].placeholder}
                    aria-label={`${SOCIAL[l.network].label} link`} inputMode={l.network === 'whatsapp' ? 'tel' : 'url'} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                    onChange={e => typed(i, e.target.value)} onBlur={() => tidy(i)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); tidy(i); (e.target as HTMLInputElement).blur() } }} />
                  {hint}
                </div>
                <button type="button" className="eds-x" aria-label={`Remove ${SOCIAL[l.network].label}`} title="Remove" onClick={() => setLinks(links.filter((_, j) => j !== i))}><DIcon name="trash" size={15} /></button>
              </div>
            )
          })}
        </div>
      )}

      {offer.length > 0 && !full && (
        <div className="eds-sugg">
          <div className="eds-sub"><span>Your links</span>{offer.length > 1 && <button type="button" className="eds-all" onClick={() => setLinks([...links, ...offer].slice(0, MAX_SOCIAL_LINKS))}>Add all</button>}</div>
          <div className="eds-chips">
            {offer.map(s => (
              <button key={`${s.network}-${s.url}`} type="button" className="eds-chip" onClick={() => addLink(s, false)} title={`Add ${s.url}`}>
                <Logo network={s.network} size={20} />
                <span>{prettyUrl(s.url)}</span>
                <DIcon name="plus" size={13} />
              </button>
            ))}
          </div>
        </div>
      )}

      {!full && (
        <>
          <div className="eds-sub"><span>{links.length ? 'Add another' : 'Tap a logo to add it'}</span></div>
          <div className="eds-tiles" role="group" aria-label="Add a social link">
            {SOCIAL_NETWORKS.map(n => {
              const on = links.some(l => l.network === n)
              return (
                <button key={n} type="button" className={`eds-tile${on ? ' on' : ''}`} onClick={() => tapNetwork(n)} aria-label={on ? `${SOCIAL[n].label} (added)` : `Add ${SOCIAL[n].label}`} title={on ? `${SOCIAL[n].label} is added` : `Add ${SOCIAL[n].label}`}>
                  <span className="eds-tile-i"><Logo network={n} size={30} />{on && <span className="eds-tick"><DIcon name="check" size={9} /></span>}</span>
                  <span className="eds-tile-l">{SOCIAL[n].label}</span>
                </button>
              )
            })}
          </div>
          <div className="eds-paste">
            <DIcon name="link" size={15} />
            <input value={paste} placeholder="Or paste any link: we’ll find the logo" aria-label="Paste a social link"
              autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="url"
              onChange={e => { setPaste(e.target.value); if (pasteErr) setPasteErr('') }}
              onPaste={e => { const v = e.clipboardData.getData('text'); if (v.trim() && !paste) { e.preventDefault(); addPasted(v) } }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPasted(paste) } }} />
            {paste.trim() && <button type="button" onClick={() => addPasted(paste)}>Add</button>}
          </div>
          {pasteErr && <p className="eds-hint bad" role="alert">{pasteErr}</p>}
        </>
      )}

      <div className="eds-sub"><span>Look</span></div>
      <div className="eds-looks" role="radiogroup" aria-label="How the links look">
        {SOCIAL_LOOKS.map(o => (
          <button key={o.id} type="button" role="radio" aria-checked={current === o.id} className={`eds-look${current === o.id ? ' on' : ''}`} onClick={() => update({ look: o.id })}>
            <span className="eds-look-p">
              {o.id === 'text'
                ? <span className="eds-pill">Facebook</span>
                : (['facebook', 'instagram', 'tiktok'] as Network[]).map(n => <Logo key={n} network={n} look={o.id} size={18} />)}
            </span>
            <span className="eds-look-l">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const EDS_CSS = `
.eds{display:flex;flex-direction:column;gap:2px}
.eds button::before{display:none!important}
.eds-logo{display:block;flex-shrink:0;border-radius:50%;user-select:none}
.eds-rows{display:flex;flex-direction:column;gap:8px;margin:2px 0 6px}
.eds-row{display:flex;align-items:flex-start;gap:10px}
.eds-row>.eds-logo{margin-top:6px}
.eds-field{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.eds-field .ed-input{padding:11px 14px}
.eds-hint{font-size:12px;color:var(--ed-muted);padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eds-hint.bad{color:#b42318;white-space:normal}
p.eds-hint{margin:6px 0 0}
.eds-x{flex-shrink:0;width:38px;height:38px;margin-top:4px;border:0;border-radius:999px;background:transparent;color:var(--ed-muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.eds-x:hover{background:var(--ed-fill);color:#b42318}
.eds-sub{display:flex;align-items:center;justify-content:space-between;margin:12px 0 8px;font-size:12.5px;font-weight:650;color:var(--ink)}
.eds-all{border:0;background:none;padding:2px 4px;font:inherit;font-size:12.5px;font-weight:650;color:var(--coral,#ff7a6b);cursor:pointer}
.eds-chips{display:flex;flex-wrap:wrap;gap:6px}
.eds-chip{display:inline-flex;align-items:center;gap:7px;max-width:100%;height:34px;padding:0 10px 0 7px;border:0;border-radius:999px;background:var(--ed-card);box-shadow:0 0 0 1.5px var(--ed-fill-2);font:inherit;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;transition:box-shadow .15s,background .15s}
.eds-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.eds-chip svg{flex-shrink:0;color:var(--ed-muted)}
.eds-chip:hover{box-shadow:0 0 0 1.5px color-mix(in srgb,var(--coral,#ff7a6b) 55%,transparent);background:color-mix(in srgb,var(--coral,#ff7a6b) 5%,var(--ed-card))}
.eds-tiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.eds-tile{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;padding:10px 2px 8px;border:0;border-radius:14px;background:var(--ed-fill);font:inherit;cursor:pointer;transition:background .15s,transform .12s,box-shadow .15s}
.eds-tile:hover{background:var(--ed-card);box-shadow:0 0 0 1.5px var(--ed-fill-2),0 4px 12px -6px rgba(16,24,40,.18)}
.eds-tile:active{transform:scale(.96)}
.eds-tile:focus-visible{outline:2px solid var(--coral,#ff7a6b);outline-offset:2px}
.eds-tile-i{position:relative;display:block}
.eds-tick{position:absolute;right:-4px;bottom:-3px;width:15px;height:15px;border-radius:50%;background:#12b76a;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--ed-fill)}
.eds-tick svg{stroke-width:3.4}
.eds-tile.on:hover .eds-tick{box-shadow:0 0 0 2px var(--ed-card)}
.eds-tile-l{max-width:100%;padding:0 2px;font-size:11px;font-weight:600;color:var(--ed-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eds-tile.on .eds-tile-l{color:var(--ink)}
.eds-paste{display:flex;align-items:center;gap:8px;margin-top:8px;height:42px;padding:0 6px 0 14px;border-radius:999px;background:var(--ed-fill);color:var(--ed-muted);transition:box-shadow .15s,background .15s}
.eds-paste:focus-within{background:var(--ed-card);box-shadow:0 0 0 1.5px var(--ed-fill-2),0 0 0 4px color-mix(in srgb,var(--coral,#ff7a6b) 12%,transparent)}
.eds .eds-paste input,.eds .eds-paste input:focus{flex:1;min-width:0;height:100%;padding:0;border:none!important;background:transparent!important;box-shadow:none!important;outline:none!important;font:inherit;font-size:13.5px;color:var(--ink)}
.eds-paste button{flex-shrink:0;height:30px;padding:0 14px;border:0;border-radius:999px;background:var(--ink);color:var(--card,#fff);font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
.eds-looks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.eds-look{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;padding:10px 4px 8px;border:0;border-radius:14px;background:var(--ed-fill);font:inherit;cursor:pointer;box-shadow:0 0 0 1.5px transparent;transition:box-shadow .15s,background .15s}
.eds-look:hover{background:var(--ed-card);box-shadow:0 0 0 1.5px var(--ed-fill-2)}
.eds-look.on{background:var(--ed-card);box-shadow:0 0 0 2px var(--ink)}
.eds-look-p{display:flex;align-items:center;justify-content:center;gap:3px;height:20px}
.eds-pill{display:inline-block;padding:2px 7px;border:1px solid #d4d4d8;border-radius:999px;font-size:9.5px;font-weight:650;color:var(--ink);background:#fff;line-height:1.3}
.eds-look-l{font-size:11.5px;font-weight:650;color:var(--ink)}
@media (max-width:420px){.eds-tiles{grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}.eds-tile-l{font-size:10px}}
[data-theme="dark"] .eds-pill{background:#1c1c1f;border-color:#3a3a40}
[data-theme="dark"] .eds-hint.bad{color:#fda29b}
`
