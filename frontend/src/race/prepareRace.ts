import type { RaceHistoryParticipant } from '../api/raceApi'

type WeightPoint = { date: string; weight: number }

export type RaceParticipant = {
  id: string
  name: string
  color: string
  heightCm?: number | null
  bicepsMeasurements?: RaceHistoryParticipant['bicepsMeasurements']
  points: (WeightPoint & { period: 'week' | 'day' })[]
  latest: WeightPoint | null
  startWeight: number | null
  change: number
  streak: number
  personalLow: boolean
}

const colors = ['#ffad4d', '#ff668e', '#bc94ff', '#00eda0', '#35dfff', '#ffdf52']
const dayMs = 24 * 60 * 60 * 1000
const dateKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10)
const weekStart = (timestamp: number) => {
  const date = new Date(timestamp)
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return midnight - ((date.getUTCDay() + 6) % 7) * dayMs
}

export function chartWindow(now = new Date()) {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  const end = Date.UTC(year, month, day)
  // Clamp the day when the month three months ago is shorter (e.g. May 31 → Feb 28).
  const lastDay = new Date(Date.UTC(year, month - 2, 0)).getUTCDate()
  const start = Date.UTC(year, month - 3, Math.min(day, lastDay))
  const currentWeek = weekStart(end)
  const weeks = []
  for (let week = weekStart(start); week <= end; week += 7 * dayMs) {
    if (week >= start) {
      weeks.push(week)
    }
  }
  const months = []
  for (let offset = -3; offset <= 0; offset += 1) {
    const boundary = Date.UTC(year, month + offset, 1)
    if (boundary >= start && boundary <= end) {
      months.push(boundary)
    }
  }
  return { start, end, currentWeek, weeks, months }
}

export function prepareMeasurementHistory(
  measurements: { measuredAt: string; value: number }[],
  now = new Date()
) {
  const window = chartWindow(now)
  const readings = measurements
    .filter((reading) => Date.parse(reading.measuredAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt))
  const days = new Map<string, { total: number; count: number }>()
  const buckets = new Map<string, { total: number; count: number; period: 'week' | 'day' }>()
  for (const reading of readings) {
    const timestamp = Date.parse(reading.measuredAt)
    const date = dateKey(timestamp)
    const day = days.get(date) ?? { total: 0, count: 0 }
    day.total += reading.value
    day.count += 1
    days.set(date, day)

    if (timestamp < window.start) {
      continue
    }
    const currentWeek = timestamp >= window.currentWeek
    const bucketDate = currentWeek ? date : dateKey(Math.max(window.start, weekStart(timestamp)))
    const bucket = buckets.get(bucketDate) ?? {
      total: 0,
      count: 0,
      period: currentWeek ? 'day' : 'week'
    }
    // Give each measurement equal weight instead of averaging daily averages.
    bucket.total += reading.value
    bucket.count += 1
    buckets.set(bucketDate, bucket)
  }
  const points = [...buckets.entries()].map(([date, bucket]) => ({
    date,
    value: bucket.total / bucket.count,
    period: bucket.period
  }))
  // Current values and changes use daily history, including older readings.
  const daily = [...days.entries()].map(([date, day]) => ({
    date,
    value: day.total / day.count
  }))
  const latest = daily.at(-1) ?? null
  return {
    points,
    daily,
    latest,
    startValue: readings[0]?.value ?? null,
    change: latest && daily.length > 1 ? latest.value - daily[daily.length - 2].value : 0
  }
}

export function prepareRace(
  participants: RaceHistoryParticipant[],
  now = new Date()
): RaceParticipant[] {
  return participants.map((participant, index) => {
    const history = prepareMeasurementHistory(
      participant.measurements.map(({ measuredAt, weightKg }) => ({ measuredAt, value: weightKg })),
      now
    )
    const points = history.points.map(({ value, ...point }) => ({ ...point, weight: value }))
    const daily = history.daily.map(({ value, ...point }) => ({ ...point, weight: value }))
    const latest = daily.at(-1) ?? null
    let streak = 0
    for (let index = daily.length - 1; index >= 0 && daily[index].weight <= 75; index -= 1) {
      streak += 1
    }
    return {
      id: participant.id,
      name: participant.name,
      color: colors[index % colors.length],
      heightCm: participant.heightCm ?? null,
      points,
      latest,
      startWeight: history.startValue,
      bicepsMeasurements: participant.bicepsMeasurements,
      change: latest && daily.length > 1 ? latest.weight - daily[daily.length - 2].weight : 0,
      streak,
      personalLow:
        daily.length > 1 &&
        daily.slice(0, -1).every((point) => point.weight > (latest?.weight ?? 0))
    }
  })
}

export function chartBounds(participants: RaceParticipant[], now = new Date()) {
  let minWeight = 75
  let maxWeight = 75
  for (const participant of participants) {
    for (const point of participant.points) {
      minWeight = Math.min(minWeight, point.weight)
      maxWeight = Math.max(maxWeight, point.weight)
    }
    if (participant.points.length && participant.latest) {
      minWeight = Math.min(minWeight, participant.latest.weight)
      maxWeight = Math.max(maxWeight, participant.latest.weight)
    }
  }
  const bottom = minWeight - 2
  const top = maxWeight + 0.5
  const targetStep = (top - bottom) / 6
  const magnitude = 10 ** Math.floor(Math.log10(targetStep))
  const step = [1, 2, 5, 10].find((value) => value * magnitude >= targetStep)! * magnitude
  const ticks = []
  for (let tick = Math.ceil(bottom / step) * step; tick < top; tick += step) {
    if (tick !== 75) {
      ticks.push(tick)
    }
  }
  return { bottom, top, ticks, ...chartWindow(now) }
}
