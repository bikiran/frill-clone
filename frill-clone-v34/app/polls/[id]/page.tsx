'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function PollPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const pollId = params.id as string

  const [poll, setPoll] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [userVote, setUserVote] = useState<string | null>(null)
  const [votes, setVotes] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchPoll()
  }, [pollId])

  const fetchPoll = async () => {
    try {
      const { data, error } = await supabase.from('polls').select('*').eq('id', pollId).single()
      if (error) {
        console.error('Poll fetch error:', error)
        setLoading(false)
        return
      }
      if (data) {
        // Parse options if it's a string (sometimes happens with JSONB)
        let parsedOptions = data.options
        if (typeof parsedOptions === 'string') {
          try { parsedOptions = JSON.parse(parsedOptions) } catch {}
        }
        if (!Array.isArray(parsedOptions)) parsedOptions = []
        
        setPoll({ ...data, options: parsedOptions })
        
        // Fetch vote counts
        const { data: voteData } = await supabase.from('poll_votes').select('*').eq('poll_id', pollId)
        if (voteData) {
          const counts: Record<string, number> = {}
          voteData.forEach(v => {
            counts[v.option] = (counts[v.option] || 0) + 1
          })
          setVotes(counts)
        }

        // Check if user already voted
        if (typeof window !== 'undefined') {
          const voted = localStorage.getItem(`poll_${pollId}`)
          if (voted) {
            setUserVote(voted)
            setSubmitted(true)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch poll:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleVote = async () => {
    if (!selectedOption) return
    
    try {
      await supabase.from('poll_votes').insert({
        poll_id: pollId,
        option: selectedOption,
      })
      
      localStorage.setItem(`poll_${pollId}`, selectedOption)
      setUserVote(selectedOption)
      setSubmitted(true)
      
      // Update counts
      setVotes(v => ({
        ...v,
        [selectedOption]: (v[selectedOption] || 0) + 1,
      }))
    } catch (error) {
      console.error('Failed to vote:', error)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>
  if (!poll) return <div className="flex items-center justify-center h-screen">Poll not found</div>

  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0)

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-2xl mx-auto p-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Back to Ideas
        </Link>

        <div className="bg-white rounded-2xl border p-8" style={{ borderColor: 'var(--border)' }}>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--ink)' }}>
            {poll.question}
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--slate)' }}>
            {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
          </p>

          <div className="space-y-3">
            {!poll.options || poll.options.length === 0 ? (
              <div className="p-6 rounded-lg border text-center" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
                <p className="text-sm font-medium mb-2" style={{ color: '#dc2626' }}>⚠️ No options configured</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>
                  This poll has no answer options yet. An admin needs to edit the poll and add options.
                </p>
              </div>
            ) : (Array.isArray(poll.options) ? poll.options : []).map((option: string) => {
              const count = votes[option] || 0
              const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0
              const isSelected = selectedOption === option
              const hasVoted = submitted
              const isUserChoice = userVote === option

              return (
                <button
                  key={option}
                  onClick={() => !hasVoted && setSelectedOption(option)}
                  disabled={hasVoted}
                  className={`w-full p-4 rounded-lg border text-left transition-all ${!hasVoted ? 'cursor-pointer hover:shadow-md hover:scale-[1.01]' : 'cursor-default'}`}
                  style={{
                    borderColor: isSelected || isUserChoice ? 'var(--coral)' : 'var(--border)',
                    background: isSelected || isUserChoice ? 'var(--peach)' : 'white',
                    borderWidth: isSelected || isUserChoice ? '2px' : '1px',
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                      {!hasVoted && (
                        <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                          style={{ borderColor: isSelected ? 'var(--coral)' : 'var(--border)' }}>
                          {isSelected && <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--coral)' }} />}
                        </span>
                      )}
                      {isUserChoice && '✓ '}
                      {option}
                    </span>
                    {hasVoted && (
                      <span className="text-sm font-bold" style={{ color: 'var(--coral)' }}>
                        {percentage.toFixed(0)}% ({count})
                      </span>
                    )}
                  </div>
                  {hasVoted && (
                    <div className="h-2 rounded-full" style={{ background: 'var(--border)' }}>
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          background: isUserChoice ? 'var(--coral)' : '#cbd5e1',
                          width: `${percentage}%`,
                        }}
                      />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {!submitted && (
            <button
              onClick={handleVote}
              disabled={!selectedOption}
              className="w-full mt-8 px-6 py-3 rounded-lg text-white font-semibold transition-all disabled:opacity-50 cursor-pointer hover:shadow-lg disabled:cursor-not-allowed"
              style={{ background: 'var(--coral)' }}>
              Submit Vote
            </button>
          )}

          {submitted && (
            <div className="mt-8 p-4 rounded-lg border text-center" style={{ borderColor: 'var(--border)', background: 'var(--peach)' }}>
              <p style={{ color: 'var(--coral)' }}>
                ✓ Your vote for <strong>{userVote}</strong> has been recorded
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
