import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

type Connection = {
  status: 'disconnected' | 'connected' | 'reconnect_required'
  profileName?: string
  lastSyncedAt?: string | null
  lastError?: string | null
  syncing?: boolean
}
type Setup = { setupId: string; profiles: { id: string; name: string }[] }

async function eufyRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/integrations/eufy${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || 'Could not reach Eufy Life. Please try again.')
  }
  const result = response.status === 204 ? (undefined as T) : await response.json()
  if (method !== 'GET') {
    window.dispatchEvent(new Event('eufy-connection-changed'))
  }
  return result
}

export const EufySettings = () => {
  const [params] = useSearchParams()
  const [connection, setConnection] = useState<Connection>()
  const [setup, setSetup] = useState<Setup>()
  const [profileId, setProfileId] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (params.get('eufy') === 'reconnect') {
      setSigningIn(true)
    }
  }, [params])

  const refresh = async () => {
    setConnection(await eufyRequest<Connection>('/status'))
  }
  useEffect(() => {
    let mounted = true
    const poll = () => {
      eufyRequest<Connection>('/status')
        .then((status) => {
          if (mounted) {
            setConnection(status)
          }
        })
        .catch(() => {
          if (mounted) {
            setError('Could not check your Eufy Life connection.')
          }
        })
    }
    poll()
    const timer = window.setInterval(poll, 30_000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="eufy-heading" aria-busy={busy}>
      <h2 id="eufy-heading">Eufy Life</h2>
      <p className="connection-status">
        {!connection
          ? 'Checking connection…'
          : connection.status === 'connected'
            ? 'Connected'
            : connection.status === 'reconnect_required'
              ? 'Reconnect to resume syncing'
              : 'Not connected'}
      </p>
      {connection?.profileName && <p>Profile: {connection.profileName}</p>}
      <p className="auth-description">
        Import weight readings from the last three months, then sync every 15 minutes. Your scale
        readings must reach Eufy Life before they can appear here.
      </p>
      {connection?.lastSyncedAt && (
        <p className="auth-hint">
          Last synced: {new Date(connection.lastSyncedAt).toLocaleString()}
        </p>
      )}
      {connection?.status === 'connected' && !connection.lastSyncedAt && (
        <p className="auth-hint">Waiting for the first successful import.</p>
      )}
      {connection?.syncing && <p role="status">Importing weight readings…</p>}
      {connection?.lastError && <p role="alert">{connection.lastError}</p>}
      {!signingIn && !setup && connection && (
        <button
          className="primary-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setError('')
            setSigningIn(true)
          }}
        >
          {connection.status === 'disconnected' ? 'Connect Eufy Life' : 'Reconnect Eufy Life'}
        </button>
      )}
      {signingIn && !setup && (
        <form
          className="integration-form"
          onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            const fields = new FormData(form)
            const email = String(fields.get('email') ?? '').trim()
            const password = String(fields.get('password') ?? '')
            form.reset()
            void act(async () => {
              const result = await eufyRequest<Setup>('/login', 'POST', { email, password })
              setSetup(result)
              setProfileId('')
              setSigningIn(false)
            })
          }}
        >
          <p className="auth-hint">
            Your email and password are used only to sign in and are not saved. We keep a token;
            you’ll need to reconnect when it expires.
          </p>
          <label htmlFor="eufy-email">
            Eufy Life email
            <input
              id="eufy-email"
              name="email"
              type="email"
              autoComplete="off"
              maxLength={320}
              required
              disabled={busy}
            />
          </label>
          <label htmlFor="eufy-password">
            Eufy Life password
            <input
              id="eufy-password"
              name="password"
              type="password"
              autoComplete="off"
              maxLength={4096}
              required
              disabled={busy}
            />
          </label>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in to Eufy Life'}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setSigningIn(false)
              setError('')
            }}
          >
            Cancel
          </button>
        </form>
      )}
      {setup && (
        <form
          className="integration-form"
          onSubmit={(event) => {
            event.preventDefault()
            void act(async () => {
              const result = await eufyRequest<Connection>('/profile', 'POST', {
                setupId: setup.setupId,
                profileId
              })
              setSetup(undefined)
              setConnection(result)
            })
          }}
        >
          <label htmlFor="eufy-profile">
            Your Eufy Life profile
            <select
              id="eufy-profile"
              value={profileId}
              required
              disabled={busy}
              onChange={(event) => setProfileId(event.target.value)}
            >
              <option value="">Choose your profile</option>
              {setup.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <p className="auth-hint">
            Only the selected profile’s weight readings will be imported. Existing imported readings
            stay if you change profiles.
          </p>
          <button className="primary-button" type="submit" disabled={busy || !profileId}>
            {busy ? 'Importing…' : 'Use this profile'}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await eufyRequest('/setup', 'DELETE')
                setSetup(undefined)
              })
            }
          >
            Cancel
          </button>
        </form>
      )}
      {!signingIn && !setup && connection?.status === 'connected' && (
        <button
          className="text-button disconnect-button"
          type="button"
          disabled={busy || connection.syncing}
          onClick={() =>
            void act(async () => {
              setConnection(await eufyRequest<Connection>('/sync', 'POST'))
            })
          }
        >
          Sync now
        </button>
      )}
      {!signingIn && !setup && connection && connection.status !== 'disconnected' && (
        <>
          <button
            className="text-button disconnect-button"
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await eufyRequest('', 'DELETE')
                await refresh()
              })
            }
          >
            Disconnect Eufy Life
          </button>
          <p className="auth-hint">
            Disconnecting stops future imports. Previously imported readings stay in the race.
          </p>
        </>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          {!connection && (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => void act(refresh)}
            >
              Retry Eufy status
            </button>
          )}
        </div>
      )}
    </section>
  )
}
