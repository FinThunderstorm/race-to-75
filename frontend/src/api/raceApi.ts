import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export type WithingsParticipant = {
  id: string
  name: string
  measurements: { measuredAt: string; weightKg: number }[]
}

export const raceApi = createApi({
  reducerPath: 'raceApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  keepUnusedDataFor: 0,
  endpoints: (builder) => ({
    getRace: builder.query<{ participants: WithingsParticipant[] }, void>({
      query: () => '/race'
    })
  })
})

export const { useGetRaceQuery } = raceApi
