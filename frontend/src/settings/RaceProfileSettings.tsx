import { useState } from 'react'
import { useGetProfileQuery, useSaveProfileMutation } from '../api/profileApi'
import type { Sex } from '../api/raceApi'

export const RaceProfileSettings = () => {
  const { data, isLoading, isFetching, isError, refetch } = useGetProfileQuery()
  const [save, { isLoading: saving }] = useSaveProfileMutation()
  const [height, setHeight] = useState<string | null>(null)
  const [sex, setSex] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  return (
    <section
      id="race-profile"
      className="settings-panel"
      aria-labelledby="race-profile-heading"
      aria-busy={saving || isFetching}
    >
      <h2 id="race-profile-heading">Kisaprofiili</h2>
      <p className="auth-description">
        Lisää pituutesi BMI- ja hauisindeksiä varten sekä sukupuoli DOTS-laskentaa varten.
        Ihmisarvoon tarvitaan paino-, hauis-, verenpaine- ja SBD-tulos sekä nämä profiilitiedot.
        Arvot näkyvät ryhmälle ja yhteisellä kisanäytöllä. Pituuden tai sukupuolen korjaaminen
        laskee niistä riippuvan historian uudelleen.
      </p>
      {isLoading ? (
        <p>Ladataan profiilia…</p>
      ) : isError ? (
        <div role="alert">
          <p>Profiilin lataaminen epäonnistui. Yritä uudelleen.</p>
          <button
            className="text-button"
            type="button"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            Yritä ladata profiili uudelleen
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
                const selectedSex = sex ?? data.sex ?? ''
                const saved = await save({
                  heightCm,
                  sex: selectedSex === '' ? null : (selectedSex as Sex)
                }).unwrap()
                setHeight(String(saved.heightCm ?? ''))
                setSex(saved.sex ?? '')
                setMessage('Profiili tallennettu.')
              } catch {
                setError('Profiilin tallentaminen epäonnistui. Yritä uudelleen.')
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
            <label htmlFor="race-sex">
              Sukupuoli
              <select
                id="race-sex"
                value={sex ?? data.sex ?? ''}
                disabled={saving}
                aria-describedby="sex-hint"
                onChange={(event) => {
                  setSex(event.target.value)
                  setMessage('')
                  setError('')
                }}
              >
                <option value="">Ei valittu</option>
                <option value="male">Mies</option>
                <option value="female">Nainen</option>
              </select>
            </label>
            <p id="sex-hint" className="auth-hint">
              DOTS-kaava ja tasorajat valitaan sukupuolen mukaan. Valinta tarvitaan DOTS- ja
              Ihmisarvo-laskentaan.
            </p>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Tallennetaan…' : 'Tallenna profiili'}
            </button>
          </form>
        )
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
