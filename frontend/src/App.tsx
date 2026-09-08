import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router'

import { Admin } from './admin/Admin'
import { Enroll } from './auth/Enroll'
import { Login } from './auth/Login'
import { Home } from './Home'
import { useUser } from './hooks/useUser'
import { Profile } from './Profile'

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

const AdminRoute = () => {
  const { user, isAuthenticated, isLoading } = useUser()
  if (isLoading) {
    return (
      <p className="loading-screen" role="status">
        Checking access…
      </p>
    )
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return user?.role === 'admin' ? <Admin /> : <Navigate to="/" replace />
}

export const App = () => (
  <Routes>
    <Route path="/admin" element={<AdminRoute />} />
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
