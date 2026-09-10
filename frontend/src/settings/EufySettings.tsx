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

// Older connections can still contain English errors saved before localization.
const eufyErrors: Record<string, string> = {
  'Too many sign-in attempts. Try again in a minute.':
    'Liian monta kirjautumisyritystä. Yritä uudelleen minuutin kuluttua.',
  'Could not sign in to Eufy Life. Please try again.':
    'Eufy Lifeen kirjautuminen epäonnistui. Yritä uudelleen.',
  'Enter your Eufy Life email and password.': 'Anna Eufy Life -sähköpostisi ja -salasanasi.',
  'Eufy Life rejected sign-in. Check your email and password.':
    'Eufy Life hylkäsi kirjautumisen. Tarkista sähköpostisi ja salasanasi.',
  'Select a Eufy Life profile.': 'Valitse Eufy Life -profiili.',
  'Profile selection expired or is invalid. Sign in to Eufy Life again.':
    'Profiilin valinta on vanhentunut tai virheellinen. Kirjaudu Eufy Lifeen uudelleen.',
  'That Eufy profile is already connected to another race participant.':
    'Tämä Eufy-profiili on jo yhdistetty toiseen kisaajaan.',
  'Could not save the Eufy connection. Try again.':
    'Eufy-yhteyden tallentaminen epäonnistui. Yritä uudelleen.',
  'Connect or reconnect Eufy Life before syncing.':
    'Yhdistä Eufy Life tai muodosta yhteys uudelleen ennen synkronointia.',
  'Eufy Life sign-in is required.': 'Kirjaudu Eufy Lifeen.',
  'Eufy Life is unavailable or returned an unexpected response. Try again later.':
    'Eufy Life ei ole käytettävissä tai palautti odottamattoman vastauksen. Yritä myöhemmin uudelleen.',
  'Reconnect Eufy Life to resume importing.':
    'Yhdistä Eufy Life uudelleen jatkaaksesi mittausten tuontia.'
}

function eufyErrorMessage(message: unknown) {
  if (typeof message === 'string') {
    if (Object.hasOwn(eufyErrors, message)) {
      return eufyErrors[message]
    }
    if (Object.values(eufyErrors).includes(message)) {
      return message
    }
  }
  return 'Yhteyden muodostaminen Eufy Lifeen epäonnistui. Yritä uudelleen.'
}

async function eufyRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/integrations/eufy${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(eufyErrorMessage(data?.error))
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
            setError('Eufy Life -yhteyden tarkistaminen epäonnistui.')
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
      setError(eufyErrorMessage(failure instanceof Error ? failure.message : undefined))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="eufy-heading" aria-busy={busy}>
      <h2 id="eufy-heading">Eufy Life</h2>
      <p className="connection-status">
        {!connection
          ? 'Tarkistetaan yhteyttä…'
          : connection.status === 'connected'
            ? 'Yhdistetty'
            : connection.status === 'reconnect_required'
              ? 'Yhdistä uudelleen jatkaaksesi synkronointia'
              : 'Ei yhdistetty'}
      </p>
      {connection?.profileName && <p>Profiili: {connection.profileName}</p>}
      <p className="auth-description">
        Tuo viimeisten kolmen kuukauden painomittaukset ja synkronoi sen jälkeen 15 minuutin välein.
        Vaakalukemien on siirryttävä Eufy Lifeen ennen kuin ne voivat näkyä täällä.
      </p>
      {connection?.lastSyncedAt && (
        <p className="auth-hint">
          Viimeksi synkronoitu: {new Date(connection.lastSyncedAt).toLocaleString('fi-FI')}
        </p>
      )}
      {connection?.status === 'connected' && !connection.lastSyncedAt && (
        <p className="auth-hint">Odotetaan ensimmäistä onnistunutta tuontia.</p>
      )}
      {connection?.syncing && <p role="status">Tuodaan painomittauksia…</p>}
      {connection?.lastError && <p role="alert">{eufyErrorMessage(connection.lastError)}</p>}
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
          {connection.status === 'disconnected'
            ? 'Yhdistä Eufy Life'
            : 'Yhdistä Eufy Life uudelleen'}
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
            Sähköpostiasi ja salasanaasi käytetään vain kirjautumiseen, eikä niitä tallenneta.
            Tallennamme käyttöoikeustunnisteen. Kun se vanhenee, sinun on yhdistettävä uudelleen.
          </p>
          <label htmlFor="eufy-email">
            Eufy Life -sähköposti
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
            Eufy Life -salasana
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
            {busy ? 'Kirjaudutaan…' : 'Kirjaudu Eufy Lifeen'}
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
            Peruuta
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
            Eufy Life -profiilisi
            <select
              id="eufy-profile"
              value={profileId}
              required
              disabled={busy}
              onChange={(event) => setProfileId(event.target.value)}
            >
              <option value="">Valitse profiilisi</option>
              {setup.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <p className="auth-hint">
            Vain valitun profiilin painomittaukset tuodaan. Aiemmin tuodut mittaukset säilyvät, jos
            vaihdat profiilia.
          </p>
          <button className="primary-button" type="submit" disabled={busy || !profileId}>
            {busy ? 'Tuodaan…' : 'Käytä tätä profiilia'}
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
            Peruuta
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
          Synkronoi nyt
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
            Katkaise Eufy Life -yhteys
          </button>
          <p className="auth-hint">
            Yhteyden katkaiseminen lopettaa uusien mittausten tuonnin. Aiemmin tuodut mittaukset
            säilyvät kisassa.
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
              Yritä tarkistaa Eufy-yhteys uudelleen
            </button>
          )}
        </div>
      )}
    </section>
  )
}
