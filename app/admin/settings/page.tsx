'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const slug = searchParams.get('slug') || ''
  const tab = searchParams.get('tab') || 'authentication'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Authentication settings
  const [authMethod, setAuthMethod] = useState<'registered' | 'guest' | 'anonymous' | 'custom'>('registered')
  const [submitIdeas, setSubmitIdeas] = useState('registered')
  const [comments, setComments] = useState('registered')
  const [voting, setVoting] = useState('registered')
  const [announcements, setAnnouncements] = useState('registered')

  // Privacy settings
  const [companyVisibility, setCompanyVisibility] = useState<'public' | 'private'>('public')
  const [userApproval, setUserApproval] = useState(false)
  const [ideaApproval, setIdeaApproval] = useState(false)
  const [ideaAutoApprove, setIdeaAutoApprove] = useState('team')
  const [editAfterApproval, setEditAfterApproval] = useState(true)
  const [commentApproval, setCommentApproval] = useState(false)
  const [commentAutoApprove, setCommentAutoApprove] = useState('team')
  const [disableSearch, setDisableSearch] = useState(false)
  const [ipAllowlist, setIpAllowlist] = useState('')

  // Prioritization settings
  const [prioritizationName, setPrioritizationName] = useState('Prioritization Matrix')
  const [benefitFactors, setBenefitFactors] = useState([
    { name: 'Impact', type: 'percentage', weight: 50 }
  ])
  const [costFactors, setCostFactors] = useState([
    { name: 'Effort', type: 'percentage', weight: 50 }
  ])
  const [scoreDisplay, setScoreDisplay] = useState<'none' | 'quadrant' | 'score'>('score')
  const [showInBoard, setShowInBoard] = useState(true)
  const [normalizeScores, setNormalizeScores] = useState(false)
  const [makePublic, setMakePublic] = useState(false)

  useEffect(() => {
    setLoading(false)
  }, [slug])

  const handleSave = async () => {
    setSaving(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 500))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setSaving(false)
    }
  }

  const addBenefitFactor = () => {
    setBenefitFactors([
      ...benefitFactors,
      { name: `Factor ${benefitFactors.length + 1}`, type: 'percentage', weight: 0 }
    ])
  }

  const removeBenefitFactor = (index: number) => {
    setBenefitFactors(benefitFactors.filter((_, i) => i !== index))
  }

  const addCostFactor = () => {
    setCostFactors([
      ...costFactors,
      { name: `Factor ${costFactors.length + 1}`, type: 'percentage', weight: 0 }
    ])
  }

  const removeCostFactor = (index: number) => {
    setCostFactors(costFactors.filter((_, i) => i !== index))
  }

  if (loading) {
    return <div style={{ padding: '24px', color: '#666' }}>Loading settings...</div>
  }

  const typeOptions = ['0-5', '0-10', '0-100', 'Percentage', 'Checkbox', 'Fibonacci', 'Stars', 'T-shirts']

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <Link href={`/admin?slug=${slug}`} style={{ color: 'var(--coral)', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}>
          ← Back to Admin
        </Link>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px', marginTop: '16px', color: 'var(--ink)' }}>
          Settings
        </h1>
        <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>
          Configure your Colvy workspace
        </p>
      </div>

      {saved && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: '#dcfce7',
          color: '#166534',
          marginBottom: '24px',
          fontSize: '13px'
        }}>
          ✓ Settings saved successfully!
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
        {['authentication', 'privacy', 'prioritization'].map(t => (
          <button
            key={t}
            onClick={() => router.push(`/admin/settings?slug=${slug}&tab=${t}`)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: tab === t ? 'var(--coral)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--ink)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              textTransform: 'capitalize'
            }}
          >
            {t === 'authentication' && '🔐 Authentication'}
            {t === 'privacy' && '🔒 Privacy'}
            {t === 'prioritization' && '📊 Prioritization'}
          </button>
        ))}
      </div>

      {tab === 'authentication' && (
        <div style={{ display: 'grid', gap: '32px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
              Authentication Method
            </h2>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
              Users may sign up to your app with name, email and password. Change the settings below to customize how they can interact with each section of your app.
            </p>
            <select
              value={authMethod}
              onChange={(e) => setAuthMethod(e.target.value as any)}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '13px',
                fontFamily: 'inherit',
                width: '100%',
                marginBottom: '24px'
              }}
            >
              <option value="registered">Registered Users</option>
              <option value="guest">Guest Authentication</option>
              <option value="anonymous">Anonymous</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px', color: 'var(--ink)' }}>
              Advanced Settings
            </h2>

            {['Submit Ideas', 'Comments', 'Voting', 'Announcements Reactions'].map((label, idx) => {
              const getState = () => {
                if (idx === 0) return submitIdeas
                if (idx === 1) return comments
                if (idx === 2) return voting
                return announcements
              }
              const setState = (val: string) => {
                if (idx === 0) setSubmitIdeas(val)
                else if (idx === 1) setComments(val)
                else if (idx === 2) setVoting(val)
                else setAnnouncements(val)
              }

              return (
                <div key={idx} style={{ marginBottom: idx < 3 ? '16px' : '0' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--ink)' }}>
                    {label}
                  </label>
                  <select
                    value={getState()}
                    onChange={(e) => setState(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      width: '100%'
                    }}
                  >
                    <option value="registered">People who are registered</option>
                    <option value="guest">Guests</option>
                    <option value="anonymous">Anonymous</option>
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'privacy' && (
        <div style={{ display: 'grid', gap: '32px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
              Company Visibility
            </h2>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
              Select who sees your Ideas board, Roadmap and Announcements.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              {(['public', 'private'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setCompanyVisibility(opt)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: companyVisibility === opt ? 'none' : '1px solid var(--border)',
                    background: companyVisibility === opt ? 'var(--coral)' : '#fff',
                    color: companyVisibility === opt ? '#fff' : 'var(--ink)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
              User Approval
            </h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={userApproval}
                onChange={(e) => setUserApproval(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                Approve users before they gain access to your board
              </span>
            </label>
          </div>

          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
              Idea Approval
            </h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={ideaApproval}
                onChange={(e) => setIdeaApproval(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                Stop Ideas from going live on your board until you approve them
              </span>
            </label>

            {ideaApproval && (
              <div style={{ background: 'var(--peach)', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--ink)' }}>
                  Automatically approve Ideas from:
                </p>
                {['Team members', 'Registered users (including SSO)'].map((opt, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', marginBottom: '4px' }}>
                    <input
                      type="checkbox"
                      checked={i === 0 ? ideaAutoApprove === 'team' : ideaAutoApprove === 'registered'}
                      onChange={() => setIdeaAutoApprove(i === 0 ? 'team' : 'registered')}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editAfterApproval}
                onChange={(e) => setEditAfterApproval(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                Let users edit their Idea after it has been approved
              </span>
            </label>
          </div>

          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
              Comment Approval
            </h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={commentApproval}
                onChange={(e) => setCommentApproval(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                Comments must be approved before they go live on Ideas
              </span>
            </label>

            {commentApproval && (
              <div style={{ background: 'var(--peach)', padding: '12px', borderRadius: '6px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--ink)' }}>
                  Automatically approve Comments from:
                </p>
                {['Team members', 'Registered users (including SSO)'].map((opt, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', marginBottom: '4px' }}>
                    <input
                      type="checkbox"
                      checked={i === 0 ? commentAutoApprove === 'team' : commentAutoApprove === 'registered'}
                      onChange={() => setCommentAutoApprove(i === 0 ? 'team' : 'registered')}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
              Advanced Privacy
            </h2>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={disableSearch}
                onChange={(e) => setDisableSearch(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                Disable search engine indexing
              </span>
            </label>

            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--ink)' }}>
              IP Address Allowlist
            </label>
            <textarea
              value={ipAllowlist}
              onChange={(e) => setIpAllowlist(e.target.value)}
              placeholder="Enter IP addresses (one per line) to limit access"
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '12px',
                fontFamily: 'inherit'
              }}
            />
            <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
              Leave blank to disable IP allowlist. One IP per line.
            </p>
          </div>
        </div>
      )}

      {tab === 'prioritization' && (
        <div style={{ display: 'grid', gap: '32px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
              Prioritization Matrix Name
            </h2>
            <input
              type="text"
              value={prioritizationName}
              onChange={(e) => setPrioritizationName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '13px',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: 'var(--ink)' }}>
              Benefit Factors
            </h2>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
              Benefits can include customer value, strategic value, revenue potential and cost reduction. Common Examples: Reward, Reach, Impact, Confidence, Fun.
            </p>

            <table style={{ width: '100%', marginBottom: '16px', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px', color: 'var(--ink)', fontWeight: 600 }}>Factor</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: 'var(--ink)', fontWeight: 600 }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: 'var(--ink)', fontWeight: 600 }}>Weight</th>
                  <th style={{ textAlign: 'center', padding: '8px', color: 'var(--ink)', fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {benefitFactors.map((factor, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="text"
                        value={factor.name}
                        onChange={(e) => {
                          const updated = [...benefitFactors]
                          updated[idx].name = e.target.value
                          setBenefitFactors(updated)
                        }}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          fontSize: '11px'
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <select
                        value={factor.type}
                        onChange={(e) => {
                          const updated = [...benefitFactors]
                          updated[idx].type = e.target.value
                          setBenefitFactors(updated)
                        }}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          fontSize: '11px'
                        }}
                      >
                        {typeOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={factor.weight}
                        onChange={(e) => {
                          const updated = [...benefitFactors]
                          updated[idx].weight = parseInt(e.target.value) || 0
                          setBenefitFactors(updated)
                        }}
                        style={{
                          width: '60px',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          fontSize: '11px'
                        }}
                      />
                      %
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button
                        onClick={() => removeBenefitFactor(idx)}
                        style={{
                          background: '#fee2e2',
                          color: '#991b1b',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 600
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              onClick={addBenefitFactor}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: '#fff',
                color: 'var(--ink)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              + Add a new factor
            </button>
          </div>

          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: 'var(--ink)' }}>
              Cost Factors
            </h2>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
              Costs encompass how hard or expensive it is to build an Idea. Common examples: Effort, Developer difficulty, Monetary cost, Person months.
            </p>

            <table style={{ width: '100%', marginBottom: '16px', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px', color: 'var(--ink)', fontWeight: 600 }}>Factor</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: 'var(--ink)', fontWeight: 600 }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: 'var(--ink)', fontWeight: 600 }}>Weight</th>
                  <th style={{ textAlign: 'center', padding: '8px', color: 'var(--ink)', fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {costFactors.map((factor, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="text"
                        value={factor.name}
                        onChange={(e) => {
                          const updated = [...costFactors]
                          updated[idx].name = e.target.value
                          setCostFactors(updated)
                        }}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          fontSize: '11px'
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <select
                        value={factor.type}
                        onChange={(e) => {
                          const updated = [...costFactors]
                          updated[idx].type = e.target.value
                          setCostFactors(updated)
                        }}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          fontSize: '11px'
                        }}
                      >
                        {typeOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={factor.weight}
                        onChange={(e) => {
                          const updated = [...costFactors]
                          updated[idx].weight = parseInt(e.target.value) || 0
                          setCostFactors(updated)
                        }}
                        style={{
                          width: '60px',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          fontSize: '11px'
                        }}
                      />
                      %
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button
                        onClick={() => removeCostFactor(idx)}
                        style={{
                          background: '#fee2e2',
                          color: '#991b1b',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 600
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              onClick={addCostFactor}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: '#fff',
                color: 'var(--ink)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              + Add a new factor
            </button>
          </div>

          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
              Priority Score Display
            </h2>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
              Choose how to display the priority score
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
              {[
                { value: 'none', label: 'None' },
                { value: 'quadrant', label: 'Quadrant label' },
                { value: 'score', label: 'Score & label' }
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setScoreDisplay(opt.value as any)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: scoreDisplay === opt.value ? 'none' : '1px solid var(--border)',
                    background: scoreDisplay === opt.value ? 'var(--coral)' : '#fff',
                    color: scoreDisplay === opt.value ? '#fff' : 'var(--ink)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showInBoard}
                onChange={(e) => setShowInBoard(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                Show priority scores in your Board & Roadmap
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={normalizeScores}
                onChange={(e) => setNormalizeScores(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                Normalize priority scores (0-100)
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={makePublic}
                onChange={(e) => setMakePublic(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                Make priority scores public (your customers will see priority scores and labels)
              </span>
            </label>
          </div>
        </div>
      )}

      <div style={{ marginTop: '32px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            background: 'var(--coral)',
            color: '#fff',
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            opacity: saving ? 0.7 : 1
          }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
