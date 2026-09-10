CREATE TABLE blood_pressure_measurement (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  systolic integer NOT NULL,
  diastolic integer NOT NULL,
  measured_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blood_pressure_values_valid CHECK (
    systolic BETWEEN 1 AND 300 AND diastolic BETWEEN 1 AND 300 AND systolic > diastolic
  ),
  CONSTRAINT blood_pressure_date_finite CHECK (isfinite(measured_at))
);

CREATE INDEX blood_pressure_measurement_user_date_idx
  ON blood_pressure_measurement(user_id, measured_at DESC, id DESC);
