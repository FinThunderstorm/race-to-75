import type { ReferenceBand } from './raceModes'

export const ReferenceBands = ({
  bands,
  left,
  right,
  y,
  unit
}: {
  bands: readonly ReferenceBand[]
  left: number
  right: number
  y: (value: number) => number
  unit: string
}) => (
  <g className="reference-bands" pointerEvents="none">
    {bands.map((band) => {
      const range = `${band.min.toLocaleString('fi-FI')}–${band.max.toLocaleString('fi-FI')}`
      const label = `${band.label} ${range}${unit === 'mmHg' ? ' mmHg' : ' (100 kp)'}`
      return (
        <g key={band.label} className="reference-band">
          <title>{label} · Täysien osapisteiden alue</title>
          <rect
            x={left}
            y={y(band.max)}
            width={right - left}
            height={y(band.min) - y(band.max)}
            fill={band.color}
            fillOpacity="0.07"
          />
          {[band.min, band.max].map((value) => (
            <line
              key={value}
              x1={left}
              x2={right}
              y1={y(value)}
              y2={y(value)}
              stroke={band.color}
              strokeOpacity="0.3"
              strokeDasharray="3 5"
            />
          ))}
          <text
            className="reference-band-label"
            x={left + 6}
            y={y(band.max) + 14}
            fill={band.color}
          >
            {label}
          </text>
        </g>
      )
    })}
  </g>
)
