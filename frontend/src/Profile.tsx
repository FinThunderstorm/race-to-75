import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useDisconnectWithingsMutation, useGetWithingsStatusQuery } from './api/withingsApi'
import { useUser } from './hooks/useUser'

export const Profile = () => {
  const { user } = useUser()
  const [params, setParams] = useSearchParams()
  const { data, isLoading, isFetching, isError, refetch } = useGetWithingsStatusQuery()
  const [disconnect, { isLoading: disconnecting }] = useDisconnectWithingsMutation()
  const [disconnectError, setDisconnectError] = useState(false)
  const result = params.get('withings')

  return (
    <main className="profile-page">
      <Link className="text-button" to="/">
        ← Back to the race
      </Link>
      <header>
        <p className="eyebrow">Race to 75</p>
        <h1>Your profile</h1>
        <p className="profile-name">{user?.display_name}</p>
        <p className="auth-description">{user?.email}</p>
      </header>
      <section className="profile-connection" aria-labelledby="withings-heading">
        <h2 id="withings-heading">Withings</h2>
        {result === 'connected' && <p role="status">Withings connected.</p>}
        {result === 'cancelled' && (
          <p role="status">Connection cancelled. You can try again below.</p>
        )}
        {result === 'error' && <p role="alert">Could not connect Withings. Please try again.</p>}
        {result === 'unavailable' && (
          <p role="alert">Withings connection is currently unavailable.</p>
        )}
        {params.get('sync') === 'failed' && (
          <p role="alert">
            Your connection was saved, but importing readings failed. Reconnect to try again.
          </p>
        )}
        {params.get('updates') === 'failed' && (
          <p role="alert">Automatic updates could not be enabled. Reconnect to try again.</p>
        )}
        {isLoading ? (
          <p role="status">Checking connection…</p>
        ) : isError ? (
          <div role="alert">
            <p>Could not check your Withings connection.</p>
            <button
              className="text-button"
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              Try again
            </button>
          </div>
        ) : (
          data && (
            <>
              <p className="connection-status" role="status">
                {data.connected ? 'Connected' : 'Not connected'}
              </p>
              <p className="auth-description">
                {data.connected
                  ? 'Your imported weighings are available in the live chart.'
                  : 'Connect your Withings account to import your weighings into the race.'}
              </p>
              {data.configured ? (
                <a className="primary-button" href="/api/integrations/withings/connect">
                  {data.connected ? 'Reconnect Withings' : 'Connect Withings'}
                </a>
              ) : (
                <p className="auth-description">
                  Withings has not been configured for this app yet.
                </p>
              )}
              {data.connected && (
                <>
                  {!data.automaticUpdates && (
                    <p className="auth-hint">
                      Automatic updates are off. Reconnect to import your latest weighings.
                    </p>
                  )}
                  <button
                    className="text-button disconnect-button"
                    type="button"
                    disabled={disconnecting || isFetching}
                    onClick={async () => {
                      setDisconnectError(false)
                      try {
                        await disconnect().unwrap()
                        setParams({}, { replace: true })
                      } catch {
                        setDisconnectError(true)
                      }
                    }}
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect Withings'}
                  </button>
                  <p className="auth-hint">
                    Disconnecting stops future imports. Previously imported readings stay in the
                    race.
                  </p>
                </>
              )}
            </>
          )
        )}
        {disconnectError && <p role="alert">Could not disconnect Withings. Please try again.</p>}
      </section>
    </main>
  )
}
