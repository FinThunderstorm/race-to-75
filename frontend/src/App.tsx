import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'

import { Enroll } from './auth/Enroll'
import { Login } from './auth/Login'
import { Home } from './Home'
import { useUser } from './hooks/useUser'
import { Settings } from './Settings'

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

export const App = () => (
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
    <Route
      path="/"
      element={
        <ProtectedRoute>
          <Home />
        </ProtectedRoute>
      }
    />
  </Routes>
)
