import type { RaceParticipant } from './prepareRace'

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

export const sampleRace: RaceParticipant[] = sampleReadings.map((person) => ({
  id: person.name,
  name: person.name,
  color: person.color,
  points: person.weights.map((weight, index) => ({
    date: new Date(Date.UTC(2026, 6, 13 + index * 8)).toISOString().slice(0, 10),
    weight
  })),
  startWeight: person.weights[0],
  change: person.weights[person.weights.length - 1] - person.weights[person.weights.length - 2],
  streak: person.streak ?? 0,
  personalLow: person.personalLow ?? false
}))
