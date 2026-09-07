import { useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useLogoutMutation } from './api/authApi'
import { raceApi, useGetRaceQuery } from './api/raceApi'
import { withingsApi } from './api/withingsApi'
import { useUser } from './hooks/useUser'
import { prepareRace } from './race/prepareRace'
import { RaceChart } from './race/RaceChart'
import { createSampleRace } from './race/sampleRace'

export const Home = () => {
  const { user } = useUser()
  const [logout, { isLoading }] = useLogoutMutation()
  const [logoutError, setLogoutError] = useState(false)
  const [fullscreenError, setFullscreenError] = useState(false)
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [params] = useSearchParams()
  const live = params.get('data') === 'live'
  const {
    data,
    isLoading: loadingRace,
    isFetching,
    isError,
    refetch
  } = useGetRaceQuery(undefined, {
    skip: !live,
    pollingInterval: live ? 30_000 : 0,
    refetchOnMountOrArgChange: true
  })
  const today = new Date().toISOString().slice(0, 10)
  const participants = useMemo(() => (data ? prepareRace(data.participants) : []), [data, today])
  const sampleRace = useMemo(() => createSampleRace(), [today])
  const toggleParams = new URLSearchParams(params)
  toggleParams.set('data', live ? 'sample' : 'live')

  return (
    <main className="dashboard">
      <header className="race-header">
        <div>
          <h1 className="wordmark">Race to 75</h1>
          <p className="subtitle">
            Weigh-in history <span>·</span> Goal 75.0 kg
          </p>
        </div>
        <Link
          className={`sample-indicator ${live ? 'live-indicator' : ''}`}
          to={`?${toggleParams}`}
          title={`Switch to ${live ? 'sample' : 'live Withings'} data`}
        >
          <span /> {live ? 'Live data' : 'Sample data'}
        </Link>
      </header>
      {live && isError ? (
        <div className="race-message" role="alert">
          <p>Could not load Withings data. Please try again.</p>
          <button
            className="text-button"
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      ) : live && (loadingRace || !data) ? (
        <p className="race-message" role="status">
          Loading Withings data…
        </p>
      ) : (
        <RaceChart
          key={live ? 'live' : 'sample'}
          participants={live ? participants : sampleRace}
          live={live}
        />
      )}
      <footer className="dashboard-footer">
        <p>
          Signed in as{' '}
          <Link className="text-button" to="/profile">
            {user?.display_name}
          </Link>
        </p>
        {document.fullscreenEnabled && (
          <button
            className="text-button fullscreen-button"
            type="button"
            title="Enter full screen (Esc to exit)"
            onClick={async () => {
              setFullscreenError(false)
              try {
                await document.documentElement.requestFullscreen()
              } catch {
                setFullscreenError(true)
              }
            }}
          >
            Full screen
          </button>
        )}
        <button
          className="text-button"
          type="button"
          disabled={isLoading}
          onClick={async () => {
            setLogoutError(false)
            try {
              await logout().unwrap()
              dispatch(raceApi.util.resetApiState())
              dispatch(withingsApi.util.resetApiState())
              navigate('/login')
            } catch {
              setLogoutError(true)
            }
          }}
        >
          {isLoading ? 'Logging out…' : 'Log out'}
        </button>
      </footer>
      {fullscreenError && <p role="alert">Could not enter full screen. Please try again.</p>}
      {logoutError && <p role="alert">Could not log out. Please try again.</p>}
    </main>
  )
}
