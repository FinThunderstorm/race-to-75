CREATE TABLE biceps_measurement (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  circumference_cm numeric NOT NULL,
  measured_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT biceps_circumference_valid CHECK (
    circumference_cm BETWEEN 1 AND 100 AND
    circumference_cm = round(circumference_cm, 1)
  ),
  CONSTRAINT biceps_date_finite CHECK (isfinite(measured_at))
);

CREATE INDEX biceps_measurement_user_date_idx
  ON biceps_measurement(user_id, measured_at DESC, id DESC);
