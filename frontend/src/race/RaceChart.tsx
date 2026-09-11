import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { formatDate, formatNumber } from '../format'
import { Racer } from '../Racer'
import { BloodPressureReadings } from './BloodPressureReadings'
import { RaceReadings } from './RaceReadings'
import { ReferenceBands } from './ReferenceBands'
import { formatRaceReading } from './raceFormatting'
import {
  type RaceMode,
  type RaceViewParticipant,
  raceBands,
  raceCitizenPoints,
  raceModes,
  raceViewBounds
} from './raceModes'
import { useAnimatedCoordinates } from './useAnimatedCoordinates'

const formatChange = (change: number) => {
  const rounded = Number(change.toFixed(1))
  return `${rounded > 0 ? '+' : ''}${formatNumber(rounded)}`
}

export const RaceChart = ({
  participants,
  classicParticipants = participants,
  bmiParticipants = participants,
  live = false,
  radiator = false,
  mode = 'classic'
}: {
  participants: RaceViewParticipant[]
  classicParticipants?: RaceViewParticipant[]
  bmiParticipants?: RaceViewParticipant[]
  live?: boolean
  radiator?: boolean
  mode?: RaceMode
}) => {
  const { unit, unitLabel, metric, reference: goal, title, referenceLabel } = raceModes[mode]
  const bloodPressure = mode === 'blood-pressure'
  const bmi = mode === 'bmi'
  const classic = mode === 'classic'
  const component = !classic && mode !== 'score'
  const [selected, setSelected] = useState<string | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const standingsRef = useRef<HTMLDivElement>(null)
  const [componentRowHeight, setComponentRowHeight] = useState(48)
  const rowSpacing = component ? componentRowHeight : 48
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

  useLayoutEffect(() => {
    if (!component || !standingsRef.current) {
      return
    }
    const rows = [...standingsRef.current.querySelectorAll<HTMLElement>('.participant')]
    const update = () => {
      const spacing = Math.max(
        48,
        ...rows.map((row) => Math.ceil(row.getBoundingClientRect().height) + 8)
      )
      setComponentRowHeight((previous) => (previous === spacing ? previous : spacing))
    }
    update()
    const observer = new ResizeObserver(update)
    rows.forEach((row) => observer.observe(row))
    return () => observer.disconnect()
  }, [component, participants])

  // Render in CSS-pixel coordinates so resizing cannot squash circles or text.
  const left = size.width < 500 ? 36 : 55
  const right = size.width - (size.width < 500 ? 12 : 40)
  const plotHeight = size.height - 40
  const today = new Date().toISOString().slice(0, 10)
  const bounds = useMemo(() => raceViewBounds(participants, mode), [participants, mode, today])
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
  // Reserve the BMI notice only when there is a BMI plot whose size must stay
  // stable. An empty BMI view should not take space from the Classic chart.
  const heightParticipants =
    radiator && (classic || bmi) && bmiParticipants.some((person) => person.points.length > 0)
      ? bmiParticipants.filter((person) => person.needsHeight)
      : needingHeight
  const standingsParticipants =
    radiator && (classic || bmi)
      ? participants.filter((person) =>
          classicParticipants.some(
            (classic) => classic.id === person.id && classic.points.length > 0
          )
        )
      : withReadings
  const stacked =
    (classic || bmi ? classicParticipants : participants).filter(
      (person) => person.points.length > 0
    ).length > 10
  const targetCoordinates = useMemo(() => {
    const y = (value: number) => ((bounds.top - value) / (bounds.top - bounds.bottom)) * plotHeight
    const coordinates: Record<string, number> = goal === null ? {} : { goal: y(goal) }
    const plotted = participants.filter((person) => person.points.length > 0)
    for (const person of plotted) {
      for (const point of person.diastolic?.points ?? []) {
        coordinates[`diastolic:${person.id}:${point.date}`] = y(point.value)
      }
      for (const point of person.points) {
        coordinates[`point:${person.id}:${point.date}`] = y(point.value)
      }
    }
    // Keep nearby labels legible without shifting their actual data points.
    const sorted = [...plotted].sort((a, b) => y(a.latest!.value) - y(b.latest!.value))
    let previous = 112
    for (const person of sorted) {
      const position = Math.max(y(person.latest!.value), previous + rowSpacing)
      coordinates[`label:${person.id}`] = position
      previous = position
    }
    let next = size.height - 12
    for (const person of [...sorted].reverse()) {
      const position = Math.min(coordinates[`label:${person.id}`], next - rowSpacing)
      coordinates[`label:${person.id}`] = position
      next = position
    }
    return coordinates
  }, [participants, bounds, plotHeight, size.height, goal, rowSpacing])
  const animatedCoordinates = useAnimatedCoordinates(targetCoordinates, mode)
  const coordinate = (key: string) => animatedCoordinates[key] ?? targetCoordinates[key]
  const pointY = (person: RaceViewParticipant, date: string) =>
    coordinate(`point:${person.id}:${date}`)
  const renderParticipant = (person: RaceViewParticipant, placeholder = false) => {
    const current = person.latest?.value
    const points =
      current === undefined
        ? null
        : raceCitizenPoints(mode, current, person.heightCm, person.diastolic?.latest?.value)
    const style = {
      '--racer-color': person.color,
      '--row-position': `${((coordinate(`label:${person.id}`) ?? 0) / size.height) * 100}%`
    } as CSSProperties
    return (
      <button
        key={person.id}
        type="button"
        className={`participant ${selected && selected !== person.id ? 'muted' : ''} ${placeholder ? 'layout-placeholder' : ''}`}
        aria-hidden={placeholder || undefined}
        tabIndex={placeholder ? -1 : undefined}
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
                ? 'Pituus tarvitaan laskentaan'
                : 'Lisää pituus asetuksissa'
              : mode === 'score'
                ? 'Mittauksia puuttuu'
                : 'Ei mittauksia'}
          </span>
        ) : (
          <>
            <span className="participant-weight">
              {formatNumber(current)}
              {bloodPressure && person.diastolic?.latest
                ? ` / ${formatNumber(person.diastolic.latest.value)}`
                : ''}
              <small title={unitLabel}>{unit}</small>
              {points !== null && (
                <span className="participant-points"> ({formatNumber(points)} kp)</span>
              )}
            </span>
            {!classic ? (
              <span className="remaining">
                Muutos {formatChange(person.change)}
                {bloodPressure && person.diastolic
                  ? ` / ${formatChange(person.diastolic.change)}`
                  : ''}{' '}
                {unit}
              </span>
            ) : person.streak >= 7 ? (
              <span className="race-badge winner">✓ Tavoite · {person.streak} päivää</span>
            ) : person.change > 0 ? (
              <span className="race-badge setback">▲ +{formatNumber(person.change)} kg</span>
            ) : (
              <span className="remaining">
                {formatNumber(Math.max(0, current - (goal ?? 0)))} kg jäljellä
              </span>
            )}
            {person.personalLow && person.streak < 7 && (
              <span className="race-badge personal-low">Uusi alin paino</span>
            )}
          </>
        )}
      </button>
    )
  }

  return (
    <section
      className={`race ${live ? 'race--live' : ''} ${stacked ? 'race--stacked' : ''} ${!classic && mode !== 'score' ? 'race--component' : ''}`}
      style={
        {
          '--component-chart-min-height': `${Math.max(200, standingsParticipants.length * rowSpacing + 40)}px`,
          ...(radiator
            ? {
                '--radiator-chart-min-height': `${stacked ? 200 : Math.max(200, standingsParticipants.length * rowSpacing + 40)}px`
              }
            : {})
        } as CSSProperties
      }
      aria-label={live ? title : `Esimerkki: ${title}`}
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
              {live ? 'Ryhmän mittaukset' : 'Esimerkkimittaukset'}: {metric} viimeisen kolmen
              kuukauden ajalta.{' '}
              {bloodPressure
                ? 'Yläpaine näkyy yhtenäisenä viivana ja alapaine katkoviivana, molemmat mmHg-yksikössä. Päättyneiltä viikoilta näytetään kaikkien mittausten keskiarvot ja kuluvalta viikolta päiväkeskiarvot.'
                : mode === 'score'
                  ? 'Päättyneiltä viikoilta näytetään mittauspäivien kansalaispisteiden keskiarvo. Päivän ihmisarvo lasketaan viimeisimmistä painon, hauiksen ja verenpaineen päiväkeskiarvoista. Kuluvalta viikolta näytetään päivittäiset ihmisarvot.'
                  : 'Päättyneiltä viikoilta käytetään kaikkien mittausten keskiarvoa ja kuluvalta viikolta päiväkeskiarvoja. Indeksit lasketaan näistä keskiarvoista.'}{' '}
              {raceBands[mode].length > 0 &&
                'Himmeät värialueet näyttävät täysien osapisteiden rajat. '}
              {mode !== 'classic' &&
                mode !== 'score' &&
                'Viivojen sijainti perustuu mittausarvoihin. Suluissa näkyvät mittarista lasketut kansalaispisteet. '}
              Viikko alkaa maanantaina UTC-ajassa. Aikaväliä edeltävä viimeinen tunnettu arvo
              näytetään vasemmassa reunassa. Jos uudempia mittauksia ei ole, viiva jatkuu
              vaakasuorana. Kolme kuukausijaksoa ja kuluva viikko vievät kukin neljänneksen
              kuvaajasta. Yhtenäiset pystyviivat erottavat jaksot, ja syaani katkoviiva aloittaa
              kuluvan viikon. Päivämäärät sijoittuvat suhteellisesti kunkin jakson sisällä. Alku- ja
              nykyarvot näkyvät alla olevassa taulukossa. Korosta historiaa valitsemalla
              osallistuja.
            </desc>
            <defs>
              <clipPath id="chart-weight-range">
                <rect x="0" y="0" width={size.width} height={plotHeight} />
              </clipPath>
              <filter id="line-glow" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>
            <ReferenceBands bands={raceBands[mode]} left={left} right={right} y={y} unit={unit} />
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
                  {weight.toLocaleString('fi-FI', { maximumFractionDigits: 6 })}
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
                      .toLocaleDateString('fi-FI', { month: 'short', timeZone: 'UTC' })
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
              TÄMÄ VIIKKO
            </text>
            {goal !== null && (
              <>
                <line
                  className="goal-line"
                  x1={left}
                  x2={right}
                  y1={coordinate('goal')}
                  y2={coordinate('goal')}
                />
                <text className="goal-label" x={left + 4} y={coordinate('goal') - 12}>
                  {referenceLabel}
                </text>
              </>
            )}
            {withReadings.map((person) => {
              const last = person.points[person.points.length - 1]
              const points = person.points.map(
                (point) => `${x(point.date)},${pointY(person, point.date)}`
              )
              // Stale histories need a line even when stacked labels have no connector.
              if (Date.parse(last.date) < bounds.start) {
                points.push(`${right},${pointY(person, last.date)}`)
              }
              return (
                <g
                  key={person.id}
                  className="chart-series"
                  clipPath="url(#chart-weight-range)"
                  opacity={selected && selected !== person.id ? 0.16 : 1}
                >
                  {person.diastolic && (
                    <g className="diastolic-series">
                      <polyline
                        points={[
                          ...person.diastolic.points.map(
                            (point) =>
                              `${x(point.date)},${coordinate(`diastolic:${person.id}:${point.date}`)}`
                          ),
                          ...(Date.parse(last.date) < bounds.start
                            ? [`${right},${coordinate(`diastolic:${person.id}:${last.date}`)}`]
                            : [])
                        ].join(' ')}
                        fill="none"
                        stroke={person.color}
                        strokeWidth="2.8"
                        strokeDasharray="7 5"
                        strokeLinejoin="round"
                      />
                      {person.diastolic.points.map((point, index) => (
                        <circle
                          key={point.date}
                          cx={x(point.date)}
                          cy={coordinate(`diastolic:${person.id}:${point.date}`)}
                          r="3"
                          fill="#080513"
                          stroke={person.color}
                          strokeWidth="1.5"
                        >
                          <title>
                            {person.name}:{' '}
                            {formatRaceReading(
                              mode,
                              person.points[index].value,
                              person.heightCm,
                              point.value
                            )}{' '}
                            · {point.period === 'week' ? 'Viikkokeskiarvo' : 'Päiväkeskiarvo'} ·{' '}
                            {formatDate(point.date)}
                          </title>
                        </circle>
                      ))}
                    </g>
                  )}
                  <polyline
                    points={points.join(' ')}
                    fill="none"
                    stroke={person.color}
                    strokeWidth="7"
                    opacity="0.4"
                    filter="url(#line-glow)"
                  />
                  <polyline
                    points={points.join(' ')}
                    fill="none"
                    stroke={person.color}
                    strokeWidth="2.8"
                    strokeLinejoin="round"
                  />
                  {person.points.map((point, index) => (
                    <circle
                      key={point.date}
                      cx={x(point.date)}
                      cy={pointY(person, point.date)}
                      r="3"
                      fill={person.color}
                    >
                      <title>
                        {person.name}:{' '}
                        {classic || mode === 'score'
                          ? `${formatNumber(point.value)} ${unitLabel}`
                          : formatRaceReading(
                              mode,
                              point.value,
                              person.heightCm,
                              person.diastolic?.points[index]?.value
                            )}{' '}
                        · {point.period === 'week' ? 'Viikkokeskiarvo' : 'Päiväkeskiarvo'} ·{' '}
                        {formatDate(point.date)}
                      </title>
                    </circle>
                  ))}
                  {!stacked && (
                    <path
                      className="label-connector"
                      d={`M${x(last.date)} ${pointY(person, last.date)} L${right + 15} ${pointY(person, last.date)} L${size.width} ${coordinate(`label:${person.id}`)}`}
                      fill="none"
                      stroke={person.color}
                      strokeWidth="2"
                      strokeDasharray={live ? '4 4' : undefined}
                      opacity={live ? 0.5 : 1}
                    />
                  )}
                  <circle
                    cx={x(last.date)}
                    cy={pointY(person, last.date)}
                    r="7"
                    fill="#080513"
                    stroke={person.color}
                    strokeWidth="1"
                  />
                  <circle
                    cx={x(last.date)}
                    cy={pointY(person, last.date)}
                    r="4.5"
                    fill={person.color}
                  />
                </g>
              )
            })}
          </svg>
        </div>
      ) : (
        <p className="race-message" role="status">
          {needingHeight.length > 0
            ? radiator
              ? 'Tulosten näyttämiseen tarvitaan pituus.'
              : 'Lisää pituus asetuksissa, jotta tulokset voidaan näyttää.'
            : participants.some((person) => person.latest)
              ? 'Ei mittauksia viimeisen kolmen kuukauden ajalta.'
              : mode === 'score'
                ? 'Ihmisarvon näyttämiseen tarvitaan paino-, hauis- ja verenpainemittaus.'
                : bloodPressure
                  ? 'Ei vielä verenpainemittauksia.'
                  : mode === 'biceps'
                    ? 'Ei vielä hauismittauksia.'
                    : 'Mittauksia ei ole vielä tuotu.'}
        </p>
      )}
      <div
        ref={standingsRef}
        className="race-standings"
        aria-label="Osallistujat. Korosta mittaushistoriaa valitsemalla osallistuja."
      >
        {standingsParticipants.map((person) => renderParticipant(person, person.needsHeight))}
      </div>
      {withoutReadings.length > 0 && (
        <section className="race-unplotted" aria-label="Osallistujat, joilta puuttuu mittauksia">
          <p className="unplotted-heading">
            {mode === 'score'
              ? 'Ihmisarvoon tarvitaan mittaukset'
              : 'Ei mittauksia viimeisen kolmen kuukauden ajalta'}
          </p>
          <div className="unplotted-list">
            {withoutReadings.map((person) => renderParticipant(person))}
          </div>
        </section>
      )}
      {heightParticipants.length > 0 && (
        <section
          className={`race-unplotted ${classic ? 'layout-placeholder' : ''}`}
          aria-label="Osallistujat, joilta puuttuu pituus"
          aria-hidden={classic || undefined}
          inert={classic}
        >
          <p className="unplotted-heading">Pituus puuttuu</p>
          <div className="unplotted-list">
            {heightParticipants.map((person) => renderParticipant(person))}
          </div>
        </section>
      )}
      {!radiator &&
        (bloodPressure ? (
          <BloodPressureReadings participants={participants} live={live} />
        ) : (
          <RaceReadings participants={participants} mode={mode} live={live} />
        ))}
    </section>
  )
}
