import { useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { adminApi } from './api/adminApi'
import { authApi, useLogoutMutation } from './api/authApi'
import { profileApi } from './api/profileApi'
import { raceApi, useGetRaceQuery } from './api/raceApi'
import { withingsApi } from './api/withingsApi'
import { useUser } from './hooks/useUser'
import { prepareRace } from './race/prepareRace'
import { RaceChart } from './race/RaceChart'
import { createRaceView, type RaceMode } from './race/raceModes'
import { createSampleRace } from './race/sampleRace'

export const Home = ({ radiator = false }: { radiator?: boolean }) => {
  const { user } = useUser()
  const [logout, { isLoading }] = useLogoutMutation()
  const [logoutError, setLogoutError] = useState(false)
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [params, setParams] = useSearchParams()
  const mode: RaceMode = params.get('mode') === 'bmi' ? 'bmi' : 'classic'
  const settingsUrl = mode === 'bmi' ? '/settings?mode=bmi' : '/settings'
  const live = radiator || params.get('data') !== 'sample'
  const {
    data,
    isLoading: loadingRace,
    isFetching,
    isError,
    refetch
  } = useGetRaceQuery(radiator ? 'radiator' : undefined, {
    skip: !live,
    pollingInterval: live ? 30_000 : 0,
    refetchOnMountOrArgChange: true
  })
  const today = new Date().toISOString().slice(0, 10)
  const participants = useMemo(() => (data ? prepareRace(data.participants) : []), [data, today])
  const sampleRace = useMemo(() => createSampleRace(), [today])
  const view = useMemo(
    () => createRaceView(live ? participants : sampleRace, mode),
    [live, participants, sampleRace, mode]
  )
  const toggleParams = new URLSearchParams(params)
  toggleParams.set('data', live ? 'sample' : 'live')
  const fullscreenButton = (
    <button
      className="text-button fullscreen-button"
      type="button"
      title="Enter full screen (Esc to exit)"
      onClick={async () => {
        setFullscreenError(null)
        if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) {
          setFullscreenError(
            'Full screen is unavailable in this browser or embedded view. Use your browser’s full-screen option.'
          )
          return
        }
        try {
          await document.documentElement.requestFullscreen()
        } catch {
          setFullscreenError('Could not enter full screen. Please try again.')
        }
      }}
    >
      Full screen
    </button>
  )

  return (
    <main className={`dashboard${radiator ? ' dashboard--radiator' : ''}`}>
      <header className="race-header">
        <div>
          <h1 className="wordmark">Race to 75</h1>
          <p className="subtitle">
            {mode === 'bmi' ? 'BMI history' : 'Weigh-in history'} <span>·</span>{' '}
            {mode === 'bmi' ? 'Reference 25.0' : 'Goal 75.0 kg'}
          </p>
          <label className="race-mode">
            Race mode
            <select
              value={mode}
              onChange={(event) => {
                const next = new URLSearchParams(params)
                next.set('mode', event.target.value)
                setParams(next)
              }}
            >
              <option value="classic">Classic · 75 kg</option>
              <option value="bmi">BMI</option>
            </select>
          </label>
          {mode === 'bmi' && (
            <p className="bmi-note">
              BMI compares weight to height; it does not distinguish muscle from fat. 25 is a
              reference, not a personal goal.
              {!radiator &&
                live &&
                view.some((person) => person.id === user?.id && person.needsHeight) && (
                  <>
                    {' '}
                    <Link className="text-button" to={settingsUrl}>
                      Add your height
                    </Link>
                  </>
                )}
            </p>
          )}
        </div>
        {radiator ? (
          <span className="sample-indicator live-indicator">
            <span /> Live data
          </span>
        ) : (
          <Link
            className={`sample-indicator ${live ? 'live-indicator' : ''}`}
            to={`?${toggleParams}`}
            title={`Switch to ${live ? 'sample' : 'live'} data`}
          >
            <span /> {live ? 'Live data' : 'Sample data'}
          </Link>
        )}
      </header>
      {live && isError ? (
        <div className="race-message" role="alert">
          <p>Could not load weight history. Please try again.</p>
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
          Loading weight history…
        </p>
      ) : (
        <RaceChart
          key={`${live ? 'live' : 'sample'}-${mode}`}
          participants={view}
          mode={mode}
          live={live}
          radiator={radiator}
        />
      )}
      <footer className={`dashboard-footer${radiator ? ' dashboard-footer--radiator' : ''}`}>
        {!radiator && (
          <p>
            Signed in as{' '}
            <Link className="text-button" to={settingsUrl}>
              {user?.display_name}
            </Link>
          </p>
        )}
        {fullscreenButton}
        {!radiator && (
          <button
            className="text-button"
            type="button"
            disabled={isLoading}
            onClick={async () => {
              setLogoutError(false)
              try {
                await logout().unwrap()
                dispatch(authApi.util.resetApiState())
                dispatch(profileApi.util.resetApiState())
                dispatch(raceApi.util.resetApiState())
                dispatch(withingsApi.util.resetApiState())
                dispatch(adminApi.util.resetApiState())
                navigate('/login')
              } catch {
                setLogoutError(true)
              }
            }}
          >
            {isLoading ? 'Logging out…' : 'Log out'}
          </button>
        )}
      </footer>
      {fullscreenError && <p role="alert">{fullscreenError}</p>}
      {logoutError && <p role="alert">Could not log out. Please try again.</p>}
    </main>
  )
}
