'use client'

import { useState } from 'react'
import { getRelativeTime } from '@/lib/timeFormat'
import { HeartIcon, BellIcon } from '@/components/Icons'

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

  return (
    <div onClick={onClick} className="bg-white rounded-2xl border p-4 sm:p-5 flex gap-3 sm:gap-4 hover:shadow-md hover-lift transition-smooth"
      style={{ borderColor: 'var(--border)', cursor: 'pointer' }}>

      {/* Vote button - Interactive with animation */}
      <button
        onClick={handleVoteClick}
        disabled={isVoting}
        className={`flex flex-col items-center justify-center gap-0.5 shrink-0 px-3 py-2.5 rounded-xl transition-all duration-300 press-effect relative cursor-pointer group ${animating ? 'vote-animate' : ''}`}
        style={{
          background: hasVoted ? 'var(--coral)' : 'var(--canvas)',
          color: hasVoted ? 'white' : 'var(--slate)',
          minWidth: '52px',
          boxShadow: hasVoted ? '0 4px 12px rgba(255, 122, 107, 0.3)' : 'none',
          border: `2px solid ${hasVoted ? 'var(--coral)' : 'transparent'}`,
        }}
        title={hasVoted ? 'Remove vote' : 'Vote for this idea'}
      >
        <svg 
          width="14" height="14" viewBox="0 0 24 24" 
          fill={hasVoted ? 'white' : 'none'} 
          stroke={hasVoted ? 'white' : 'currentColor'} 
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform group-hover:-translate-y-0.5">
          <polyline points="18 15 12 9 6 15" />
        </svg>
        <span className="text-sm font-bold leading-tight">{idea.votes || 0}</span>
        {animating && hasVoted && <div className="vote-ripple" />}
        <span className="action-tooltip">{hasVoted ? 'Remove vote' : 'Upvote'}</span>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm mb-1 line-clamp-2 flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
          {idea.is_pinned && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--coral)" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
          )}
          {idea.title}
        </h3>
        <p className="text-xs mb-2 line-clamp-2" style={{ color: 'var(--slate)' }}>
          {idea.description || 'No description'}
        </p>

        {idea.topics && idea.topics.length > 0 && (
          <div className="flex gap-1 mb-2 flex-wrap">
            {idea.topics.map((t: string) => (
              <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Poll/Survey badges - clickable */}
        {(idea.poll_id || idea.survey_id) && (
          <div className="flex gap-1 mb-2 flex-wrap">
            {idea.poll_id && (
              <a 
                href={`/polls/${idea.poll_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 hover:shadow-sm transition-smooth cursor-pointer" 
                style={{ background: '#e0f2fe', color: '#0369a1' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h2v5H7z"/><path d="M11 8h2v9h-2z"/><path d="M15 14h2v3h-2z"/></svg>
                Vote in poll
              </a>
            )}
            {idea.survey_id && (
              <a 
                href={`/surveys/${idea.survey_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 hover:shadow-sm transition-smooth cursor-pointer" 
                style={{ background: '#f0fdf4', color: '#16a34a' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                Take survey
              </a>
            )}
          </div>
        )}

        {/* Engagement row */}
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={(e) => { e.stopPropagation(); onLike?.(idea.id) }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-smooth press-effect hover:bg-gray-50 cursor-pointer"
            style={{ color: liked ? 'var(--coral)' : 'var(--slate)' }}
            title={liked ? 'Unlike' : 'Like'}>
            <HeartIcon size={14} filled={liked} />
            <span className="font-medium">{idea.likes || 0}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSubscribe?.(idea.id) }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-smooth press-effect hover:bg-gray-50 cursor-pointer"
            style={{ color: subscribed ? 'var(--coral)' : 'var(--slate)' }}
            title={subscribed ? 'Unsubscribe from updates' : 'Subscribe to updates'}>
            <BellIcon size={14} filled={subscribed} />
            <span className="font-medium">{subscribed ? 'Subscribed' : 'Subscribe'}</span>
          </button>
          <span className="flex items-center gap-1 px-2 py-1 text-xs" style={{ color: 'var(--slate)' }} title="Views">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            {idea.views || 0}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs flex-wrap" style={{ color: 'var(--slate)' }}>
          <div className="flex items-center gap-2">
            <span>{idea.created_by_name || 'Anonymous'}</span>
            <span>•</span>
            <span title={new Date(idea.created_at).toLocaleString()}>{getRelativeTime(idea.created_at)}</span>
          </div>
          {idea.status && !onStatusChange && (
            <span className="px-2 py-0.5 rounded-full inline-flex items-center"
              style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
              {String(idea.status).replace('_', ' ')}
            </span>
          )}
          {idea.status && onStatusChange && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowStatusMenu(!showStatusMenu)
                }}
                className="px-2 py-0.5 rounded-full cursor-pointer hover:shadow-md transition-smooth inline-flex items-center gap-1"
                style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                {idea.status}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {showStatusMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-40 bg-white rounded-lg shadow-lg border z-10" style={{ borderColor: 'var(--border)' }}>
                  {['new', 'planned', 'in_progress', 'shipped', 'rejected', 'no_status'].map(s => (
                    <button
                      key={s}
                      onClick={(e) => {
                        e.stopPropagation()
                        onStatusChange(idea.id, s)
                        setShowStatusMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 transition-smooth first:rounded-t-lg last:rounded-b-lg flex items-center gap-1.5"
                      style={{ color: s === idea.status ? 'var(--coral)' : 'var(--slate)' }}>
                      {s === idea.status && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                      <span className={s === idea.status ? '' : 'ml-[18px]'}>{s.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
