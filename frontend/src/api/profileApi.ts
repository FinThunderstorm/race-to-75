import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

import { raceApi, type Sex } from './raceApi'

type RaceProfile = { heightCm: number | null; sex: Sex | null }

export const profileApi = createApi({
  reducerPath: 'profileApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['profile'],
  endpoints: (builder) => ({
    getProfile: builder.query<RaceProfile, void>({
      query: () => '/profile',
      providesTags: ['profile']
    }),
    saveProfile: builder.mutation<RaceProfile, RaceProfile>({
      query: (body) => ({ url: '/profile', method: 'PUT', body }),
      invalidatesTags: (result) => (result ? ['profile'] : []),
      async onQueryStarted(_profile, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          dispatch(raceApi.util.invalidateTags(['race']))
        } catch {
          // The form displays the mutation error and retains the entered profile.
        }
      }
    })
  })
})

export const { useGetProfileQuery, useSaveProfileMutation } = profileApi
