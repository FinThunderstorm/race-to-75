import { startAuthentication } from '@simplewebauthn/browser'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'

import { useLoginOptionsMutation, useLoginVerifyMutation } from '../api/authApi'
import { useUser } from '../hooks/useUser'
import { AuthLayout } from './AuthLayout'

export const Login = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useUser()
  const [loginOptions] = useLoginOptionsMutation()
  const [loginVerify] = useLoginVerifyMutation()
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const login = async () => {
    setStatus('working')
    try {
      const options = await loginOptions().unwrap()
      const response = await startAuthentication({ optionsJSON: options })
      await loginVerify({ response }).unwrap()
      navigate('/')
    } catch {
      setStatus('error')
    }
  }

  return (
    <AuthLayout>
      <p className="eyebrow">Oletko valmis?</p>
      <h1>Kirjaudu sisään</h1>
      <p className="auth-description">Seuraava askeleesi kohti 75 kiloa alkaa tästä.</p>
      <button
        className="primary-button"
        type="button"
        onClick={login}
        disabled={status === 'working'}
      >
        {status === 'working' ? 'Odotetaan pääsyavainta…' : 'Kirjaudu sisään pääsyavaimella'}
      </button>
      {status === 'error' && <p role="alert">Kirjautuminen epäonnistui.</p>}
      <p className="auth-hint">Uutena kisassa? Pyydä kutsu ylläpitäjältä.</p>
    </AuthLayout>
  )
}
