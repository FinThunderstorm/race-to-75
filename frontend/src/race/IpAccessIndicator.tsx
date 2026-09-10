import { useGetRadiatorAccessQuery } from '../api/raceApi'

export const IpAccessIndicator = () => {
  const { data, isError } = useGetRadiatorAccessQuery(undefined, {
    pollingInterval: 30_000,
    refetchOnMountOrArgChange: true
  })
  const allowed = !isError && data?.allowed === true
  const label = isError
    ? 'IP-tarkistus ei onnistu'
    : !data
      ? 'Tarkistetaan IP-osoitetta…'
      : allowed
        ? 'IP-osoite sallittu'
        : 'IP-osoitetta ei sallittu'

  return (
    <aside
      className={`ip-access-indicator${allowed ? ' ip-access-indicator--allowed' : ''}`}
      aria-label="Verkon käyttöoikeus"
      aria-live="polite"
      title={
        isError
          ? 'Verkon tarkistus epäonnistui. Yritetään automaattisesti uudelleen.'
          : allowed
            ? 'Tästä verkosta voi katsella yhteistä näyttöä kirjautumatta.'
            : 'Yhteisen näytön katselu tästä verkosta vaatii kirjautumisen.'
      }
    >
      <span aria-hidden="true" />
      {label}
    </aside>
  )
}
