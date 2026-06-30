import { useGetMeQuery } from '../api/authApi'

export const useUser = () => {
  const { data, isLoading, isError } = useGetMeQuery()

  return { user: data, isAuthenticated: !isError && data !== undefined, isLoading }
}
