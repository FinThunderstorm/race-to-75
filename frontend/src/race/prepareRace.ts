import type { WithingsParticipant } from '../api/raceApi'

export type RaceParticipant = {
  id: string
  name: string
  color: string
  points: { date: string; weight: number }[]
  startWeight: number | null
  change: number
  streak: number
  personalLow: boolean
}

const colors = ['#ffad4d', '#ff668e', '#bc94ff', '#00eda0', '#35dfff', '#ffdf52']

export function prepareRace(participants: WithingsParticipant[]): RaceParticipant[] {
  return participants.map((participant) => {
    // UTC keeps daily averages and qualifying days consistent for every viewer.
    const readings = [...participant.measurements].sort((a, b) =>
      a.measuredAt.localeCompare(b.measuredAt)
    )
    const days = new Map<string, { total: number; count: number }>()
    for (const reading of readings) {
      const date = reading.measuredAt.slice(0, 10)
      const day = days.get(date) ?? { total: 0, count: 0 }
      day.total += reading.weightKg
      day.count += 1
      days.set(date, day)
    }
    const points = [...days.entries()].map(([date, day]) => ({
      date,
      weight: day.total / day.count
    }))
    const last = points.at(-1)
    let streak = 0
    for (let index = points.length - 1; index >= 0 && points[index].weight <= 75; index -= 1) {
      streak += 1
    }
    const colorIndex =
      [...participant.id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) %
      colors.length

    return {
      id: participant.id,
      name: participant.name,
      color: colors[colorIndex],
      points,
      startWeight: readings[0]?.weightKg ?? null,
      change: last && points.length > 1 ? last.weight - points[points.length - 2].weight : 0,
      streak,
      personalLow:
        points.length > 1 &&
        points.slice(0, -1).every((point) => point.weight > (last?.weight ?? 0))
    }
  })
}

export function chartBounds(participants: RaceParticipant[]) {
  let minWeight = 75
  let maxWeight = 75
  let start = Infinity
  let end = -Infinity
  for (const participant of participants) {
    for (const point of participant.points) {
      minWeight = Math.min(minWeight, point.weight)
      maxWeight = Math.max(maxWeight, point.weight)
      start = Math.min(start, Date.parse(point.date))
      end = Math.max(end, Date.parse(point.date))
    }
  }
  const step = Math.max(1, Math.ceil((maxWeight - minWeight) / 25) * 5)
  const bottom = Math.floor(minWeight / step) * step - step
  const top = Math.ceil(maxWeight / step) * step + step
  const ticks = []
  for (let tick = bottom + step; tick < top; tick += step) {
    if (tick !== 75) {
      ticks.push(tick)
    }
  }
  return { bottom, top, start, end, ticks }
}
