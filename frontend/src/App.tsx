import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'

import { useGetRaceQuery } from './api/raceApi'
import { Enroll } from './auth/Enroll'
import { Login } from './auth/Login'
import { Home } from './Home'
import { useUser } from './hooks/useUser'
import { IpAccessIndicator } from './race/IpAccessIndicator'
import { Settings } from './Settings'
import { EufyReconnectNotice } from './settings/EufyReconnectNotice'

const ProtectedRoute = ({ children }: { children: ReactElement }) => {
  const { isAuthenticated, isLoading } = useUser()

  if (isLoading) {
    return (
      <p className="loading-screen" role="status">
        Loading the race…
      </p>
    )
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />
}

const SettingsRedirect = () => {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: '/settings', search, hash }} replace />
}

const RaceRoute = () => {
  const { isAuthenticated, isLoading } = useUser()
  const radiator = useGetRaceQuery('radiator', {
    skip: isLoading || isAuthenticated,
    pollingInterval: 30_000,
    refetchOnMountOrArgChange: true
  })

  if (isAuthenticated) {
    return <Home />
  }
  if (isLoading || radiator.isUninitialized || radiator.isLoading) {
    return (
      <p className="loading-screen" role="status">
        Loading the race…
      </p>
    )
  }
  if (
    radiator.error &&
    'status' in radiator.error &&
    (radiator.error.status === 401 || radiator.error.status === 403)
  ) {
    return <Navigate to="/login" replace />
  }
  return <Home radiator />
}

export const App = () => (
  <>
    <EufyReconnectNotice />
    <Routes>
      <Route path="/admin" element={<SettingsRedirect />} />
      <Route path="/profile" element={<SettingsRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/enroll" element={<Enroll />} />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<RaceRoute />} />
    </Routes>
    <IpAccessIndicator />
  </>
)
