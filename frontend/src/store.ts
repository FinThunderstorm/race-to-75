import { configureStore } from '@reduxjs/toolkit'

import { authApi } from './api/authApi'
import { raceApi } from './api/raceApi'

export const store = configureStore({
  reducer: { [authApi.reducerPath]: authApi.reducer, [raceApi.reducerPath]: raceApi.reducer },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(authApi.middleware, raceApi.middleware)
})
