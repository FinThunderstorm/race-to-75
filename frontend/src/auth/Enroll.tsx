import { startRegistration } from '@simplewebauthn/browser'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { useEnrollOptionsMutation, useEnrollVerifyMutation } from '../api/authApi'
import { AuthLayout } from './AuthLayout'

export const Enroll = () => {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [enrollOptions] = useEnrollOptionsMutation()
  const [enrollVerify] = useEnrollVerifyMutation()
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  const enroll = async () => {
    setStatus('working')
    try {
      const options = await enrollOptions({ token }).unwrap()
      const response = await startRegistration({ optionsJSON: options })
      await enrollVerify({ token, response }).unwrap()
      navigate('/')
    } catch {
      setStatus('error')
    }
  }

  return (
    <AuthLayout>
      <p className="eyebrow">Liity kisaan</p>
      <h1>Ota pääsyavain käyttöön</h1>
      <p className="auth-description">Nopea käyttöönotto, ja olet lähtöviivalla.</p>
      <button
        className="primary-button"
        type="button"
        onClick={enroll}
        disabled={status === 'working' || !token}
      >
        {status === 'working' ? 'Luodaan pääsyavainta…' : 'Luo pääsyavain'}
      </button>
      {(status === 'error' || !token) && (
        <p role="alert">Rekisteröitymislinkki on virheellinen tai vanhentunut.</p>
      )}
      <p className="auth-hint">
        Kirjaudu sisään laitteesi sormenjäljellä, kasvojentunnistuksella tai turva-avaimella.
      </p>
    </AuthLayout>
  )
}
