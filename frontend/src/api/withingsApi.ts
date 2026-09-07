import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export const withingsApi = createApi({
  reducerPath: 'withingsApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/integrations/withings' }),
  keepUnusedDataFor: 0,
  tagTypes: ['connection'],
  endpoints: (builder) => ({
    getWithingsStatus: builder.query<
      {
        connected: boolean
        configured: boolean
        automaticUpdates: boolean
      },
      void
    >({
      query: () => '/status',
      providesTags: ['connection']
    }),
    disconnectWithings: builder.mutation<void, void>({
      query: () => ({ url: '', method: 'DELETE' }),
      invalidatesTags: ['connection']
    })
  })
})

export const { useGetWithingsStatusQuery, useDisconnectWithingsMutation } = withingsApi
