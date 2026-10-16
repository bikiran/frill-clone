'use client'

// One announcement as the public sees it. Used by the updates page
// (app/announcements) and by the editor's live preview, so the preview is
// exactly what goes out. The body is already safe HTML (lib/safe-html.ts via
// toPublicAnnouncement). Sizes follow the post's own width (container
// queries), so the editor's phone preview looks like a phone.

import { CATEGORIES, formatDate, REACTIONS, type PublicAnnouncement } from '@/lib/announcements'
import { AnnIcon, REACTION_ICON } from './icons'

export function PublicPost({ post, ideaTitle, mine = [], onReact, onCopy, copied, highlight, showDate = true, preview = false }: {
  post: PublicAnnouncement
  ideaTitle?: string | null
  mine?: string[]
  onReact?: (key: string) => void
  onCopy?: () => void
  copied?: boolean
  highlight?: boolean
  showDate?: boolean
  preview?: boolean
}) {
  const cat = CATEGORIES.find(c => c.key === post.category) || CATEGORIES[5]
  const ends = post.expires_at ? formatDate(post.expires_at) : ''
  return (
    <article className={`ap-post${highlight ? ' is-highlight' : ''}`} id={`post-${post.id}`} data-ann-id={post.id}>
      <div className={`ap-inner${post.cover_image ? ' has-cover' : ''}`}>
      {post.cover_image && (
        <div className="ap-cover"><img src={post.cover_image} alt="" loading="lazy" /></div>
      )}
      <div className="ap-body">
        <div className="ap-meta">
          <span className="ap-cat" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
          {post.is_pinned && <span className="ap-chip"><AnnIcon name="pin" size={12} /> Pinned</span>}
          {ends && <span className="ap-chip is-ends"><AnnIcon name="hourglass" size={12} /> Ends {ends}</span>}
          {showDate && <time className="ap-date" dateTime={post.date}>{formatDate(post.date)}</time>}
        </div>
        <h2 className="ap-title">{post.title || 'Untitled announcement'}</h2>
        {post.html
          ? <div className="ap-html" dangerouslySetInnerHTML={{ __html: post.html }} />
          : preview ? <p className="ap-empty">Your announcement text shows here.</p> : null}
        {post.video && (
          <div className="ap-video">
            {post.video.kind === 'embed'
              ? <iframe src={post.video.src} title="Video" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              : <video src={post.video.src} controls playsInline preload="metadata" />}
          </div>
        )}
        {(post.cta_url || ideaTitle) && (
          <div className="ap-actions">
            {post.cta_url && (
              <a className="ap-cta" href={preview ? undefined : post.cta_url} target="_blank" rel="noopener noreferrer nofollow">
                {post.cta_label || 'Learn more'} <AnnIcon name="external" size={14} />
              </a>
            )}
            {ideaTitle && post.idea_id && (
              <a className="ap-idea" href={preview ? undefined : `/?idea=${post.idea_id}`}>
                <AnnIcon name="idea" size={15} /> <span>From your ideas: <strong>{ideaTitle}</strong></span>
              </a>
            )}
          </div>
        )}
        <footer className="ap-foot">
          <div className="ap-reacts" role="group" aria-label="Reactions">
            {REACTIONS.map(r => {
              const on = mine.includes(r.key)
              const n = post.reactions[r.key] || 0
              return (
                <button key={r.key} type="button" className={`ap-react${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={`${r.label}${n ? `, ${n}` : ''}`} title={r.label}
                  onClick={() => onReact?.(r.key)} disabled={preview}>
                  <AnnIcon name={REACTION_ICON[r.key]} size={16} filled={on} />
                  {n > 0 && <span>{n.toLocaleString('en-AU')}</span>}
                </button>
              )
            })}
          </div>
          <button type="button" className="ap-share" onClick={onCopy} disabled={preview}>
            <AnnIcon name={copied ? 'check' : 'link'} size={15} /> {copied ? 'Copied' : 'Copy link'}
          </button>
        </footer>
      </div>
      </div>
    </article>
  )
}

export const POST_CSS = `
.ap-post { container-type: inline-size; position: relative; background: var(--ap-card, #fff); border: 1px solid var(--border, #ececec); border-radius: 22px; overflow: hidden; transition: box-shadow .25s, border-color .25s; scroll-margin-top: 90px; }
.ap-post.is-highlight { border-color: var(--coral); box-shadow: 0 0 0 4px color-mix(in srgb, var(--coral) 16%, transparent); }
.ap-cover { aspect-ratio: 16 / 8; background: var(--canvas, #f5f5f7); overflow: hidden; }
.ap-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* Wide posts with a cover read like a magazine spread: picture beside the words. */
@container (min-width: 1040px) {
  .ap-inner.has-cover { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .ap-inner.has-cover .ap-cover { aspect-ratio: auto; min-height: 100%; max-height: 640px; }
  .ap-inner.has-cover .ap-body { display: flex; flex-direction: column; }
  .ap-inner.has-cover .ap-foot { margin-top: auto; }
}
@container (min-width: 1040px) { .ap-inner:not(.has-cover) .ap-html { max-width: 820px; } }
.ap-body { padding: 22px 22px 16px; }
@container (min-width: 560px) { .ap-body { padding: 30px 36px 20px; } }
.ap-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.ap-cat { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .01em; }
.ap-chip { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 600; color: var(--slate, #6b7280); background: var(--canvas, #f5f5f7); }
.ap-chip.is-ends { color: #be123c; background: #fff1f2; }
.ap-date { font-size: 13px; color: var(--slate, #6b7280); margin-left: auto; }
.ap-title { margin: 0 0 12px; font-size: 22px; line-height: 1.22; font-weight: 700; letter-spacing: -0.02em; color: var(--ink, #111); overflow-wrap: anywhere; }
@container (min-width: 560px) { .ap-title { font-size: 28px; } }
.ap-html, .ap-empty { font-size: 16px; line-height: 1.7; color: color-mix(in srgb, var(--ink, #111) 82%, transparent); overflow-wrap: anywhere; }
.ap-empty { color: var(--slate); font-style: italic; margin: 0; }
.ap-html > :first-child { margin-top: 0; }
.ap-html p { margin: 0 0 14px; }
.ap-html h1, .ap-html h2, .ap-html h3, .ap-html h4 { color: var(--ink); line-height: 1.3; margin: 22px 0 8px; letter-spacing: -0.01em; }
.ap-html h1, .ap-html h2 { font-size: 20px; } .ap-html h3, .ap-html h4 { font-size: 17px; }
.ap-html ul, .ap-html ol { margin: 0 0 14px; padding-left: 22px; }
.ap-html li { margin: 0 0 6px; }
.ap-html a { color: var(--coral); text-decoration: underline; text-underline-offset: 2px; }
.ap-html img { max-width: 100%; height: auto; border-radius: 14px; margin: 6px 0; }
.ap-html blockquote { margin: 0 0 14px; padding: 2px 0 2px 16px; border-left: 3px solid var(--border); color: var(--slate); }
.ap-html table { border-collapse: collapse; width: 100%; margin: 0 0 14px; font-size: 14px; display: block; overflow-x: auto; }
.ap-html td, .ap-html th { border: 1px solid var(--border); padding: 6px 9px; }
.ap-html pre { white-space: pre-wrap; background: var(--canvas); padding: 12px; border-radius: 10px; font-size: 13.5px; }
.ap-video { margin: 8px 0 16px; border-radius: 16px; overflow: hidden; background: #000; aspect-ratio: 16 / 9; }
.ap-video iframe, .ap-video video { width: 100%; height: 100%; border: 0; display: block; }
.ap-actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 4px 0 16px; }
.ap-cta { display: inline-flex; align-items: center; gap: 7px; height: 42px; padding: 0 18px; border-radius: 12px; background: var(--coral); color: #fff; font-size: 14.5px; font-weight: 600; text-decoration: none; }
.ap-cta:hover { filter: brightness(.95); }
.ap-idea { display: inline-flex; align-items: center; gap: 8px; min-height: 42px; padding: 8px 14px; border-radius: 12px; border: 1px solid var(--border); color: var(--ink); font-size: 14px; text-decoration: none; background: var(--ap-card, #fff); }
.ap-idea:hover { border-color: #d4d4d8; }
.ap-idea svg { color: #ca8a04; flex-shrink: 0; }
.ap-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding-top: 14px; border-top: 1px solid var(--border); }
.ap-reacts { display: flex; gap: 6px; flex-wrap: wrap; }
.ap-react { display: inline-flex; align-items: center; gap: 6px; height: 34px; min-width: 40px; justify-content: center; padding: 0 11px; border-radius: 999px; border: 1px solid var(--border); background: var(--ap-card, #fff); color: var(--slate); font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s, color .15s, border-color .15s, transform .1s; }
.ap-react:hover:not([disabled]) { color: var(--ink); border-color: #d4d4d8; }
.ap-react:active:not([disabled]) { transform: scale(.95); }
.ap-react.is-on { color: var(--coral); border-color: color-mix(in srgb, var(--coral) 45%, transparent); background: color-mix(in srgb, var(--coral) 9%, transparent); }
.ap-react[disabled], .ap-share[disabled] { cursor: default; }
.ap-share { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 999px; border: none; background: none; color: var(--slate); font-size: 13px; font-weight: 600; cursor: pointer; }
.ap-share:hover:not([disabled]) { color: var(--ink); background: var(--canvas); }
.ap-root :focus-visible, .ap-post :focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
`
