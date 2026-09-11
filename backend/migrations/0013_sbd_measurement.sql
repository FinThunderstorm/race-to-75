ALTER TABLE users ADD COLUMN sex text CHECK (sex IN ('male', 'female'));

CREATE TABLE sbd_measurement (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_at date NOT NULL,
  squat_kg numeric NOT NULL,
  bench_kg numeric NOT NULL,
  deadlift_kg numeric NOT NULL,
  bodyweight_kg numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sbd_lifts_valid CHECK (
    squat_kg BETWEEN 0.1 AND 1000 AND squat_kg = round(squat_kg, 1) AND
    bench_kg BETWEEN 0.1 AND 1000 AND bench_kg = round(bench_kg, 1) AND
    deadlift_kg BETWEEN 0.1 AND 1000 AND deadlift_kg = round(deadlift_kg, 1)
  ),
  CONSTRAINT sbd_bodyweight_valid CHECK (
    bodyweight_kg BETWEEN 1 AND 500 AND bodyweight_kg = round(bodyweight_kg, 1)
  ),
  CONSTRAINT sbd_date_valid CHECK (
    isfinite(measured_at) AND measured_at >= DATE '0001-01-01' AND
    measured_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
  )
);

CREATE INDEX sbd_measurement_user_date_idx
  ON sbd_measurement(user_id, measured_at DESC, id DESC);
