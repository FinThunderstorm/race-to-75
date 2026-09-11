import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export type Sex = 'male' | 'female'
export type SbdMeasurement = {
  id: string
  measuredAt: string
  squatKg: number
  benchKg: number
  deadliftKg: number
  bodyweightKg: number
}

export type BloodPressureMeasurement = {
  id: string
  measuredAt: string
  systolic: number
  diastolic: number
}

export type BicepsMeasurement = { id: string; measuredAt: string; circumferenceCm: number }

export type RaceHistoryParticipant = {
  id: string
  name: string
  heightCm?: number | null
  sex?: Sex | null
  sbdMeasurements?: Omit<SbdMeasurement, 'id'>[]
  measurements: { measuredAt: string; weightKg: number }[]
  bloodPressureMeasurements?: Omit<BloodPressureMeasurement, 'id'>[]
  bicepsMeasurements?: Omit<BicepsMeasurement, 'id'>[]
}

export const raceApi = createApi({
  reducerPath: 'raceApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  keepUnusedDataFor: 0,
  tagTypes: ['race', 'biceps', 'bloodPressure', 'sbd'],
  endpoints: (builder) => ({
    getSbdMeasurements: builder.query<{ measurements: SbdMeasurement[] }, void>({
      query: () => '/sbd-measurements',
      providesTags: ['sbd']
    }),
    addSbdMeasurement: builder.mutation<SbdMeasurement, Omit<SbdMeasurement, 'id'>>({
      query: (body) => ({ url: '/sbd-measurements', method: 'POST', body }),
      invalidatesTags: (_result, error) => (error ? [] : ['sbd', 'race'])
    }),
    deleteSbdMeasurement: builder.mutation<void, string>({
      query: (id) => ({ url: `/sbd-measurements/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, error) => (error ? [] : ['sbd', 'race'])
    }),
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
    getBloodPressureMeasurements: builder.query<{ measurements: BloodPressureMeasurement[] }, void>(
      {
        query: () => '/blood-pressure-measurements',
        providesTags: ['bloodPressure']
      }
    ),
    addBloodPressureMeasurement: builder.mutation<
      BloodPressureMeasurement,
      Omit<BloodPressureMeasurement, 'id'>
    >({
      query: (body) => ({ url: '/blood-pressure-measurements', method: 'POST', body }),
      invalidatesTags: (_result, error) => (error ? [] : ['bloodPressure', 'race'])
    }),
    deleteBloodPressureMeasurement: builder.mutation<void, string>({
      query: (id) => ({ url: `/blood-pressure-measurements/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, error) => (error ? [] : ['bloodPressure', 'race'])
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
  useGetSbdMeasurementsQuery,
  useAddSbdMeasurementMutation,
  useDeleteSbdMeasurementMutation,
  useGetBloodPressureMeasurementsQuery,
  useAddBloodPressureMeasurementMutation,
  useDeleteBloodPressureMeasurementMutation,
  useGetRaceQuery,
  useGetRadiatorAccessQuery,
  useGetBicepsMeasurementsQuery,
  useAddBicepsMeasurementMutation,
  useDeleteBicepsMeasurementMutation
} = raceApi
