import { expect, test } from '@playwright/test'

import { prepareRace } from '../frontend/src/race/prepareRace'

test('uses every racer color before repeating the palette', () => {
  const participants = Array.from({ length: 13 }, (_, index) => ({
    id: `racer-${index * 6}`,
    name: `Racer ${index + 1}`,
    measurements: []
  }))
  const race = prepareRace(participants)
  const firstCycle = race.slice(0, 6).map((participant) => participant.color)

  expect(new Set(firstCycle).size).toBe(6)
  expect(race.slice(6, 12).map((participant) => participant.color)).toEqual(firstCycle)
  expect(race[12].color).toBe(firstCycle[0])
  expect(race.map((participant) => participant.id)).toEqual(
    participants.map((participant) => participant.id)
  )
})
