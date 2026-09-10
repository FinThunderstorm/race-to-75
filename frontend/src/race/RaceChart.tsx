import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react'

import { Racer } from '../Racer'
import { type RaceMode, type RaceViewParticipant, raceModes, raceViewBounds } from './raceModes'

const formatBmiChange = (change: number) => {
  const rounded = Number(change.toFixed(1))
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`
}

export const RaceChart = ({
  participants,
  live = false,
  radiator = false,
  mode = 'classic'
}: {
  participants: RaceViewParticipant[]
  live?: boolean
  radiator?: boolean
  mode?: RaceMode
}) => {
  const { unit, metric, reference: goal, title, referenceLabel } = raceModes[mode]
  const bmi = mode === 'bmi'
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
  const bounds = raceViewBounds(participants, mode)
  const y = (weight: number) => ((bounds.top - weight) / (bounds.top - bounds.bottom)) * plotHeight
  // Each rolling month gets a quarter of the plot, with the final month shortened
  // at Monday to give this week its own quarter. Keep dates proportional within slices.
  const windowEnd = new Date(bounds.end)
  const sections = [
    bounds.start,
    ...[-2, -1].map((offset) => {
      const year = windowEnd.getUTCFullYear()
      const month = windowEnd.getUTCMonth() + offset
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      return Date.UTC(year, month, Math.min(windowEnd.getUTCDate(), lastDay))
    }),
    bounds.currentWeek,
    bounds.end
  ]
  const sliceWidth = (right - left) / 4
  const x = (date: string) => {
    const timestamp = Math.max(bounds.start, Math.min(Date.parse(date), bounds.end))
    let section = 0
    while (section < 3 && timestamp >= sections[section + 1]) {
      section += 1
    }
    const duration = sections[section + 1] - sections[section]
    // On Monday the current week has only one date, placed at its left edge.
    const progress = duration > 0 ? (timestamp - sections[section]) / duration : 0
    return left + (section + progress) * sliceWidth
  }
  const withReadings = participants.filter((person) => person.points.length > 0)
  const withoutReadings = participants.filter(
    (person) => person.points.length === 0 && !person.needsHeight
  )
  const needingHeight = participants.filter((person) => person.needsHeight)
  const stacked = withReadings.length > 10
  const labelPositions = new Map<string, number>()
  // Keep nearby current weights legible without shifting their actual data points.
  const sorted = [...withReadings].sort((a, b) => y(a.latest!.value) - y(b.latest!.value))
  let previous = 112
  for (const person of sorted) {
    const position = Math.max(y(person.latest!.value), previous + 48)
    labelPositions.set(person.id, position)
    previous = position
  }
  let next = size.height - 12
  for (const person of [...sorted].reverse()) {
    const position = Math.min(labelPositions.get(person.id)!, next - 48)
    labelPositions.set(person.id, position)
    next = position
  }
  const renderParticipant = (person: RaceViewParticipant) => {
    const current = person.latest?.value
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
          <span className="remaining">
            {person.needsHeight
              ? radiator
                ? 'Height needed for BMI'
                : 'Add height in Settings'
              : 'No readings'}
          </span>
        ) : (
          <>
            <span className="participant-weight">
              {current.toFixed(1)}
              <small>{unit}</small>
            </span>
            {bmi ? (
              <span className="remaining">Change {formatBmiChange(person.change)} BMI</span>
            ) : person.streak >= 7 ? (
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
      aria-label={`${live ? 'Live' : 'Sample'} group ${metric} history`}
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
            <title id="chart-title">{title}</title>
            <desc id="chart-description">
              {live ? 'Live' : 'Sample'} {metric} trends over the last three months. Completed weeks
              show the average of all weighings; the current week shows daily averages. Weeks start
              on Monday in UTC. Three rolling month sections and this week each occupy one quarter
              of the chart. Solid vertical markers separate historical sections; the cyan dashed
              marker starts this week. Dates are proportional within each section. Starting and
              current values are available in the table below. Select a participant to highlight
              their history.
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
              .filter((week) => week !== bounds.currentWeek && !sections.includes(week))
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
            {sections.slice(0, 3).map((month) => {
              const monthX = x(new Date(month).toISOString())
              return (
                <g key={month}>
                  <line className="month-line" x1={monthX} x2={monthX} y1="0" y2={plotHeight} />
                  <text
                    className="month-label"
                    x={monthX + sliceWidth / 2}
                    y="-10"
                    textAnchor="middle"
                  >
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
            <text
              className="current-week-label"
              x={right - sliceWidth / 2}
              y="-10"
              textAnchor="middle"
            >
              THIS WEEK
            </text>
            <line className="goal-line" x1={left} x2={right} y1={y(goal)} y2={y(goal)} />
            <text className="goal-label" x={left + 4} y={y(goal) - 12}>
              {referenceLabel}
            </text>
            {withReadings.map((person) => {
              const points = person.points
                .map((point) => `${x(point.date)},${y(point.value)}`)
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
                      cy={y(point.value)}
                      r="3"
                      fill={person.color}
                    >
                      <title>
                        {person.name}: {point.value.toFixed(1)} {unit} ·{' '}
                        {point.period === 'week' ? 'Weekly' : 'Daily'} average · {point.date}
                      </title>
                    </circle>
                  ))}
                  {!stacked && (
                    <path
                      className="label-connector"
                      d={`M${x(last.date)} ${y(last.value)} L${right + 15} ${y(last.value)} L${size.width} ${labelPositions.get(person.id)}`}
                      fill="none"
                      stroke={person.color}
                      strokeWidth="2"
                      strokeDasharray={live ? '4 4' : undefined}
                      opacity={live ? 0.5 : 1}
                    />
                  )}
                  <circle
                    cx={x(last.date)}
                    cy={y(last.value)}
                    r="7"
                    fill="#080513"
                    stroke={person.color}
                    strokeWidth="1"
                  />
                  <circle cx={x(last.date)} cy={y(last.value)} r="4.5" fill={person.color} />
                </g>
              )
            })}
          </svg>
        </div>
      ) : (
        <p className="race-message" role="status">
          {needingHeight.length > 0
            ? radiator
              ? 'Height is needed to show BMI history.'
              : 'Add height in Settings to show BMI history.'
            : participants.some((person) => person.latest)
              ? 'No measurements in the last three months.'
              : 'No measurements have been imported yet.'}
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
      {needingHeight.length > 0 && (
        <section className="race-unplotted" aria-label="Participants needing height">
          <p className="unplotted-heading">Height needed for BMI</p>
          <div className="unplotted-list">{needingHeight.map(renderParticipant)}</div>
        </section>
      )}
      {!radiator && (
        <details className="race-data">
          <summary>View {live ? 'live' : 'sample'} readings</summary>
          <div className="table-scroll">
            <table>
              <caption>
                {live ? 'Live' : 'Sample'} summary in {bmi ? 'BMI' : 'kilograms'} · Current value is
                the latest daily average (UTC)
              </caption>
              <thead>
                <tr>
                  <th scope="col">Participant</th>
                  <th scope="col">Start</th>
                  <th scope="col">Current</th>
                  <th scope="col">{bmi ? 'Change' : 'To go'}</th>
                  {live && <th scope="col">Last reading (UTC)</th>}
                </tr>
              </thead>
              <tbody>
                {participants.map((person) => {
                  const last = person.latest
                  return (
                    <tr key={person.id}>
                      <th scope="row">{person.name}</th>
                      <td>{person.startValue?.toFixed(1) ?? '—'}</td>
                      <td>{last?.value.toFixed(1) ?? '—'}</td>
                      <td>
                        {last
                          ? bmi
                            ? formatBmiChange(person.change)
                            : Math.max(0, last.value - goal).toFixed(1)
                          : '—'}
                      </td>
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
