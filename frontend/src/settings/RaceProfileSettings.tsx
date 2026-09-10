import { useState } from 'react'

import { useGetProfileQuery, useSaveProfileMutation } from '../api/profileApi'

export const RaceProfileSettings = () => {
  const { data, isLoading, isFetching, isError, refetch } = useGetProfileQuery()
  const [save, { isLoading: saving }] = useSaveProfileMutation()
  const [height, setHeight] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  return (
    <section
      className="settings-panel"
      aria-labelledby="race-profile-heading"
      aria-busy={saving || isFetching}
    >
      <h2 id="race-profile-heading">Kisaprofiili</h2>
      <p className="auth-description">
        Lisää pituutesi, niin näet BMI-indeksisi, hauisindeksisi ja niistä lasketun ihmisarvosi
        kansalaispisteinä. Arvot näkyvät ryhmälle ja yhteisellä kisanäytöllä. Pituuden päivittäminen
        laskee koko indeksihistorian uudelleen.
      </p>
      {isLoading ? (
        <p>Ladataan pituutta…</p>
      ) : isError ? (
        <div role="alert">
          <p>Pituuden lataaminen epäonnistui. Yritä uudelleen.</p>
          <button
            className="text-button"
            type="button"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            Yritä ladata pituus uudelleen
          </button>
        </div>
      ) : (
        data && (
          <form
            className="integration-form"
            onSubmit={async (event) => {
              event.preventDefault()
              setError('')
              setMessage('')
              const value = (height ?? String(data.heightCm ?? '')).trim()
              const heightCm = value === '' ? null : Number(value)
              if (
                heightCm !== null &&
                (!Number.isFinite(heightCm) ||
                  heightCm < 50 ||
                  heightCm > 300 ||
                  Math.abs(heightCm * 10 - Math.round(heightCm * 10)) > 1e-8)
              ) {
                setError(
                  'Anna pituus väliltä 50–300 cm enintään yhden desimaalin tarkkuudella tai jätä kenttä tyhjäksi.'
                )
                return
              }
              try {
                const saved = await save({ heightCm }).unwrap()
                setHeight(String(saved.heightCm ?? ''))
                setMessage(saved.heightCm === null ? 'Pituus poistettu.' : 'Pituus tallennettu.')
              } catch {
                setError('Pituuden tallentaminen epäonnistui. Yritä uudelleen.')
              }
            }}
          >
            <label htmlFor="race-height">
              Pituus (cm)
              <input
                id="race-height"
                type="number"
                min="50"
                max="300"
                step="0.1"
                inputMode="decimal"
                value={height ?? String(data.heightCm ?? '')}
                disabled={saving}
                aria-describedby="height-hint"
                onChange={(event) => {
                  setHeight(event.target.value)
                  setMessage('')
                  setError('')
                }}
              />
            </label>
            <p id="height-hint" className="auth-hint">
              Esimerkiksi 180,5 cm. Poista pituutesi jättämällä kenttä tyhjäksi ja tallentamalla.
            </p>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Tallennetaan…' : 'Tallenna pituus'}
            </button>
          </form>
        )
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
