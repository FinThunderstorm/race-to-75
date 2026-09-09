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
      <h2 id="race-profile-heading">Race profile</h2>
      <p className="auth-description">
        Add your height to show BMI alongside your weight history. Your BMI will be visible to the
        group and on the shared race display. Updating height recalculates your BMI history.
      </p>
      {isLoading ? (
        <p>Loading height…</p>
      ) : isError ? (
        <div role="alert">
          <p>Could not load your height. Please try again.</p>
          <button
            className="text-button"
            type="button"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            Retry height
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
                  'Enter a height from 50 to 300 cm with at most one decimal, or leave it blank.'
                )
                return
              }
              try {
                const saved = await save({ heightCm }).unwrap()
                setHeight(String(saved.heightCm ?? ''))
                setMessage(saved.heightCm === null ? 'Height removed.' : 'Height saved.')
              } catch {
                setError('Could not save your height. Please try again.')
              }
            }}
          >
            <label htmlFor="race-height">
              Height (cm)
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
              For example, 180.5 cm. Leave blank and save to remove your height.
            </p>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save height'}
            </button>
          </form>
        )
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
