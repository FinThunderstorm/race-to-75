import { type CSSProperties, useState } from 'react'

import { Racer } from '../Racer'
import { sampleRace } from './sampleRace'

const goal = 75
const y = (weight: number) => ((104 - weight) / 34) * 600
const x = (index: number) => 55 + (index / 7) * 745

export const RaceChart = () => {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <section className="race" aria-label="Sample group weight history">
      <div className="race-art">
        <Racer />
      </div>
      <div className="race-chart">
        <svg
          viewBox="0 0 840 640"
          preserveAspectRatio="none"
          role="img"
          aria-labelledby="chart-title chart-description"
        >
          <title id="chart-title">The race to 75 kilograms</title>
          <desc id="chart-description">
            Sample weight trends for six participants over eight weeks. Exact starting and current
            weights are available in the table below.
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
              x1={x(index)}
              x2={x(index)}
              y1="0"
              y2="600"
            />
          ))}
          {[100, 95, 90, 85, 80].map((weight) => (
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
          {sampleRace.map((person) => {
            const points = person.weights
              .map((weight, index) => `${x(index)},${y(weight)}`)
              .join(' ')
            const last = person.weights[person.weights.length - 1]

            return (
              <g
                key={person.name}
                className="chart-series"
                opacity={selected && selected !== person.name ? 0.16 : 1}
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
                {person.weights.map((weight, index) => (
                  <circle
                    key={`${index}-${weight}`}
                    cx={x(index)}
                    cy={y(weight)}
                    r="3"
                    fill={person.color}
                  />
                ))}
                <line
                  x1="800"
                  x2="840"
                  y1={y(last)}
                  y2={y(last)}
                  stroke={person.color}
                  strokeWidth="2.5"
                />
                <circle
                  cx="800"
                  cy={y(last)}
                  r="7"
                  fill="#080513"
                  stroke={person.color}
                  strokeWidth="1"
                />
                <circle cx="800" cy={y(last)} r="4.5" fill={person.color} />
              </g>
            )
          })}
          <text className="axis-label" x="55" y="630">
            8 WEEKS AGO
          </text>
          <text className="axis-label" x="800" y="630" textAnchor="end">
            NOW
          </text>
        </svg>
      </div>
      <div
        className="race-standings"
        aria-label="Participants. Select a participant to highlight their history."
      >
        {sampleRace.map((person) => {
          const current = person.weights[person.weights.length - 1]
          const change = current - person.weights[person.weights.length - 2]
          const style = {
            '--racer-color': person.color,
            '--row-position': `${(y(current) / 640) * 100}%`
          } as CSSProperties

          return (
            <button
              key={person.name}
              type="button"
              className={`participant ${selected && selected !== person.name ? 'muted' : ''}`}
              style={style}
              aria-pressed={selected === person.name}
              onClick={() => setSelected(selected === person.name ? null : person.name)}
            >
              <span className="participant-dot" />
              <span className="participant-name">{person.name}</span>
              <span className="participant-weight">
                {current.toFixed(1)}
                <small>kg</small>
              </span>
              {change > 0 ? (
                <span className="race-badge setback">▲ +{change.toFixed(1)} kg</span>
              ) : person.streak ? (
                <span className="race-badge winner">✓ Goal · {person.streak} days</span>
              ) : (
                <span className="remaining">{Math.max(0, current - goal).toFixed(1)} to go</span>
              )}
              {person.personalLow && (
                <span className="race-badge personal-low">New personal low</span>
              )}
            </button>
          )
        })}
      </div>
      <details className="race-data">
        <summary>View sample readings</summary>
        <div className="table-scroll">
          <table>
            <caption>Sample readings in kilograms · 75 kg goal</caption>
            <thead>
              <tr>
                <th scope="col">Participant</th>
                <th scope="col">Start</th>
                <th scope="col">Current</th>
                <th scope="col">To go</th>
              </tr>
            </thead>
            <tbody>
              {sampleRace.map((person) => {
                const current = person.weights[person.weights.length - 1]
                return (
                  <tr key={person.name}>
                    <th scope="row">{person.name}</th>
                    <td>{person.weights[0].toFixed(1)}</td>
                    <td>{current.toFixed(1)}</td>
                    <td>{Math.max(0, current - goal).toFixed(1)}</td>
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
