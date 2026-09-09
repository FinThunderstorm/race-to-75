-- Practical data-entry bounds for optional height, not medical thresholds.
ALTER TABLE users ADD COLUMN height_cm numeric(4, 1)
  CONSTRAINT users_height_cm_valid CHECK (height_cm BETWEEN 50 AND 300);
