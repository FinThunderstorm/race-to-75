import { useState } from 'react'
import { useGetScoreSettingsQuery, useSaveScoreSettingsMutation } from '../api/adminApi'
import {
  defaultScoreComponents,
  type ScoreComponent,
  scoreComponentLabels
} from '../race/scoreSettings'

export const ScoreSettings = () => {
  const { data, isLoading, isError, isFetching, refetch } = useGetScoreSettingsQuery()
  const [save, { isLoading: saving }] = useSaveScoreSettingsMutation()
  const [draft, setDraft] = useState<ScoreComponent[] | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const selected = draft ?? data?.components ?? []
  return (
    <section
      className="settings-panel score-settings"
      aria-labelledby="score-settings-heading"
      aria-busy={saving || isFetching}
    >
      <h2 id="score-settings-heading">Ihmisarvon mittarit</h2>
      <p className="auth-description">
        Valitse koko ryhmän Ihmisarvoon sisältyvät mittarit. Pisteet ovat valittujen mittarien
        osapisteiden keskiarvo. Muutos laskee myös aiemman pistehistorian uudelleen ja näkyy
        yhteisellä kisanäytöllä. Mittaukset säilyvät omissa näkymissään.
      </p>
      {isLoading ? (
        <p role="status">Ladataan mittarivalintoja…</p>
      ) : isError ? (
        <div role="alert">
          <p>Mittarivalintojen lataaminen epäonnistui.</p>
          <button
            className="text-button"
            disabled={isFetching}
            onClick={() => refetch()}
            type="button"
          >
            Yritä uudelleen
          </button>
        </div>
      ) : (
        data && (
          <form
            className="integration-form"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!selected.length) {
                return
              }
              setError('')
              setMessage('')
              try {
                const saved = await save({ components: [...selected] }).unwrap()
                setDraft(saved.components)
                setMessage('Ihmisarvon mittarit tallennettu.')
              } catch {
                setError(
                  'Mittarivalintojen tallentaminen epäonnistui. Tarkista ylläpito-oikeutesi ja yritä uudelleen.'
                )
              }
            }}
          >
            {defaultScoreComponents.map((component) => (
              <label key={component} className="score-setting-option">
                <input
                  type="checkbox"
                  checked={selected.includes(component)}
                  disabled={saving}
                  onChange={(event) => {
                    setDraft(
                      defaultScoreComponents.filter((key) =>
                        key === component ? event.target.checked : selected.includes(key)
                      )
                    )
                    setError('')
                    setMessage('')
                  }}
                />
                {scoreComponentLabels[component]}
              </label>
            ))}
            <p className="auth-hint">
              Valitse vähintään yksi mittari. Vain valittujen mittarien tiedot tarvitaan pisteiden
              laskentaan.
            </p>
            <button className="primary-button" type="submit" disabled={saving || !selected.length}>
              {saving ? 'Tallennetaan…' : 'Tallenna mittarit'}
            </button>
          </form>
        )
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
