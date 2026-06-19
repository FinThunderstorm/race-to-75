import {
  type WithingsMeasurement,
  type WithingsMeasurementFetchWindow,
  withingsMeasureResponseSchema
} from './types.js'

function epochSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000)
}

function withingsErrorMessage(prefix: string, responseBody: unknown) {
  return `${prefix}: ${JSON.stringify(responseBody)}`
}

export async function fetchWithingsMeasurements(
  fetchWindow: WithingsMeasurementFetchWindow,
  accessToken: string,
  apiBaseUrl: string,
  fetchFn: typeof fetch = fetch
) {
  const measurements: WithingsMeasurement[] = []
  let offset: number | undefined

  do {
    const body = new URLSearchParams({
      action: 'getmeas',
      category: '1',
      enddate: epochSeconds(fetchWindow.end_at).toString(),
      meastype: '1',
      startdate: epochSeconds(fetchWindow.start_at).toString()
    })

    if (offset !== undefined) {
      body.set('offset', offset.toString())
    }

    const response = await fetchFn(new URL('/measure', apiBaseUrl), {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      method: 'POST'
    })
    const responseBody = await response.json()
    const parsed = withingsMeasureResponseSchema.parse(responseBody)

    if (!response.ok || parsed.status !== 0) {
      throw new Error(withingsErrorMessage('Withings measurement fetch failed', responseBody))
    }

    for (const measureGroup of parsed.body.measuregrps) {
      const weightMeasure = measureGroup.measures.find((measure) => measure.type === 1)

      if (!weightMeasure) {
        continue
      }

      measurements.push({
        externalId: `${measureGroup.grpid}:weight`,
        measuredAt: new Date(measureGroup.date * 1000),
        weightKg: weightMeasure.value * 10 ** weightMeasure.unit
      })
    }

    offset = parsed.body.more === 1 ? parsed.body.offset : undefined
  } while (offset !== undefined)

  return measurements
}
