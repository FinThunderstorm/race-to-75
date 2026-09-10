import { useState } from 'react'

import {
  useAddBicepsMeasurementMutation,
  useDeleteBicepsMeasurementMutation,
  useGetBicepsMeasurementsQuery
} from '../api/raceApi'
import { formatDate, formatNumber } from '../format'

export const BicepsSettings = () => {
  const { data, isLoading, isFetching, isError, refetch } = useGetBicepsMeasurementsQuery()
  const [add, { isLoading: adding }] = useAddBicepsMeasurementMutation()
  const [remove, { isLoading: removing }] = useDeleteBicepsMeasurementMutation()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [circumference, setCircumference] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const saving = adding || removing

  return (
    <section
      id="biceps"
      className="settings-panel"
      aria-labelledby="biceps-heading"
      aria-busy={saving || isFetching}
    >
      <h2 id="biceps-heading">Hauismittaukset</h2>
      <p className="auth-description">
        Kirjaa olkavartesi ympärysmitta senttimetreinä. Käytä aina samaa käsivartta ja mittaustapaa.
        Lisää pituutesi kisaprofiiliin, niin näet hauisindeksisi: 100 × ympärysmitta / pituus.
        Mittauksesi ja indeksisi näkyvät ryhmälle ja yhteisellä kisanäytöllä.
      </p>
      <form
        className="integration-form"
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          setMessage('')
          const circumferenceCm = Number(circumference)
          const parsedDate = new Date(`${date}T00:00:00Z`)
          if (
            !Number.isFinite(circumferenceCm) ||
            circumferenceCm < 1 ||
            circumferenceCm > 100 ||
            Math.abs(circumferenceCm * 10 - Math.round(circumferenceCm * 10)) > 1e-8 ||
            !Number.isFinite(parsedDate.getTime()) ||
            parsedDate.toISOString().slice(0, 10) !== date ||
            date < '0001-01-01' ||
            date > today
          ) {
            setError(
              'Anna 1–100 cm enintään yhden desimaalin tarkkuudella ja kelvollinen päivämäärä, joka on viimeistään tänään (UTC).'
            )
            return
          }
          try {
            await add({ measuredAt: date, circumferenceCm }).unwrap()
            setCircumference('')
            setMessage('Mittaus lisätty.')
          } catch {
            setError('Mittauksen tallentaminen epäonnistui. Yritä uudelleen.')
          }
        }}
      >
        <label htmlFor="biceps-circumference">
          Ympärysmitta (cm)
          <input
            id="biceps-circumference"
            type="number"
            min="1"
            max="100"
            step="0.1"
            inputMode="decimal"
            required
            disabled={saving}
            value={circumference}
            onChange={(event) => {
              setCircumference(event.target.value)
              setMessage('')
              setError('')
            }}
          />
        </label>
        <label htmlFor="biceps-date">
          Mittauspäivä (UTC)
          <input
            id="biceps-date"
            type="date"
            min="0001-01-01"
            max={today}
            required
            disabled={saving}
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              setMessage('')
              setError('')
            }}
          />
        </label>
        <p className="auth-hint">Saman päivän mittauksista näytetään kuvaajassa keskiarvo.</p>
        <button className="primary-button" type="submit" disabled={saving}>
          {adding ? 'Tallennetaan…' : 'Lisää mittaus'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {isLoading ? (
        <p>Ladataan mittauksia…</p>
      ) : isError ? (
        <div role="alert">
          <p>Mittausten lataaminen epäonnistui. Yritä uudelleen.</p>
          <button
            className="text-button"
            type="button"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            Yritä ladata mittaukset uudelleen
          </button>
        </div>
      ) : (
        data &&
        (data.measurements.length ? (
          <div className="table-scroll">
            <table>
              <caption>Hauismittauksesi</caption>
              <thead>
                <tr>
                  <th scope="col">Päivämäärä (UTC)</th>
                  <th scope="col">cm</th>
                  <th scope="col">Toiminnot</th>
                </tr>
              </thead>
              <tbody>
                {data.measurements.map((reading) => (
                  <tr key={reading.id}>
                    <td>{formatDate(reading.measuredAt)}</td>
                    <td>{formatNumber(reading.circumferenceCm)}</td>
                    <td>
                      <button
                        className="text-button"
                        type="button"
                        disabled={saving}
                        aria-label={`Poista mittaus ${formatDate(reading.measuredAt)}, ${formatNumber(reading.circumferenceCm)} cm`}
                        onClick={async () => {
                          setError('')
                          setMessage('')
                          try {
                            await remove(reading.id).unwrap()
                            setMessage('Mittaus poistettu.')
                          } catch {
                            setError('Mittauksen poistaminen epäonnistui. Yritä uudelleen.')
                          }
                        }}
                      >
                        Poista
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Ei vielä mittauksia.</p>
        ))
      )}
    </section>
  )
}
