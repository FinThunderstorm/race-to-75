import { chartWindow, prepareRace } from './prepareRace'

const sampleReadings = [
  { name: 'Heikki', color: '#ffad4d', weights: [102, 100.5, 99, 98, 97, 96, 95, 94] },
  { name: 'Janne', color: '#ff668e', weights: [99, 97, 95.5, 93, 91, 89, 87.9, 88.6] },
  { name: 'Tommi', color: '#bc94ff', weights: [95, 94, 92.5, 90, 88, 86, 84, 82.1] },
  { name: 'Aleksi', color: '#00eda0', weights: [92, 90.5, 88, 86, 84, 82, 80, 78.4] },
  {
    name: 'Mikko',
    color: '#35dfff',
    weights: [90, 88, 86.5, 84, 82, 80, 77.5, 75.8],
    personalLow: true
  },
  { name: 'Sanna', color: '#ffdf52', weights: [84, 82.5, 81, 79, 77.5, 76, 74.5, 73.2], streak: 9 }
]

export function createSampleRace(now = new Date()) {
  const { start, end } = chartWindow(now)
  const days = Math.round((end - start) / 86_400_000)
  return sampleReadings.map((person, index) => {
    const measurements = Array.from({ length: days + 1 }, (_, day) => {
      const position = (day / days) * (person.weights.length - 1)
      const index = Math.floor(position)
      const from = person.weights[index]
      const to = person.weights[Math.min(index + 1, person.weights.length - 1)]
      return {
        measuredAt: new Date(start + day * 86_400_000).toISOString(),
        weightKg: Math.round((from + (to - from) * (position - index)) * 100) / 100
      }
    })
    const [participant] = prepareRace([{ id: person.name, name: person.name, measurements }], now)
    return {
      ...participant,
      color: person.color,
      heightCm: [185, 180, 178, 175, 172, null][index],
      streak: person.streak ?? 0,
      personalLow: person.personalLow ?? false
    }
  })
}
