import type { Sex } from '../api/raceApi'
import { formatNumber } from '../format'
import { type RaceMode, raceCitizenPoints, raceModes } from './raceModes'

export function formatRaceReading(
  mode: RaceMode,
  value: number,
  heightCm?: number | null,
  diastolic?: number,
  sex?: Sex | null
) {
  const points = raceCitizenPoints(mode, value, heightCm, diastolic, sex)
  const pair =
    mode === 'blood-pressure' && diastolic !== undefined ? ` / ${formatNumber(diastolic)}` : ''
  return `${formatNumber(value)}${pair} ${raceModes[mode].unit}${points === null ? '' : ` (${formatNumber(points)} kp)`}`
}
