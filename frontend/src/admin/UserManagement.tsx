import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'

import { adminApi, type Invitation, useGetUsersQuery, useInviteUserMutation } from '../api/adminApi'
import { useUser } from '../hooks/useUser'
import { adminErrorMessage } from './errors'
import { UserCard } from './UserCard'
import { UserDetailsForm } from './UserDetailsForm'

export const UserManagement = () => {
  const { user } = useUser()
  const dispatch = useDispatch()
  const { data, isLoading, isFetching, isError, refetch } = useGetUsersQuery(undefined, {
    pollingInterval: 30_000,
    refetchOnMountOrArgChange: true
  })
  const [invite, { isLoading: inviting, reset }] = useInviteUserMutation()
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(
    () => () => {
      dispatch(adminApi.util.resetApiState())
    },
    [dispatch]
  )
  useEffect(() => {
    if (isError) {
      setInvitation(null)
    }
  }, [isError])

  const showInvitation = (value: Invitation) => {
    setInvitation(value)
    setCopyStatus('')
  }

  return (
    <section className="user-management" aria-labelledby="manage-users-heading">
      <header className="settings-section-header">
        <h2 id="manage-users-heading">Manage users</h2>
        <p className="auth-description">Invite people to the race and manage their access.</p>
      </header>
      {isLoading ? (
        <p role="status">Loading users…</p>
      ) : isError ? (
        <div role="alert">
          <p>Could not load users. Your admin access may have changed.</p>
          <button
            className="text-button"
            type="button"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <section className="settings-panel" aria-labelledby="invite-heading">
            <h3 id="invite-heading">Invite user</h3>
            <p className="auth-description">
              Create a member account, then share their one-time passkey enrollment link.
            </p>
            <UserDetailsForm
              label="Invite user"
              busy={inviting}
              submitLabel="Create invitation"
              onSubmit={async (details) => {
                setError('')
                setInvitation(null)
                try {
                  showInvitation(await invite(details).unwrap())
                  return true
                } catch (error) {
                  setError(adminErrorMessage(error))
                  return false
                } finally {
                  reset()
                }
              }}
            />
            {error && <p role="alert">{error}</p>}
          </section>
          {invitation && (
            <section className="admin-invitation" aria-labelledby="link-heading">
              <h3 id="link-heading">Enrollment link ready</h3>
              <p role="status">
                Share this link with {invitation.user.display_name} ({invitation.user.email}).
              </p>
              <label htmlFor="enrollment-link">Enrollment link</label>
              <input
                id="enrollment-link"
                value={invitation.enrollmentUrl}
                readOnly
                onFocus={(event) => event.target.select()}
              />
              <p className="auth-hint">
                Single-use · Expires {new Date(invitation.expiresAt).toLocaleString()}. No email is
                sent automatically.
              </p>
              <div className="admin-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(invitation.enrollmentUrl)
                      setCopyStatus('Link copied.')
                    } catch {
                      setCopyStatus('Select the link above and copy it manually.')
                    }
                  }}
                >
                  Copy link
                </button>
                <button className="text-button" type="button" onClick={() => setInvitation(null)}>
                  Dismiss
                </button>
              </div>
              {copyStatus && <p role="status">{copyStatus}</p>}
            </section>
          )}
          <section className="admin-users" aria-labelledby="users-heading">
            <div className="admin-user-header">
              <h3 id="users-heading">
                Users <span className="admin-count">{data?.users.length ?? 0}</span>
              </h3>
              <button
                className="text-button"
                type="button"
                disabled={isFetching}
                onClick={() => refetch()}
              >
                {isFetching ? 'Refreshing…' : 'Refresh users'}
              </button>
            </div>
            {data?.users.length === 0 && <p>No users yet. Invite someone above.</p>}
            {data?.users.map((managedUser) => (
              <UserCard
                key={managedUser.id}
                user={managedUser}
                currentUserId={user?.id ?? ''}
                onInvitation={showInvitation}
                onChanged={() => setInvitation(null)}
              />
            ))}
          </section>
        </>
      )}
    </section>
  )
}
