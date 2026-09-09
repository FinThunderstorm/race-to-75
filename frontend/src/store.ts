import { configureStore } from '@reduxjs/toolkit'

import { adminApi } from './api/adminApi'
import { authApi } from './api/authApi'
import { profileApi } from './api/profileApi'
import { raceApi } from './api/raceApi'
import { withingsApi } from './api/withingsApi'

export const store = configureStore({
  reducer: {
    [adminApi.reducerPath]: adminApi.reducer,
    [authApi.reducerPath]: authApi.reducer,
    [profileApi.reducerPath]: profileApi.reducer,
    [raceApi.reducerPath]: raceApi.reducer,
    [withingsApi.reducerPath]: withingsApi.reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      authApi.middleware,
      profileApi.middleware,
      raceApi.middleware,
      withingsApi.middleware,
      adminApi.middleware
    )
})
