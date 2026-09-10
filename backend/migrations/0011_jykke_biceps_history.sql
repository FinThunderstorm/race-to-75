-- Jykken ainoa historiallinen hauismittaus: 6.2.2025, 37.5 cm (full flex).
-- Myöhemmät keskusteluviestit viittaavat samaan tulokseen, eivät uusiin mittauksiin.
-- Migraatioajuri hoitaa transaktion ja suorittaa tuonnin kerran.
-- Kuten migraatiossa 0010, puuttuva käyttäjä ohitetaan eikä tiliä luoda.
-- Myöhemmin luodulle käyttäjälle tämä migraatio ei tuo historiaa automaattisesti.

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  matches uuid[];
BEGIN
  SELECT array_agg(u.id ORDER BY u.id) INTO matches
  FROM users u
  WHERE 'jykke' IN (lower(btrim(u.display_name)), lower(btrim(u.email)));

  IF cardinality(matches) > 1 THEN
    RAISE EXCEPTION 'Hauishistorian käyttäjänimi vastaa useaa käyttäjää; korjaa nimet ennen uudelleenajoa: jykke (% osumaa)',
      cardinality(matches);
  END IF;

  IF coalesce(cardinality(matches), 0) = 0 THEN
    RETURN;
  END IF;

  -- Estää rinnakkaisia lisäyksiä ohittamasta duplikaattitarkistusta.
  LOCK TABLE biceps_measurement IN SHARE ROW EXCLUSIVE MODE;

  INSERT INTO biceps_measurement (user_id, measured_at, circumference_cm)
  SELECT matches[1], DATE '2025-02-06', 37.5
  WHERE NOT EXISTS (
    SELECT 1 FROM biceps_measurement existing
    WHERE existing.user_id = matches[1]
      AND existing.measured_at = DATE '2025-02-06'
      AND existing.circumference_cm = 37.5
  );
END $$;
