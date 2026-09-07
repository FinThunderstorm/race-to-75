import { type CSSProperties, useState } from 'react'

import { Racer } from '../Racer'
import { chartBounds, type RaceParticipant } from './prepareRace'

const goal = 75

export const RaceChart = ({
  participants,
  live = false
}: {
  participants: RaceParticipant[]
  live?: boolean
}) => {
  const [selected, setSelected] = useState<string | null>(null)
  const bounds = chartBounds(participants)
  const y = (weight: number) =>
    live
      ? ((bounds.top - weight) / (bounds.top - bounds.bottom)) * 600
      : ((104 - weight) / 34) * 600
  const x = (date: string) =>
    bounds.start === bounds.end
      ? 427.5
      : 55 + ((Date.parse(date) - bounds.start) / (bounds.end - bounds.start)) * 745
  const withReadings = participants.filter((person) => person.points.length > 0)
  const stacked =
    participants.length > 10 || participants.some((person) => person.points.length === 0)
  const labelPositions = new Map<string, number>()
  // Keep nearby current weights legible without shifting their actual data points.
  const sorted = [...withReadings].sort(
    (a, b) => y(a.points.at(-1)!.weight) - y(b.points.at(-1)!.weight)
  )
  let previous = -20
  for (const person of sorted) {
    const position = Math.max(y(person.points.at(-1)!.weight), previous + 40)
    labelPositions.set(person.id, position)
    previous = position
  }
  let next = 620
  for (const person of [...sorted].reverse()) {
    const position = Math.min(labelPositions.get(person.id)!, next - 40)
    labelPositions.set(person.id, position)
    next = position
  }
  const dateLabel = (timestamp: number) =>
    new Date(timestamp)
      .toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      })
      .toUpperCase()

  return (
    <section
      className={`race ${live ? 'race--live' : ''} ${stacked ? 'race--stacked' : ''}`}
      aria-label={`${live ? 'Live' : 'Sample'} group weight history`}
    >
      {!live && (
        <div className="race-art">
          <Racer />
        </div>
      )}
      {withReadings.length > 0 ? (
        <div className="race-chart">
          <svg
            viewBox="0 0 840 640"
            preserveAspectRatio="none"
            role="img"
            aria-labelledby="chart-title chart-description"
          >
            <title id="chart-title">The race to 75 kilograms</title>
            <desc id="chart-description">
              {live
                ? 'All imported Withings history, plotted as daily averages in UTC.'
                : 'Sample weight trends over eight weeks.'}{' '}
              Starting and current weights are available in the table below. Select a participant to
              highlight their history.
            </desc>
            <defs>
              <filter id="line-glow" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
              <line
                key={index}
                className="chart-grid vertical"
                x1={55 + (index / 7) * 745}
                x2={55 + (index / 7) * 745}
                y1="0"
                y2="600"
              />
            ))}
            {(live ? bounds.ticks : [100, 95, 90, 85, 80]).map((weight) => (
              <g key={weight}>
                <line className="chart-grid" x1="55" x2="800" y1={y(weight)} y2={y(weight)} />
                <text className="axis-label" x="41" y={y(weight) + 5} textAnchor="end">
                  {weight}
                </text>
              </g>
            ))}
            <path className="chart-axis" d="M55 0 V600 H800" />
            <line className="goal-line" x1="55" x2="840" y1={y(goal)} y2={y(goal)} />
            <text className="goal-label" x="59" y={y(goal) - 12}>
              75.0 KG — GOAL LINE
            </text>
            {withReadings.map((person) => {
              const points = person.points
                .map((point) => `${x(point.date)},${y(point.weight)}`)
                .join(' ')
              const last = person.points[person.points.length - 1]
              return (
                <g
                  key={person.id}
                  className="chart-series"
                  opacity={selected && selected !== person.id ? 0.16 : 1}
                >
                  <polyline
                    points={points}
                    fill="none"
                    stroke={person.color}
                    strokeWidth="7"
                    opacity="0.4"
                    filter="url(#line-glow)"
                  />
                  <polyline
                    points={points}
                    fill="none"
                    stroke={person.color}
                    strokeWidth="2.8"
                    strokeLinejoin="round"
                  />
                  {person.points.map((point) => (
                    <circle
                      key={point.date}
                      cx={x(point.date)}
                      cy={y(point.weight)}
                      r="3"
                      fill={person.color}
                    >
                      <title>
                        {person.name}: {point.weight.toFixed(1)} kg · {point.date}
                      </title>
                    </circle>
                  ))}
                  {!stacked && (
                    <path
                      className="label-connector"
                      d={`M${x(last.date)} ${y(last.weight)} L815 ${y(last.weight)} L840 ${labelPositions.get(person.id)}`}
                      fill="none"
                      stroke={person.color}
                      strokeWidth="2"
                      strokeDasharray={live ? '4 4' : undefined}
                      opacity={live ? 0.5 : 1}
                    />
                  )}
                  <circle
                    cx={x(last.date)}
                    cy={y(last.weight)}
                    r="7"
                    fill="#080513"
                    stroke={person.color}
                    strokeWidth="1"
                  />
                  <circle cx={x(last.date)} cy={y(last.weight)} r="4.5" fill={person.color} />
                </g>
              )
            })}
            <text className="axis-label" x="55" y="630">
              {live ? dateLabel(bounds.start) : '8 WEEKS AGO'}
            </text>
            <text className="axis-label" x="800" y="630" textAnchor="end">
              {live ? dateLabel(bounds.end) : 'NOW'}
            </text>
          </svg>
        </div>
      ) : (
        <p className="race-message" role="status">
          No Withings measurements have been imported yet.
        </p>
      )}
      <div
        className="race-standings"
        aria-label="Participants. Select a participant to highlight their history."
      >
        {participants.map((person) => {
          const current = person.points.at(-1)?.weight
          const style = {
            '--racer-color': person.color,
            '--row-position': `${((labelPositions.get(person.id) ?? 0) / 640) * 100}%`
          } as CSSProperties
          return (
            <button
              key={person.id}
              type="button"
              className={`participant ${selected && selected !== person.id ? 'muted' : ''}`}
              style={style}
              aria-pressed={selected === person.id}
              onClick={() => setSelected(selected === person.id ? null : person.id)}
            >
              <span className="participant-dot" />
              <span className="participant-name">{person.name}</span>
              {current === undefined ? (
                <span className="remaining">No Withings readings</span>
              ) : (
                <>
                  <span className="participant-weight">
                    {current.toFixed(1)}
                    <small>kg</small>
                  </span>
                  {person.streak >= 7 ? (
                    <span className="race-badge winner">✓ Goal · {person.streak} days</span>
                  ) : person.change > 0 ? (
                    <span className="race-badge setback">▲ +{person.change.toFixed(1)} kg</span>
                  ) : (
                    <span className="remaining">
                      {Math.max(0, current - goal).toFixed(1)} to go
                    </span>
                  )}
                  {person.personalLow && person.streak < 7 && (
                    <span className="race-badge personal-low">New personal low</span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>
      <details className="race-data">
        <summary>View {live ? 'live' : 'sample'} readings</summary>
        <div className="table-scroll">
          <table>
            <caption>
              {live ? 'Withings daily averages (UTC)' : 'Sample readings'} in kilograms · 75 kg goal
            </caption>
            <thead>
              <tr>
                <th scope="col">Participant</th>
                <th scope="col">Start</th>
                <th scope="col">Current</th>
                <th scope="col">To go</th>
                {live && <th scope="col">Last reading (UTC)</th>}
              </tr>
            </thead>
            <tbody>
              {participants.map((person) => {
                const last = person.points.at(-1)
                return (
                  <tr key={person.id}>
                    <th scope="row">{person.name}</th>
                    <td>{person.startWeight?.toFixed(1) ?? '—'}</td>
                    <td>{last?.weight.toFixed(1) ?? '—'}</td>
                    <td>{last ? Math.max(0, last.weight - goal).toFixed(1) : '—'}</td>
                    {live && <td>{last?.date ?? '—'}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
