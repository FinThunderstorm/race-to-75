import { useEffect, useMemo, useState } from 'react'
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
import { createRaceView, parseRaceMode, raceModeOrder, raceModes } from './race/raceModes'
import { createSampleRace } from './race/sampleRace'

export const Home = ({ radiator = false }: { radiator?: boolean }) => {
  const { user } = useUser()
  const [logout, { isLoading }] = useLogoutMutation()
  const [logoutError, setLogoutError] = useState(false)
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(true)
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [params, setParams] = useSearchParams()
  const mode = parseRaceMode(params.get('mode'))
  useEffect(() => {
    if (!playing) {
      return
    }
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(params)
      next.set('mode', raceModeOrder[(raceModeOrder.indexOf(mode) + 1) % raceModeOrder.length])
      setParams(next, { replace: true })
    }, 10_000)
    return () => window.clearTimeout(timeout)
  }, [playing, mode, params, setParams])
  const settingsUrl = `/settings?mode=${mode}`
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
  const views = useMemo(
    () => ({
      classic: createRaceView(live ? participants : sampleRace, 'classic'),
      bmi: createRaceView(live ? participants : sampleRace, 'bmi'),
      biceps: createRaceView(live ? participants : sampleRace, 'biceps'),
      'blood-pressure': createRaceView(live ? participants : sampleRace, 'blood-pressure'),
      score: createRaceView(live ? participants : sampleRace, 'score')
    }),
    [live, participants, sampleRace]
  )
  const view = views[mode]
  const toggleParams = new URLSearchParams(params)
  toggleParams.set('data', live ? 'sample' : 'live')
  const fullscreenButton = (
    <button
      className="text-button fullscreen-button"
      type="button"
      title="Avaa koko näyttö (poistu Esc-näppäimellä)"
      onClick={async () => {
        setFullscreenError(null)
        if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) {
          setFullscreenError(
            'Koko näytön tila ei ole käytettävissä tässä näkymässä. Käytä selaimen koko näytön toimintoa.'
          )
          return
        }
        try {
          await document.documentElement.requestFullscreen()
        } catch {
          setFullscreenError('Koko näytön avaaminen epäonnistui. Yritä uudelleen.')
        }
      }}
    >
      Koko näyttö
    </button>
  )

  return (
    <main className={`dashboard${radiator ? ' dashboard--radiator' : ''}`}>
      <header className="race-header">
        <div>
          <h1 className="wordmark">Race to 75</h1>
          <div className="race-mode" role="group" aria-label="Kisanäkymä">
            <button
              className="race-mode-playback"
              type="button"
              aria-label={
                playing
                  ? 'Keskeytä näkymien automaattinen vaihto'
                  : 'Käynnistä näkymien automaattinen vaihto'
              }
              title={
                playing
                  ? 'Keskeytä näkymien automaattinen vaihto'
                  : 'Käynnistä näkymien automaattinen vaihto'
              }
              onClick={() => setPlaying((previous) => !previous)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
              >
                {playing ? <path d="M2 1h3v10H2zM7 1h3v10H7z" /> : <path d="M3 1l8 5-8 5z" />}
              </svg>
            </button>
            {raceModeOrder.map((option) => (
              <button
                key={option}
                type="button"
                className={option === 'score' ? 'race-mode-score' : undefined}
                aria-pressed={mode === option}
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.set('mode', option)
                  setParams(next)
                }}
              >
                {option === 'classic' ? 'Paino · 75 kg' : raceModes[option].label}
              </button>
            ))}
          </div>
          <div className="race-subtitles">
            <p className="subtitle" aria-hidden={mode !== 'classic'}>
              Painohistoria <span>·</span> Tavoite 75,0 kg
            </p>
            <p className="subtitle" aria-hidden={mode !== 'bmi'}>
              BMI <span>·</span> Kansalaispisteet suluissa
            </p>
            <p className="subtitle" aria-hidden={mode !== 'biceps'}>
              Hauis (cm) <span>·</span> Kansalaispisteet suluissa
            </p>
            <p className="subtitle" aria-hidden={mode !== 'blood-pressure'}>
              Verenpaine <span>·</span> Yläpaine ━ / alapaine ┄ · mmHg
            </p>
            <p className="subtitle" aria-hidden={mode !== 'score'}>
              Ihmisarvo <span>·</span> Kansalaispisteet
            </p>
          </div>
        </div>
        {radiator ? (
          <span className="sample-indicator live-indicator">
            <span /> Ryhmän mittaukset
          </span>
        ) : (
          <Link
            className={`sample-indicator ${live ? 'live-indicator' : ''}`}
            to={`?${toggleParams}`}
            title={live ? 'Näytä esimerkkimittaukset' : 'Näytä ryhmän mittaukset'}
          >
            <span /> {live ? 'Ryhmän mittaukset' : 'Esimerkkimittaukset'}
          </Link>
        )}
      </header>
      {live && isError ? (
        <div className="race-message" role="alert">
          <p>Mittaushistorian lataaminen epäonnistui. Yritä uudelleen.</p>
          <button
            className="text-button"
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? 'Yritetään uudelleen…' : 'Yritä uudelleen'}
          </button>
        </div>
      ) : live && (loadingRace || !data) ? (
        <p className="race-message" role="status">
          Ladataan mittaushistoriaa…
        </p>
      ) : (
        <RaceChart
          key={live ? 'live' : 'sample'}
          participants={view}
          classicParticipants={views.classic}
          bmiParticipants={views.bmi}
          mode={mode}
          live={live}
          radiator={radiator}
        />
      )}
      <div className="measurement-actions">
        {!radiator &&
          live &&
          view.some((person) => person.id === user?.id && person.needsHeight) && (
            <Link className="text-button" to={settingsUrl}>
              Lisää pituutesi
            </Link>
          )}
        {!radiator && (mode === 'biceps' || mode === 'score') && (
          <Link className="text-button" to={`${settingsUrl}#biceps`}>
            Lisää hauismittaus
          </Link>
        )}
        {!radiator && (mode === 'blood-pressure' || mode === 'score') && (
          <Link className="text-button" to={`${settingsUrl}#blood-pressure`}>
            Lisää verenpainemittaus
          </Link>
        )}
      </div>
      <footer className={`dashboard-footer${radiator ? ' dashboard-footer--radiator' : ''}`}>
        {!radiator && (
          <p>
            Kirjautuneena{' '}
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
            {isLoading ? 'Kirjaudutaan ulos…' : 'Kirjaudu ulos'}
          </button>
        )}
      </footer>
      {fullscreenError && <p role="alert">{fullscreenError}</p>}
      {logoutError && <p role="alert">Uloskirjautuminen epäonnistui. Yritä uudelleen.</p>}
    </main>
  )
}
