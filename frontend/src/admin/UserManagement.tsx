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
        <h2 id="manage-users-heading">Käyttäjähallinta</h2>
        <p className="auth-description">
          Kutsu osallistujia kisaan ja hallitse heidän käyttöoikeuksiaan.
        </p>
      </header>
      {isLoading ? (
        <p role="status">Ladataan käyttäjiä…</p>
      ) : isError ? (
        <div role="alert">
          <p>Käyttäjien lataaminen epäonnistui. Ylläpito-oikeutesi ovat saattaneet muuttua.</p>
          <button
            className="text-button"
            type="button"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            Yritä uudelleen
          </button>
        </div>
      ) : (
        <>
          <section className="settings-panel" aria-labelledby="invite-heading">
            <h3 id="invite-heading">Kutsu käyttäjä</h3>
            <p className="auth-description">
              Luo osallistujatili ja jaa kertakäyttöinen linkki pääsyavaimen rekisteröintiin.
            </p>
            <UserDetailsForm
              label="Kutsu käyttäjä"
              busy={inviting}
              submitLabel="Luo kutsu"
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
              <h3 id="link-heading">Rekisteröitymislinkki on valmis</h3>
              <p role="status">
                Jaa tämä linkki käyttäjälle {invitation.user.display_name} ({invitation.user.email}
                ).
              </p>
              <label htmlFor="enrollment-link">Rekisteröitymislinkki</label>
              <input
                id="enrollment-link"
                value={invitation.enrollmentUrl}
                readOnly
                onFocus={(event) => event.target.select()}
              />
              <p className="auth-hint">
                Kertakäyttöinen · Vanhenee {new Date(invitation.expiresAt).toLocaleString('fi-FI')}.
                Sähköpostia ei lähetetä automaattisesti.
              </p>
              <div className="admin-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(invitation.enrollmentUrl)
                      setCopyStatus('Linkki kopioitu.')
                    } catch {
                      setCopyStatus('Valitse yllä oleva linkki ja kopioi se käsin.')
                    }
                  }}
                >
                  Kopioi linkki
                </button>
                <button className="text-button" type="button" onClick={() => setInvitation(null)}>
                  Sulje
                </button>
              </div>
              {copyStatus && <p role="status">{copyStatus}</p>}
            </section>
          )}
          <section className="admin-users" aria-labelledby="users-heading">
            <div className="admin-user-header">
              <h3 id="users-heading">
                Käyttäjät <span className="admin-count">{data?.users.length ?? 0}</span>
              </h3>
              <button
                className="text-button"
                type="button"
                disabled={isFetching}
                onClick={() => refetch()}
              >
                {isFetching ? 'Päivitetään…' : 'Päivitä käyttäjät'}
              </button>
            </div>
            {data?.users.length === 0 && (
              <p>Ei vielä käyttäjiä. Kutsu osallistuja yllä olevalla lomakkeella.</p>
            )}
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
