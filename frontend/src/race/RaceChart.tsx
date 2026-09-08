import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react'

import { Racer } from '../Racer'
import { chartBounds, type RaceParticipant } from './prepareRace'

const goal = 75

export const RaceChart = ({
  participants,
  live = false,
  radiator = false
}: {
  participants: RaceParticipant[]
  live?: boolean
  radiator?: boolean
}) => {
  const [selected, setSelected] = useState<string | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 840, height: 640 })
  const hasReadings = participants.some((person) => person.points.length > 0)

  useLayoutEffect(() => {
    const element = chartRef.current
    if (!element) {
      return
    }
    const update = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        setSize((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height }
        )
      }
    }
    const initial = element.getBoundingClientRect()
    update(initial.width, initial.height)
    const observer = new ResizeObserver(([entry]) =>
      update(entry.contentRect.width, entry.contentRect.height)
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasReadings])

  // Render in CSS-pixel coordinates so resizing cannot squash circles or text.
  const left = size.width < 500 ? 36 : 55
  const right = size.width - (size.width < 500 ? 12 : 40)
  const plotHeight = size.height - 40
  const bounds = chartBounds(participants)
  const y = (weight: number) => ((bounds.top - weight) / (bounds.top - bounds.bottom)) * plotHeight
  const x = (date: string) =>
    bounds.start === bounds.end
      ? (left + right) / 2
      : left + ((Date.parse(date) - bounds.start) / (bounds.end - bounds.start)) * (right - left)
  const withReadings = participants.filter((person) => person.points.length > 0)
  const withoutReadings = participants.filter((person) => person.points.length === 0)
  const stacked = withReadings.length > 10
  const labelPositions = new Map<string, number>()
  // Keep nearby current weights legible without shifting their actual data points.
  const sorted = [...withReadings].sort((a, b) => y(a.latest!.weight) - y(b.latest!.weight))
  let previous = 112
  for (const person of sorted) {
    const position = Math.max(y(person.latest!.weight), previous + 48)
    labelPositions.set(person.id, position)
    previous = position
  }
  let next = size.height - 12
  for (const person of [...sorted].reverse()) {
    const position = Math.min(labelPositions.get(person.id)!, next - 48)
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

  const renderParticipant = (person: RaceParticipant) => {
    const current = person.latest?.weight
    const style = {
      '--racer-color': person.color,
      '--row-position': `${((labelPositions.get(person.id) ?? 0) / size.height) * 100}%`
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
              <span className="remaining">{Math.max(0, current - goal).toFixed(1)} to go</span>
            )}
            {person.personalLow && person.streak < 7 && (
              <span className="race-badge personal-low">New personal low</span>
            )}
          </>
        )}
      </button>
    )
  }

  return (
    <section
      className={`race ${live ? 'race--live' : ''} ${stacked ? 'race--stacked' : ''}`}
      style={
        radiator
          ? ({
              '--radiator-chart-min-height': `${stacked ? 200 : Math.max(200, withReadings.length * 48 + 40)}px`
            } as CSSProperties)
          : undefined
      }
      aria-label={`${live ? 'Live' : 'Sample'} group weight history`}
    >
      <div className="race-art">
        <Racer />
      </div>
      {withReadings.length > 0 ? (
        <div className="race-chart" ref={chartRef}>
          <svg
            viewBox={`0 0 ${size.width} ${size.height}`}
            preserveAspectRatio="xMinYMin meet"
            role="img"
            aria-labelledby="chart-title chart-description"
          >
            <title id="chart-title">The race to 75 kilograms</title>
            <desc id="chart-description">
              {live ? 'Withings' : 'Sample'} weight trends over the last three months. Completed
              weeks show the average of all weighings; the current week shows daily averages. Weeks
              start on Monday in UTC. Solid vertical markers indicate month boundaries; the cyan
              dashed marker indicates the start of this week. Starting and current weights are
              available in the table below. Select a participant to highlight their history.
            </desc>
            <defs>
              <clipPath id="chart-weight-range">
                <rect x="0" y="0" width={size.width} height={plotHeight} />
              </clipPath>
              <filter id="line-glow" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>
            {bounds.weeks
              .filter((week) => week !== bounds.currentWeek && !bounds.months.includes(week))
              .map((week) => (
                <line
                  key={week}
                  className="chart-grid vertical"
                  x1={x(new Date(week).toISOString())}
                  x2={x(new Date(week).toISOString())}
                  y1="0"
                  y2={plotHeight}
                />
              ))}
            {bounds.ticks.map((weight) => (
              <g key={weight}>
                <line className="chart-grid" x1={left} x2={right} y1={y(weight)} y2={y(weight)} />
                <text className="axis-label" x={left - 14} y={y(weight) + 5} textAnchor="end">
                  {weight}
                </text>
              </g>
            ))}
            <path className="chart-axis" d={`M${left} 0 V${plotHeight} H${right}`} />
            {bounds.months.map((month) => {
              const monthX = x(new Date(month).toISOString())
              return (
                <g key={month}>
                  <line className="month-line" x1={monthX} x2={monthX} y1="0" y2={plotHeight} />
                  <text className="month-label" x={Math.min(monthX + 6, right - 32)} y="-10">
                    {new Date(month)
                      .toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
                      .toUpperCase()}
                  </text>
                </g>
              )
            })}
            <line
              className="current-week-line"
              x1={x(new Date(bounds.currentWeek).toISOString())}
              x2={x(new Date(bounds.currentWeek).toISOString())}
              y1="0"
              y2={plotHeight}
            />
            <text className="current-week-label" x={right} y="-28" textAnchor="end">
              THIS WEEK
            </text>
            <line className="goal-line" x1={left} x2={right} y1={y(goal)} y2={y(goal)} />
            <text className="goal-label" x={left + 4} y={y(goal) - 12}>
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
                  clipPath="url(#chart-weight-range)"
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
                        {person.name}: {point.weight.toFixed(1)} kg ·{' '}
                        {point.period === 'week' ? 'Weekly' : 'Daily'} average · {point.date}
                      </title>
                    </circle>
                  ))}
                  {!stacked && (
                    <path
                      className="label-connector"
                      d={`M${x(last.date)} ${y(last.weight)} L${right + 15} ${y(last.weight)} L${size.width} ${labelPositions.get(person.id)}`}
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
            <text className="axis-label" x={left} y={size.height - 10}>
              {dateLabel(bounds.start)}
            </text>
            <text className="axis-label" x={right} y={size.height - 10} textAnchor="end">
              {dateLabel(bounds.end)}
            </text>
          </svg>
        </div>
      ) : (
        <p className="race-message" role="status">
          {participants.some((person) => person.latest)
            ? 'No measurements in the last three months.'
            : 'No Withings measurements have been imported yet.'}
        </p>
      )}
      <div
        className="race-standings"
        aria-label="Participants. Select a participant to highlight their history."
      >
        {withReadings.map(renderParticipant)}
      </div>
      {withoutReadings.length > 0 && (
        <section className="race-unplotted" aria-label="Participants without recent readings">
          <p className="unplotted-heading">No readings in the last three months</p>
          <div className="unplotted-list">{withoutReadings.map(renderParticipant)}</div>
        </section>
      )}
      {!radiator && (
        <details className="race-data">
          <summary>View {live ? 'live' : 'sample'} readings</summary>
          <div className="table-scroll">
            <table>
              <caption>
                {live ? 'Withings' : 'Sample'} summary in kilograms · Current weight is the latest
                daily average (UTC)
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
                  const last = person.latest
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
      )}
    </section>
  )
}
