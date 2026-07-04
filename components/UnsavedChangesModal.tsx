'use client'

interface UnsavedChangesModalProps {
  isOpen: boolean
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

export function UnsavedChangesModal({
  isOpen,
  onSave,
  onDiscard,
  onCancel
}: UnsavedChangesModalProps) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: 'var(--canvas)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '400px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
          border: '1px solid var(--border)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--ink)',
            marginBottom: '12px'
          }}
        >
          Unsaved Changes
        </h2>

        <p
          style={{
            fontSize: '14px',
            color: '#666',
            marginBottom: '20px',
            lineHeight: '1.5'
          }}
        >
          You have unsaved changes. Would you like to save them as a draft before leaving?
        </p>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--ink)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Cancel
          </button>

          <button
            onClick={onDiscard}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid #e74c3c',
              backgroundColor: 'transparent',
              color: '#e74c3c',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(231, 76, 60, 0.1)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Don't Save
          </button>

          <button
            onClick={onSave}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'var(--coral)',
              color: 'white',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#ff6a57')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--coral)')}
          >
            Save as Draft
          </button>
        </div>
      </div>
    </div>
  )
}
