import { useGetMeQuery } from '../api/authApi'

export const useUser = () => {
  const { data, isLoading, isError } = useGetMeQuery(undefined, {
    refetchOnMountOrArgChange: true,
    pollingInterval: 30_000
  })

  return { user: data, isAuthenticated: !isError && data !== undefined, isLoading }
}
