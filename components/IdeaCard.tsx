'use client'

import { useRef, useState } from 'react'
import { getRelativeTime } from '@/lib/timeFormat'
import { HeartIcon, BellIcon } from '@/components/Icons'
import { SelectPopover } from '@/components/ui/SelectMenu'

// The built-in statuses: a readable name and a colour for each.
const STATUS: Record<string, { label: string; color: string }> = {
  new: { label: 'Under consideration', color: '#f97316' },
  planned: { label: 'Planned', color: '#3b82f6' },
  in_progress: { label: 'In development', color: '#ea580c' },
  shipped: { label: 'Shipped', color: '#10b981' },
  rejected: { label: 'Rejected', color: '#ef4444' },
  no_status: { label: 'No status', color: '#a1a1aa' },
}
const statusOf = (k: string) => STATUS[k] || { label: String(k).replace(/_/g, ' '), color: '#a1a1aa' }

export default function IdeaCard({ idea, hasVoted, onVote, onClick, onStatusChange, liked, subscribed, onLike, onSubscribe }: {
  idea: any
  hasVoted: boolean
  onVote: (id: string) => void
  onClick?: () => void
  onStatusChange?: (id: string, status: string) => void
  liked?: boolean
  subscribed?: boolean
  onLike?: (id: string) => void
  onSubscribe?: (id: string) => void
}) {
  const [isVoting, setIsVoting] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)

  const handleVoteClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isVoting) return
    
    setAnimating(true)
    setIsVoting(true)
    
    await onVote(idea.id)
    
    // Let animation finish
    setTimeout(() => {
      setAnimating(false)
      setIsVoting(false)
    }, 600)
  }

  const statusBtnRef = useRef<HTMLButtonElement | null>(null)
  const st = idea.status ? statusOf(idea.status) : null

  return (
    <div onClick={onClick} className="idc" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onClick?.() }}>
      <style>{IDC_CSS}</style>

      {/* Vote */}
      <button type="button" onClick={handleVoteClick} disabled={isVoting}
        className={`idc-vote${hasVoted ? ' on' : ''}${animating ? ' vote-animate' : ''}`}
        title={hasVoted ? 'Remove vote' : 'Vote for this idea'} aria-pressed={hasVoted} aria-label={`${hasVoted ? 'Remove vote' : 'Upvote'}, ${idea.votes || 0} votes`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="18 15 12 9 6 15" /></svg>
        <span>{idea.votes || 0}</span>
        {animating && hasVoted && <div className="vote-ripple" />}
      </button>

      <div className="idc-body">
        <h3 className="idc-title">
          {idea.is_pinned && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--coral)" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Pinned" className="shrink-0">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
          )}
          <span>{idea.title}</span>
        </h3>
        {idea.description && <p className="idc-desc">{idea.description}</p>}

        {(idea.topics?.length > 0 || idea.poll_id || idea.survey_id || idea.is_private) && (
          <div className="idc-tags">
            {idea.is_private && <span className="idc-tag">Private</span>}
            {(idea.topics || []).map((t: string) => <span key={t} className="idc-tag">#{t}</span>)}
            {idea.poll_id && (
              <a href={`/polls/${idea.poll_id}`} onClick={e => e.stopPropagation()} className="idc-tag blue">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h2v5H7z"/><path d="M11 8h2v9h-2z"/><path d="M15 14h2v3h-2z"/></svg>
                Vote in poll
              </a>
            )}
            {idea.survey_id && (
              <a href={`/surveys/${idea.survey_id}`} onClick={e => e.stopPropagation()} className="idc-tag green">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                Take survey
              </a>
            )}
          </div>
        )}

        <div className="idc-foot">
          <span className="idc-by">
            {idea.created_by_name || 'Anonymous'}
            <i aria-hidden>·</i>
            <span title={new Date(idea.created_at).toLocaleString()}>{getRelativeTime(idea.created_at)}</span>
          </span>
          <div className="idc-acts">
            <button type="button" onClick={e => { e.stopPropagation(); onLike?.(idea.id) }} className={`idc-act${liked ? ' on' : ''}`} title={liked ? 'Unlike' : 'Like'} aria-pressed={!!liked}>
              <HeartIcon size={14} filled={liked} /><span>{idea.likes || 0}</span>
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); onSubscribe?.(idea.id) }} className={`idc-act${subscribed ? ' on' : ''}`} title={subscribed ? 'Unsubscribe from updates' : 'Subscribe to updates'} aria-pressed={!!subscribed}>
              <BellIcon size={14} filled={subscribed} /><span>{subscribed ? 'Subscribed' : 'Subscribe'}</span>
            </button>
            <span className="idc-act static" title="Views">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              {idea.views || 0}
            </span>
            {st && !onStatusChange && (
              <span className="idc-status"><i style={{ background: st.color }} aria-hidden />{st.label}</span>
            )}
            {st && onStatusChange && (
              <>
                <button type="button" ref={statusBtnRef} className="idc-status btn" aria-haspopup="listbox" aria-expanded={showStatusMenu}
                  onClick={e => { e.stopPropagation(); setShowStatusMenu(v => !v) }}>
                  <i style={{ background: st.color }} aria-hidden />{st.label}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <span onClick={e => e.stopPropagation()}>
                  <SelectPopover open={showStatusMenu} onClose={() => setShowStatusMenu(false)} anchorRef={statusBtnRef} label="Status" prefer="top"
                    value={idea.status} width={220}
                    options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label, dot: v.color }))}
                    onPick={v => onStatusChange(idea.id, v)} />
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const IDC_CSS = `
.idc{--f:#f4f4f5;--f2:#ececef;--mut:#71717a;--soft:#8e8e93;display:flex;gap:14px;padding:16px 18px;border-radius:20px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04);cursor:pointer;transition:box-shadow .18s,transform .18s;outline:none}
[data-theme="dark"] .idc{--f:#2a2a2e;--f2:#333337;--mut:#a1a1aa;--soft:#8b8b90}
.idc:hover{box-shadow:0 0 0 1px rgba(0,0,0,.06),0 10px 26px -12px rgba(16,24,40,.22);transform:translateY(-1px)}
.idc:focus-visible{box-shadow:0 0 0 2px var(--coral)}
.idc button::before,.idc a::before{display:none!important}
.idc-vote{position:relative;flex-shrink:0;align-self:flex-start;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:52px;height:58px;border:none;border-radius:16px;background:var(--f);color:var(--mut);font:inherit;cursor:pointer;transition:background .15s,color .15s,transform .12s}
.idc-vote span{font-size:15px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.idc-vote:hover{background:var(--f2)}
.idc-vote:hover svg{transform:translateY(-1px)}
.idc-vote svg{transition:transform .15s}
.idc-vote:active{transform:scale(.95)}
.idc-vote.on{background:var(--coral);color:#fff;box-shadow:0 6px 16px -8px var(--coral)}
.idc-vote.on span{color:#fff}
.idc-body{flex:1;min-width:0}
.idc-title{display:flex;align-items:center;gap:6px;margin:2px 0 0;font-size:15.5px;font-weight:650;letter-spacing:-.01em;line-height:1.35;color:var(--ink)}
.idc-title span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.idc-desc{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--mut);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.idc-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
.idc-tag{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 10px;border-radius:999px;background:var(--f);font-size:12px;font-weight:600;color:var(--ink);text-decoration:none}
.idc-tag.blue{background:#e0f2fe;color:#0369a1}.idc-tag.green{background:#dcfce7;color:#15803d}
.idc-foot{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;margin-top:12px}
.idc-by{display:inline-flex;align-items:center;gap:6px;min-width:0;font-size:12.5px;color:var(--soft);white-space:nowrap}
.idc-by i{font-style:normal}
.idc-acts{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.idc-act{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border:none;border-radius:999px;background:transparent;color:var(--mut);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:background .15s,color .15s}
.idc-act:hover{background:var(--f);color:var(--ink)}
.idc-act.on{color:var(--coral)}
.idc-act.static{cursor:default}
.idc-act.static:hover{background:none;color:var(--mut)}
.idc-status{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px;margin-left:4px;border:none;border-radius:999px;background:var(--f);font:inherit;font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap}
.idc-status i{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.idc-status.btn{cursor:pointer}
.idc-status.btn:hover,.idc-status.btn[aria-expanded="true"]{background:var(--f2)}
@media (max-width:560px){.idc{gap:11px;padding:14px}.idc-vote{width:46px;height:52px}.idc-act span{display:none}.idc-act.on span,.idc-act:first-child span{display:inline}}
`
