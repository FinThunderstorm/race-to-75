import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { ScoreSettings } from '../race/scoreSettings'
import { authApi } from './authApi'
import { raceApi } from './raceApi'

export type ManagedUser = {
  id: string
  email: string
  display_name: string
  role: 'admin' | 'member'
  disabled_at: string | null
  enrolled: boolean
}

export type Invitation = {
  user: ManagedUser
  enrollmentUrl: string
  expiresAt: string
}

const baseQuery = fetchBaseQuery({ baseUrl: '/api/admin' })

export const adminApi = createApi({
  reducerPath: 'adminApi',
  baseQuery: async (args, api, extraOptions) => {
    const result = await baseQuery(args, api, extraOptions)
    if (
      result.error?.status === 401 ||
      result.error?.status === 403 ||
      (api.type === 'mutation' && !result.error)
    ) {
      api.dispatch(authApi.util.invalidateTags(['user']))
    }
    if (api.type === 'mutation' && !result.error) {
      api.dispatch(raceApi.util.invalidateTags(['race']))
    }
    return result
  },
  tagTypes: ['users', 'scoreSettings'],
  endpoints: (builder) => ({
    getScoreSettings: builder.query<ScoreSettings, void>({
      query: () => '/score-settings',
      providesTags: ['scoreSettings']
    }),
    saveScoreSettings: builder.mutation<ScoreSettings, ScoreSettings>({
      query: (body) => ({ url: '/score-settings', method: 'PUT', body }),
      invalidatesTags: (result) => (result ? ['scoreSettings'] : [])
    }),
    getUsers: builder.query<{ users: ManagedUser[] }, void>({
      query: () => '/users',
      providesTags: ['users']
    }),
    inviteUser: builder.mutation<Invitation, { email: string; display_name: string }>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['users']
    }),
    updateUser: builder.mutation<
      { user: ManagedUser },
      {
        id: string
        email?: string
        display_name?: string
        role?: 'admin' | 'member'
        disabled?: boolean
      }
    >({
      query: ({ id, ...body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['users']
    }),
    issueEnrollment: builder.mutation<Invitation, string>({
      query: (id) => ({ url: `/users/${id}/enrollment`, method: 'POST' }),
      invalidatesTags: ['users']
    })
  })
})

export const {
  useGetScoreSettingsQuery,
  useSaveScoreSettingsMutation,
  useGetUsersQuery,
  useInviteUserMutation,
  useUpdateUserMutation,
  useIssueEnrollmentMutation
} = adminApi
