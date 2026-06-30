import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/browser'

export type CurrentUser = { id: string; email: string; display_name: string; role: string }

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/auth' }),
  tagTypes: ['user'],
  endpoints: (builder) => ({
    getMe: builder.query<CurrentUser, void>({
      query: () => '/me',
      providesTags: ['user']
    }),
    enrollOptions: builder.mutation<PublicKeyCredentialCreationOptionsJSON, { token: string }>({
      query: (body) => ({ url: '/enroll/options', method: 'POST', body })
    }),
    enrollVerify: builder.mutation<
      { ok: true },
      { token: string; response: unknown; deviceName?: string }
    >({
      query: (body) => ({ url: '/enroll/verify', method: 'POST', body }),
      invalidatesTags: ['user']
    }),
    loginOptions: builder.mutation<PublicKeyCredentialRequestOptionsJSON, void>({
      query: () => ({ url: '/login/options', method: 'POST' })
    }),
    loginVerify: builder.mutation<{ ok: true }, { response: unknown }>({
      query: (body) => ({ url: '/login/verify', method: 'POST', body }),
      invalidatesTags: ['user']
    }),
    logout: builder.mutation<{ ok: true }, void>({
      query: () => ({ url: '/logout', method: 'POST' }),
      invalidatesTags: ['user']
    })
  })
})

export const {
  useGetMeQuery,
  useEnrollOptionsMutation,
  useEnrollVerifyMutation,
  useLoginOptionsMutation,
  useLoginVerifyMutation,
  useLogoutMutation
} = authApi
