import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export type RaceHistoryParticipant = {
  id: string
  name: string
  measurements: { measuredAt: string; weightKg: number }[]
}

export const raceApi = createApi({
  reducerPath: 'raceApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  keepUnusedDataFor: 0,
  tagTypes: ['race'],
  endpoints: (builder) => ({
    getRadiatorAccess: builder.query<{ allowed: boolean }, void>({
      query: () => '/radiator/access'
    }),
    getRace: builder.query<{ participants: RaceHistoryParticipant[] }, 'radiator' | void>({
      query: (mode) => (mode === 'radiator' ? '/radiator' : '/race'),
      providesTags: ['race']
    })
  })
})

export const { useGetRaceQuery, useGetRadiatorAccessQuery } = raceApi
