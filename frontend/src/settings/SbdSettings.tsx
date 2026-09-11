import { useState } from 'react'

import { useGetProfileQuery } from '../api/profileApi'
import {
  useAddSbdMeasurementMutation,
  useDeleteSbdMeasurementMutation,
  useGetRaceQuery,
  useGetSbdMeasurementsQuery
} from '../api/raceApi'
import { formatDate, formatNumber } from '../format'
import { useUser } from '../hooks/useUser'
import {
  calculateDots,
  dotsBodyweight,
  dotsIndex,
  dotsLevel,
  hasDotsSex,
  sbdTotal
} from '../race/dots'

const validKg = (value: number, min: number, max: number) =>
  Number.isFinite(value) &&
  value >= min &&
  value <= max &&
  Math.abs(value * 10 - Math.round(value * 10)) < 1e-8

export const SbdSettings = () => {
  const { user } = useUser()
  const { data: profile } = useGetProfileQuery()
  const race = useGetRaceQuery()
  const { data, isLoading, isFetching, isError, refetch } = useGetSbdMeasurementsQuery()
  const [add, { isLoading: adding }] = useAddSbdMeasurementMutation()
  const [remove, { isLoading: removing }] = useDeleteSbdMeasurementMutation()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [lifts, setLifts] = useState({ squatKg: '', benchKg: '', deadliftKg: '' })
  const [weight, setWeight] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const saving = adding || removing
  const sex = profile?.sex
  const hasSex = hasDotsSex(sex)
  const previousWeight = race.data?.participants
    .find((person) => person.id === user?.id)
    ?.measurements.filter(
      (reading) =>
        reading.measuredAt.slice(0, 10) <= date && Date.parse(reading.measuredAt) <= Date.now()
    )
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0]
  const weightText =
    weight ?? (previousWeight ? String(Math.round(previousWeight.weightKg * 10) / 10) : '')
  const reading = {
    measuredAt: date,
    squatKg: Number(lifts.squatKg),
    benchKg: Number(lifts.benchKg),
    deadliftKg: Number(lifts.deadliftKg),
    bodyweightKg: Number(weightText)
  }
  const validNumbers =
    Object.values(lifts).every((value) => validKg(Number(value), 0.1, 1000)) &&
    validKg(reading.bodyweightKg, 1, 500)
  const dots = validNumbers ? calculateDots(sbdTotal(reading), reading.bodyweightKg, sex) : null

  return (
    <section
      id="sbd"
      className="settings-panel"
      aria-labelledby="sbd-heading"
      aria-busy={saving || isFetching}
    >
      <h2 id="sbd-heading">SBD-tulokset</h2>
      <p className="auth-description">
        Kirjaa kyykyn, penkkipunnerruksen ja maastavedon yhden toiston tulokset kilogrammoina. DOTS
        suhteuttaa yhteistuloksen kehonpainoon ja sukupuoleen. Tulokset näkyvät ryhmälle ja
        yhteisnäytöllä.
      </p>
      {!hasSex && (
        <p className="auth-hint">
          <a href="#race-profile">Valitse sukupuoli kisaprofiilissa</a> ennen tuloksen
          tallentamista.
        </p>
      )}
      <form
        className="integration-form"
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          setMessage('')
          const parsed = new Date(`${date}T00:00:00Z`)
          if (
            !hasSex ||
            !validNumbers ||
            !Number.isFinite(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== date ||
            date < '0001-01-01' ||
            date > today
          ) {
            setError(
              'Valitse sukupuoli profiilissa. Anna nostot väliltä 0,1–1000 kg ja kehonpaino väliltä 1–500 kg enintään yhden desimaalin tarkkuudella sekä kelvollinen tulospäivä, joka on viimeistään tänään (UTC).'
            )
            return
          }
          try {
            await add(reading).unwrap()
            setLifts({ squatKg: '', benchKg: '', deadliftKg: '' })
            setMessage('Tulos lisätty.')
          } catch {
            setError(
              'Tuloksen tallentaminen epäonnistui. Tarkista myös profiilin sukupuoli ja yritä uudelleen.'
            )
          }
        }}
      >
        {(
          [
            ['squatKg', 'Kyykky'],
            ['benchKg', 'Penkkipunnerrus'],
            ['deadliftKg', 'Maastaveto']
          ] as const
        ).map(([key, label]) => (
          <label key={key} htmlFor={`sbd-${key}`}>
            {label} (kg)
            <input
              id={`sbd-${key}`}
              type="number"
              min="0.1"
              max="1000"
              step="0.1"
              inputMode="decimal"
              required
              disabled={saving}
              value={lifts[key]}
              onChange={(event) => {
                setLifts({ ...lifts, [key]: event.target.value })
                setError('')
                setMessage('')
              }}
            />
          </label>
        ))}
        <label htmlFor="sbd-date">
          Tulospäivä (UTC)
          <input
            id="sbd-date"
            type="date"
            min="0001-01-01"
            max={today}
            required
            disabled={saving}
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              setError('')
              setMessage('')
            }}
          />
        </label>
        <label htmlFor="sbd-weight">
          Kehonpaino (kg)
          <input
            id="sbd-weight"
            type="number"
            min="1"
            max="500"
            step="0.1"
            inputMode="decimal"
            required
            disabled={saving}
            value={weightText}
            onChange={(event) => {
              setWeight(event.target.value)
              setError('')
              setMessage('')
            }}
          />
        </label>
        <p className="auth-hint">
          {weight === null && previousWeight
            ? `Esitäytetty punnituksesta ${formatDate(previousWeight.measuredAt)}. `
            : ''}
          Kehonpaino tallennetaan tähän tulokseen. Voit korjata esitäytetyn painon. Myöhemmät
          punnitukset eivät muuta tulosta.
        </p>
        {race.isError && (
          <p className="auth-hint">
            Painohistorian lataaminen epäonnistui. Voit syöttää painon itse.{' '}
            <button
              type="button"
              className="text-button"
              disabled={race.isFetching}
              onClick={() => race.refetch()}
            >
              Yritä ladata painohistoria uudelleen
            </button>
          </p>
        )}
        {dots !== null && hasSex && (
          <>
            <output aria-live="polite">
              Yhteistulos {formatNumber(sbdTotal(reading))} kg · {formatNumber(dots)} DOTS ·{' '}
              {dotsLevel(dots, sex)} · {formatNumber(dotsIndex(dots, sex))} kp
            </output>
            {dotsBodyweight(reading.bodyweightKg, sex) !== reading.bodyweightKg && (
              <p className="auth-hint">
                DOTS-kaava käyttää tämän painon kohdalla rajapainoa{' '}
                {dotsBodyweight(reading.bodyweightKg, sex)} kg. Syöttämäsi kehonpaino tallennetaan
                sellaisenaan.
              </p>
            )}
          </>
        )}
        <button type="submit" className="primary-button" disabled={saving || !hasSex}>
          {adding ? 'Tallennetaan…' : 'Lisää tulos'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {isLoading ? (
        <p>Ladataan tuloksia…</p>
      ) : isError ? (
        <div role="alert">
          <p>Tulosten lataaminen epäonnistui.</p>
          <button
            className="text-button"
            type="button"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            Yritä ladata tulokset uudelleen
          </button>
        </div>
      ) : (
        data &&
        (data.measurements.length ? (
          <div className="table-scroll">
            <table className="sbd-readings-table">
              <caption>SBD-tuloksesi</caption>
              <thead>
                <tr>
                  {[
                    'Päivämäärä (UTC)',
                    'Kyykky (kg)',
                    'Penkki (kg)',
                    'Maastaveto (kg)',
                    'Kehonpaino (kg)',
                    'Yhteensä (kg)',
                    'DOTS',
                    'Toiminnot'
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.measurements.map((item) => {
                  const score = calculateDots(sbdTotal(item), item.bodyweightKg, sex)
                  return (
                    <tr key={item.id}>
                      <td>{formatDate(item.measuredAt)}</td>
                      {[
                        item.squatKg,
                        item.benchKg,
                        item.deadliftKg,
                        item.bodyweightKg,
                        sbdTotal(item)
                      ].map((value, index) => (
                        <td key={index}>{formatNumber(value)}</td>
                      ))}
                      <td>{score === null ? '—' : formatNumber(score)}</td>
                      <td>
                        <button
                          className="text-button"
                          type="button"
                          disabled={saving}
                          aria-label={`Poista tulos ${formatDate(item.measuredAt)}, ${formatNumber(sbdTotal(item))} kg`}
                          onClick={async () => {
                            setError('')
                            setMessage('')
                            try {
                              await remove(item.id).unwrap()
                              setMessage('Tulos poistettu.')
                            } catch {
                              setError('Tuloksen poistaminen epäonnistui. Yritä uudelleen.')
                            }
                          }}
                        >
                          Poista
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Ei vielä SBD-tuloksia.</p>
        ))
      )}
    </section>
  )
}
