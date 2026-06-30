import { useNavigate } from 'react-router'

import { useLogoutMutation } from './api/authApi'
import { useUser } from './hooks/useUser'

export const Home = () => {
  const { user } = useUser()
  const [logout] = useLogoutMutation()
  const navigate = useNavigate()

  return (
    <main>
      <h1>race-to-75</h1>
      <p>Signed in as {user?.display_name}</p>
      <button
        type="button"
        onClick={async () => {
          await logout().unwrap()
          navigate('/login')
        }}
      >
        Log out
      </button>
    </main>
  )
}
