import { useState } from 'react'

import {
  type Invitation,
  type ManagedUser,
  useIssueEnrollmentMutation,
  useUpdateUserMutation
} from '../api/adminApi'
import { adminErrorMessage } from './errors'
import { UserDetailsForm } from './UserDetailsForm'

export const UserCard = ({
  user,
  currentUserId,
  onInvitation,
  onChanged
}: {
  user: ManagedUser
  currentUserId: string
  onInvitation: (invitation: Invitation) => void
  onChanged: () => void
}) => {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [update, { isLoading: updating }] = useUpdateUserMutation()
  const [issue, { isLoading: issuing, reset }] = useIssueEnrollmentMutation()
  const busy = updating || issuing
  const self = user.id === currentUserId
  const disabled = Boolean(user.disabled_at)

  const save = async (changes: {
    email?: string
    display_name?: string
    role?: 'admin' | 'member'
    disabled?: boolean
  }) => {
    setError('')
    setMessage('')
    try {
      await update({ id: user.id, ...changes }).unwrap()
      setEditing(false)
      setMessage('Account updated.')
      onChanged()
      return true
    } catch (error) {
      setError(adminErrorMessage(error))
      return false
    }
  }

  return (
    <article className="admin-user" aria-labelledby={`user-${user.id}`}>
      <div className="admin-user-header">
        <div>
          <h3 id={`user-${user.id}`}>
            {user.display_name}
            {self && <span className="admin-you"> (you)</span>}
          </h3>
          <p className="auth-description">{user.email}</p>
        </div>
        <div className="admin-badges">
          <span className={`race-badge ${user.role === 'admin' ? 'personal-low' : ''}`}>
            {user.role === 'admin' ? 'Admin' : 'Member'}
          </span>
          <span className={`race-badge ${disabled ? 'setback' : user.enrolled ? 'winner' : ''}`}>
            {disabled ? 'Disabled' : user.enrolled ? 'Enrolled' : 'Awaiting enrollment'}
          </span>
        </div>
      </div>
      {editing ? (
        <UserDetailsForm
          label={`Edit ${user.display_name}`}
          initialName={user.display_name}
          initialEmail={user.email}
          busy={busy}
          submitLabel="Save changes"
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="admin-actions">
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setEditing(true)
              setError('')
              setMessage('')
            }}
          >
            Edit details
          </button>
          {!disabled && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    `Create a new enrollment link for ${user.display_name}? Previous unused links will stop working. Existing passkeys will keep working.`
                  )
                ) {
                  return
                }
                setError('')
                setMessage('')
                try {
                  onInvitation(await issue(user.id).unwrap())
                } catch (error) {
                  setError(adminErrorMessage(error))
                } finally {
                  reset()
                }
              }}
            >
              {issuing ? 'Creating link…' : 'New enrollment link'}
            </button>
          )}
          {!self && (
            <>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  const role = user.role === 'admin' ? 'member' : 'admin'
                  if (
                    window.confirm(
                      role === 'admin'
                        ? `Make ${user.display_name} an admin? They will be able to invite users and manage all accounts.`
                        : `Make ${user.display_name} a member? They will lose access to user management.`
                    )
                  ) {
                    void save({ role })
                  }
                }}
              >
                {user.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
              </button>
              <button
                type="button"
                className={`text-button ${disabled ? '' : 'danger-button'}`}
                disabled={busy}
                onClick={() => {
                  if (
                    disabled ||
                    window.confirm(
                      `Disable ${user.display_name}? App access will be blocked and unused enrollment links revoked. Readings and passkeys are kept; Withings imports continue.`
                    )
                  ) {
                    void save({ disabled: !disabled })
                  }
                }}
              >
                {disabled ? 'Enable account' : 'Disable account'}
              </button>
            </>
          )}
        </div>
      )}
      {self && (
        <p className="auth-hint">Another admin can change your role or disable your account.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {message && (
        <p className="admin-success" role="status">
          {message}
        </p>
      )}
    </article>
  )
}
