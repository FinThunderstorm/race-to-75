-- Hauismittaushistoria Slackista: 20 mittausta viidelle olemassa olevalle käyttäjälle.
-- Migraatioajuri hoitaa transaktion ja kirjaa tuonnin suoritetuksi kerran.
-- Nimet täsmäävät kirjainkoosta ja reunojen välilyönneistä riippumatta.
-- Uusia käyttäjiä ei luoda. Alanen ja rce jätetään pois: ei tunnettua historiaa.
-- Puuttuvat käyttäjät ohitetaan, jotta myös tyhjän kannan migraatiot onnistuvat.
-- Myöhemmin luoduille käyttäjille tämä kertaluonteinen migraatio ei tuo historiaa.
-- Moniselitteinen nimi keskeyttää migraation: korjaa käyttäjien nimet ja aja uudelleen.
--
-- Aineiston tulkinnat:
-- * 17.10.2024 lähetetyn "Hauis 17.11." -viestin päivä = 17.10.2024.
-- * Riku / Riku H / Riki = Riku Honkanen.
-- * Tsu = Timo Suomela; Jalai = rotsi-janne.
-- * Tomi pidetään erillään Tompasta, joten Tomin mittausta ei tuoda.
-- * Vuosiluvuttomat kesä- ja elokuun loppupään viestit ovat vuodelta 2026.
-- * Pumppi ja mittaaja jäävät tämän tiedoston kommentteihin, koska
--   taulussa ei ole niille sarakkeita.
-- * Pelkkiä kommentteja/vertauksia ei tulkita uusiksi mittauksiksi.
-- Uudelleenajo ohittaa jo olemassa olevan saman käyttäjän, päivän ja mitan.

SET LOCAL lock_timeout = '10s';

CREATE TEMP TABLE biceps_import_people (
  person text PRIMARY KEY,
  user_id uuid,
  aliases text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO biceps_import_people (person, user_id, aliases) VALUES
  ('riku',    NULL, ARRAY['Riku Honkanen', 'Riku', 'Riku H', 'Riki', 'rikuh']),
  ('jalai',   NULL, ARRAY['rotsi-janne', 'Jalai']),
  ('daria',   NULL, ARRAY['Daria']),
  ('tsu',     NULL, ARRAY['tsu', 'Timo Suomela']),
  ('tomppa',  NULL, ARRAY['Tomppa']);

CREATE TEMP TABLE biceps_import_readings (
  person text NOT NULL REFERENCES biceps_import_people(person),
  measured_at date NOT NULL,
  circumference_cm numeric NOT NULL,
  PRIMARY KEY (person, measured_at, circumference_cm)
) ON COMMIT DROP;

INSERT INTO biceps_import_readings (person, measured_at, circumference_cm) VALUES
  ('riku',    '2024-09-18', 33.0),

  -- Viestin aikaleima 17.10.; tekstissä ristiriitaisesti 17.11.
  ('riku',    '2024-10-17', 32.0),
  ('jalai',   '2024-10-17', 37.5),

  -- Mittaustapa ketjun mukaan full flex, myös aiemmilla kerroilla.
  ('daria',   '2025-02-06', 28.5),
  ('riku',    '2025-02-19', 34.0), -- Mittaaja: villea.

  ('daria',   '2025-03-06', 28.5),
  ('tsu',     '2025-03-06', 37.0),
  ('riku',    '2025-03-06', 34.0),

  ('riku',    '2025-03-31', 34.0), -- Ilman pumppia.
  ('daria',   '2025-03-31', 28.0),

  ('daria',   '2025-04-28', 28.0),
  ('riku',    '2025-07-02', 35.0), -- "Riku H".
  ('riku',    '2025-10-29', 36.5), -- "Riki".
  ('daria',   '2025-11-28', 29.5),
  ('daria',   '2025-12-18', 30.0),
  ('daria',   '2026-02-09', 31.5), -- Mittaaja: Riku.
  ('daria',   '2026-06-01', 32.5),
  ('riku',    '2026-06-01', 35.0), -- Ilman pumppia; Darian viesti klo 12.49.
  ('riku',    '2026-08-26', 35.5), -- Pumpin kanssa.
  ('tomppa',  '2026-08-27', 34.0);

-- Puuttuvat käyttäjät jäävät ilman user_id:tä; usea osuma on virhe.
DO $$
DECLARE
  person_row record;
  matches uuid[];
  problems text[] := ARRAY[]::text[];
BEGIN
  FOR person_row IN SELECT * FROM biceps_import_people WHERE user_id IS NULL LOOP
    SELECT array_agg(u.id ORDER BY u.id) INTO matches
    FROM users u
    WHERE EXISTS (
      SELECT 1 FROM unnest(person_row.aliases) AS a(alias)
      WHERE lower(btrim(a.alias)) IN (lower(btrim(u.display_name)), lower(btrim(u.email)))
    );

    IF cardinality(matches) > 1 THEN
      problems := array_append(problems, format('%s (%s osumaa)',
        person_row.person, coalesce(cardinality(matches), 0)));
    ELSE
      UPDATE biceps_import_people SET user_id = matches[1]
      WHERE person = person_row.person;
    END IF;
  END LOOP;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Hauishistorian käyttäjänimi vastaa useaa käyttäjää; korjaa nimet ennen uudelleenajoa: %',
      array_to_string(problems, ', ');
  END IF;
END $$;

-- Estää rinnakkaisia lisäyksiä ohittamasta alla olevaa duplikaattitarkistusta.
LOCK TABLE biceps_measurement IN SHARE ROW EXCLUSIVE MODE;

WITH inserted AS (
  INSERT INTO biceps_measurement (user_id, measured_at, circumference_cm)
  SELECT DISTINCT p.user_id, r.measured_at, r.circumference_cm
  FROM biceps_import_readings r
  JOIN biceps_import_people p USING (person)
  WHERE p.user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM biceps_measurement existing
    WHERE existing.user_id = p.user_id
      AND existing.measured_at = r.measured_at
      AND existing.circumference_cm = r.circumference_cm
  )
  RETURNING user_id
)
SELECT count(*) AS lisattyja_mittauksia FROM inserted;
