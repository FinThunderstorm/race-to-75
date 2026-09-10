import { useState } from 'react'

import {
  useAddBicepsMeasurementMutation,
  useDeleteBicepsMeasurementMutation,
  useGetBicepsMeasurementsQuery
} from '../api/raceApi'

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
      <h2 id="biceps-heading">Biceps measurements</h2>
      <p className="auth-description">
        Record your upper-arm circumference in centimetres. Use the same arm and measurement method
        each time. Your measurements are visible to the group and on the shared race display.
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
              'Enter 1–100 cm with at most one decimal and a valid date no later than today (UTC).'
            )
            return
          }
          try {
            await add({ measuredAt: date, circumferenceCm }).unwrap()
            setCircumference('')
            setMessage('Measurement added.')
          } catch {
            setError('Could not save your measurement. Please try again.')
          }
        }}
      >
        <label htmlFor="biceps-circumference">
          Circumference (cm)
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
          Measurement date (UTC)
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
        <p className="auth-hint">
          Multiple measurements on the same day are averaged in the chart.
        </p>
        <button className="primary-button" type="submit" disabled={saving}>
          {adding ? 'Saving…' : 'Add measurement'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {isLoading ? (
        <p>Loading measurements…</p>
      ) : isError ? (
        <div role="alert">
          <p>Could not load your measurements. Please try again.</p>
          <button
            className="text-button"
            type="button"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            Retry measurements
          </button>
        </div>
      ) : (
        data &&
        (data.measurements.length ? (
          <div className="table-scroll">
            <table>
              <caption>Your biceps measurements</caption>
              <thead>
                <tr>
                  <th scope="col">Date (UTC)</th>
                  <th scope="col">cm</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.measurements.map((reading) => (
                  <tr key={reading.id}>
                    <td>{reading.measuredAt}</td>
                    <td>{reading.circumferenceCm.toFixed(1)}</td>
                    <td>
                      <button
                        className="text-button"
                        type="button"
                        disabled={saving}
                        aria-label={`Delete measurement ${reading.measuredAt}, ${reading.circumferenceCm.toFixed(1)} cm`}
                        onClick={async () => {
                          setError('')
                          setMessage('')
                          try {
                            await remove(reading.id).unwrap()
                            setMessage('Measurement deleted.')
                          } catch {
                            setError('Could not delete your measurement. Please try again.')
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No measurements yet.</p>
        ))
      )}
    </section>
  )
}
