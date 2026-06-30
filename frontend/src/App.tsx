import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router'

import { Enroll } from './auth/Enroll'
import { Login } from './auth/Login'
import { Home } from './Home'
import { useUser } from './hooks/useUser'

const ProtectedRoute = ({ children }: { children: ReactElement }) => {
  const { isAuthenticated, isLoading } = useUser()

  if (isLoading) {
    return <p>Loading…</p>
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export const App = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/enroll" element={<Enroll />} />
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
