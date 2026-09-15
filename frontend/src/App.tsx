import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { Admin } from './Admin'
import { useGetRaceQuery } from './api/raceApi'
import { Enroll } from './auth/Enroll'
import { Login } from './auth/Login'
import { Home } from './Home'
import { useUser } from './hooks/useUser'
import { Profile } from './Profile'
import { IpAccessIndicator } from './race/IpAccessIndicator'
import { EufyReconnectNotice } from './settings/EufyReconnectNotice'

const ProtectedRoute = ({
  children,
  admin = false
}: {
  children: ReactElement
  admin?: boolean
}) => {
  const { user, isAuthenticated, isLoading } = useUser()
  const { search } = useLocation()

  if (isLoading) {
    return (
      <p className="loading-screen" role="status">
        Ladataan kisaa…
      </p>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  if (admin && user?.role !== 'admin') {
    return <Navigate to={{ pathname: '/profile', search }} replace />
  }
  return children
}

const SettingsRedirect = () => {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: '/profile', search, hash }} replace />
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
        Ladataan kisaa…
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
      <Route
        path="/admin"
        element={
          <ProtectedRoute admin>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route path="/settings" element={<SettingsRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/enroll" element={<Enroll />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<RaceRoute />} />
    </Routes>
    <IpAccessIndicator />
  </>
)
