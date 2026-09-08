import { useGetRadiatorAccessQuery } from '../api/raceApi'

export const IpAccessIndicator = () => {
  const { data, isError } = useGetRadiatorAccessQuery(undefined, {
    pollingInterval: 30_000,
    refetchOnMountOrArgChange: true
  })
  const allowed = !isError && data?.allowed === true
  const label = isError
    ? 'IP check unavailable'
    : !data
      ? 'Checking IP…'
      : allowed
        ? 'IP allowed'
        : 'IP not allowed'

  return (
    <aside
      className={`ip-access-indicator${allowed ? ' ip-access-indicator--allowed' : ''}`}
      aria-label="Network access"
      aria-live="polite"
      title={
        isError
          ? 'Could not check this network. Retrying automatically.'
          : allowed
            ? 'This network can view the radiator without logging in.'
            : 'Radiator access from this network requires login.'
      }
    >
      <span aria-hidden="true" />
      {label}
    </aside>
  )
}
