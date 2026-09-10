import { useState } from 'react'

import {
  useAddBloodPressureMeasurementMutation,
  useDeleteBloodPressureMeasurementMutation,
  useGetBloodPressureMeasurementsQuery
} from '../api/raceApi'
import { formatDate } from '../format'

export const BloodPressureSettings = () => {
  const { data, isLoading, isFetching, isError, refetch } = useGetBloodPressureMeasurementsQuery()
  const [add, { isLoading: adding }] = useAddBloodPressureMeasurementMutation()
  const [remove, { isLoading: removing }] = useDeleteBloodPressureMeasurementMutation()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const saving = adding || removing

  return (
    <section
      id="blood-pressure"
      className="settings-panel"
      aria-labelledby="blood-pressure-heading"
      aria-busy={saving || isFetching}
    >
      <h2 id="blood-pressure-heading">Verenpainemittaukset</h2>
      <p className="auth-description">
        Kirjaa mittarin näyttämä ylä- ja alapaine elohopeamillimetreinä (mmHg). Mittauksesi näkyvät
        ryhmälle ja yhteisellä kisanäytöllä. Virheellisen kirjauksen voi poistaa ja lisätä
        uudelleen.
      </p>
      <form
        className="integration-form"
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          setMessage('')
          const upper = Number(systolic)
          const lower = Number(diastolic)
          const parsedDate = new Date(`${date}T00:00:00Z`)
          if (
            !Number.isInteger(upper) ||
            !Number.isInteger(lower) ||
            upper < 1 ||
            upper > 300 ||
            lower < 1 ||
            lower > 300 ||
            upper <= lower ||
            !Number.isFinite(parsedDate.getTime()) ||
            parsedDate.toISOString().slice(0, 10) !== date ||
            date < '0001-01-01' ||
            date > today
          ) {
            setError(
              'Anna paineet kokonaislukuina väliltä 1–300 mmHg. Yläpaineen on oltava alapaineen yläpuolella ja päivämäärän viimeistään tänään (UTC).'
            )
            return
          }
          try {
            await add({ measuredAt: date, systolic: upper, diastolic: lower }).unwrap()
            setSystolic('')
            setDiastolic('')
            setMessage('Mittaus lisätty.')
          } catch {
            setError('Mittauksen tallentaminen epäonnistui. Yritä uudelleen.')
          }
        }}
      >
        {[
          { id: 'systolic', label: 'Yläpaine (mmHg)', value: systolic, setValue: setSystolic },
          { id: 'diastolic', label: 'Alapaine (mmHg)', value: diastolic, setValue: setDiastolic }
        ].map(({ id, label, value, setValue }) => (
          <label key={id} htmlFor={`blood-pressure-${id}`}>
            {label}
            <input
              id={`blood-pressure-${id}`}
              type="number"
              min="1"
              max="300"
              step="1"
              inputMode="numeric"
              required
              disabled={saving}
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setMessage('')
                setError('')
              }}
            />
          </label>
        ))}
        <label htmlFor="blood-pressure-date">
          Mittauspäivä (UTC)
          <input
            id="blood-pressure-date"
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
              <caption>Verenpainemittauksesi</caption>
              <thead>
                <tr>
                  <th scope="col">Päivämäärä (UTC)</th>
                  <th scope="col">Yläpaine / alapaine (mmHg)</th>
                  <th scope="col">Toiminnot</th>
                </tr>
              </thead>
              <tbody>
                {data.measurements.map((reading) => (
                  <tr key={reading.id}>
                    <td>{formatDate(reading.measuredAt)}</td>
                    <td>
                      {reading.systolic} / {reading.diastolic}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        type="button"
                        disabled={saving}
                        aria-label={`Poista mittaus ${formatDate(reading.measuredAt)}, ${reading.systolic}/${reading.diastolic} mmHg`}
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
