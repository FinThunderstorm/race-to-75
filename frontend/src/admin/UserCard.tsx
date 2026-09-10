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
      setMessage('Tili päivitetty.')
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
          <h4 id={`user-${user.id}`}>
            {user.display_name}
            {self && <span className="admin-you"> (sinä)</span>}
          </h4>
          <p className="auth-description">{user.email}</p>
        </div>
        <div className="admin-badges">
          <span className={`race-badge ${user.role === 'admin' ? 'personal-low' : ''}`}>
            {user.role === 'admin' ? 'Ylläpitäjä' : 'Osallistuja'}
          </span>
          <span className={`race-badge ${disabled ? 'setback' : user.enrolled ? 'winner' : ''}`}>
            {disabled
              ? 'Poistettu käytöstä'
              : user.enrolled
                ? 'Rekisteröitynyt'
                : 'Odottaa rekisteröitymistä'}
          </span>
        </div>
      </div>
      {editing ? (
        <UserDetailsForm
          label={`Muokkaa: ${user.display_name}`}
          initialName={user.display_name}
          initialEmail={user.email}
          busy={busy}
          submitLabel="Tallenna muutokset"
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
            Muokkaa tietoja
          </button>
          {!disabled && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    `Luodaanko käyttäjälle ${user.display_name} uusi rekisteröitymislinkki? Aiemmat käyttämättömät linkit lakkaavat toimimasta. Nykyiset pääsyavaimet toimivat edelleen.`
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
              {issuing ? 'Luodaan linkkiä…' : 'Uusi rekisteröitymislinkki'}
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
                        ? `Tehdäänkö käyttäjästä ${user.display_name} ylläpitäjä? Hän voi kutsua käyttäjiä ja hallita kaikkia tilejä.`
                        : `Muutetaanko käyttäjä ${user.display_name} osallistujaksi? Hän menettää pääsyn käyttäjähallintaan.`
                    )
                  ) {
                    void save({ role })
                  }
                }}
              >
                {user.role === 'admin' ? 'Muuta osallistujaksi' : 'Tee ylläpitäjäksi'}
              </button>
              <button
                type="button"
                className={`text-button ${disabled ? '' : 'danger-button'}`}
                disabled={busy}
                onClick={() => {
                  if (
                    disabled ||
                    window.confirm(
                      `Poistetaanko käyttäjän ${user.display_name} tili käytöstä? Pääsy sovellukseen estetään ja käyttämättömät rekisteröitymislinkit mitätöidään. Mittaukset ja pääsyavaimet säilytetään. Withings-tuonti jatkuu.`
                    )
                  ) {
                    void save({ disabled: !disabled })
                  }
                }}
              >
                {disabled ? 'Ota tili käyttöön' : 'Poista tili käytöstä'}
              </button>
            </>
          )}
        </div>
      )}
      {self && (
        <p className="auth-hint">
          Toinen ylläpitäjä voi vaihtaa rooliasi tai poistaa tilisi käytöstä.
        </p>
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
