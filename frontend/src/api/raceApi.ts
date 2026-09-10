import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export type BicepsMeasurement = { id: string; measuredAt: string; circumferenceCm: number }

export type RaceHistoryParticipant = {
  id: string
  name: string
  heightCm?: number | null
  measurements: { measuredAt: string; weightKg: number }[]
  bicepsMeasurements?: Omit<BicepsMeasurement, 'id'>[]
}

export const raceApi = createApi({
  reducerPath: 'raceApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  keepUnusedDataFor: 0,
  tagTypes: ['race', 'biceps'],
  endpoints: (builder) => ({
    getBicepsMeasurements: builder.query<{ measurements: BicepsMeasurement[] }, void>({
      query: () => '/biceps-measurements',
      providesTags: ['biceps']
    }),
    addBicepsMeasurement: builder.mutation<BicepsMeasurement, Omit<BicepsMeasurement, 'id'>>({
      query: (body) => ({ url: '/biceps-measurements', method: 'POST', body }),
      invalidatesTags: (_result, error) => (error ? [] : ['biceps', 'race'])
    }),
    deleteBicepsMeasurement: builder.mutation<void, string>({
      query: (id) => ({ url: `/biceps-measurements/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, error) => (error ? [] : ['biceps', 'race'])
    }),
    getRadiatorAccess: builder.query<{ allowed: boolean }, void>({
      query: () => '/radiator/access'
    }),
    getRace: builder.query<{ participants: RaceHistoryParticipant[] }, 'radiator' | void>({
      query: (mode) => (mode === 'radiator' ? '/radiator' : '/race'),
      providesTags: ['race']
    })
  })
})

export const {
  useGetRaceQuery,
  useGetRadiatorAccessQuery,
  useGetBicepsMeasurementsQuery,
  useAddBicepsMeasurementMutation,
  useDeleteBicepsMeasurementMutation
} = raceApi
