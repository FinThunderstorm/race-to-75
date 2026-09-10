import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { useDisconnectWithingsMutation, useGetWithingsStatusQuery } from '../api/withingsApi'

export const WithingsSettings = () => {
  const [params, setParams] = useSearchParams()
  const { data, isLoading, isFetching, isError, refetch } = useGetWithingsStatusQuery()
  const [disconnect, { isLoading: disconnecting }] = useDisconnectWithingsMutation()
  const [disconnectError, setDisconnectError] = useState(false)
  const result = params.get('withings')

  return (
    <section className="settings-panel" aria-labelledby="withings-heading">
      <h2 id="withings-heading">Withings</h2>
      {result === 'connected' && <p role="status">Withings yhdistetty.</p>}
      {result === 'cancelled' && (
        <p role="status">Yhdistäminen peruutettu. Voit yrittää uudelleen alta.</p>
      )}
      {result === 'error' && (
        <p role="alert">Withings-yhteyden muodostaminen epäonnistui. Yritä uudelleen.</p>
      )}
      {result === 'unavailable' && (
        <p role="alert">Withings-yhteys ei ole tällä hetkellä käytettävissä.</p>
      )}
      {params.get('sync') === 'failed' && (
        <p role="alert">
          Yhteys tallennettiin, mutta mittausten tuonti epäonnistui. Yritä uudelleen yhdistämällä
          uudestaan.
        </p>
      )}
      {params.get('updates') === 'failed' && (
        <p role="alert">
          Automaattisia päivityksiä ei voitu ottaa käyttöön. Yritä uudelleen yhdistämällä uudestaan.
        </p>
      )}
      {isLoading ? (
        <p role="status">Tarkistetaan yhteyttä…</p>
      ) : isError ? (
        <div role="alert">
          <p>Withings-yhteyden tarkistaminen epäonnistui.</p>
          <button
            className="text-button"
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Yritä uudelleen
          </button>
        </div>
      ) : (
        data && (
          <>
            <p className="connection-status" role="status">
              {data.connected ? 'Yhdistetty' : 'Ei yhdistetty'}
            </p>
            <p className="auth-description">
              {data.connected
                ? 'Tuodut painomittauksesi näkyvät reaaliaikaisessa kuvaajassa.'
                : 'Yhdistä Withings-tilisi tuodaksesi painomittauksesi kisaan.'}
            </p>
            {data.configured ? (
              <a className="primary-button" href="/api/integrations/withings/connect">
                {data.connected ? 'Yhdistä Withings uudelleen' : 'Yhdistä Withings'}
              </a>
            ) : (
              <p className="auth-description">
                Withingsiä ei ole vielä määritetty tähän sovellukseen.
              </p>
            )}
            {data.connected && (
              <>
                {!data.automaticUpdates && (
                  <p className="auth-hint">
                    Automaattiset päivitykset ovat pois käytöstä. Tuo uusimmat painomittaukset
                    yhdistämällä uudelleen.
                  </p>
                )}
                <button
                  className="text-button disconnect-button"
                  type="button"
                  disabled={disconnecting || isFetching}
                  onClick={async () => {
                    setDisconnectError(false)
                    try {
                      await disconnect().unwrap()
                      setParams({}, { replace: true })
                    } catch {
                      setDisconnectError(true)
                    }
                  }}
                >
                  {disconnecting ? 'Katkaistaan yhteyttä…' : 'Katkaise Withings-yhteys'}
                </button>
                <p className="auth-hint">
                  Yhteyden katkaiseminen lopettaa uusien mittausten tuonnin. Aiemmin tuodut
                  mittaukset säilyvät kisassa.
                </p>
              </>
            )}
          </>
        )
      )}
      {disconnectError && (
        <p role="alert">Withings-yhteyden katkaiseminen epäonnistui. Yritä uudelleen.</p>
      )}
    </section>
  )
}
