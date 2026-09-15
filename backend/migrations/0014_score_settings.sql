CREATE TABLE score_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  components text[] NOT NULL DEFAULT ARRAY['bmi', 'biceps', 'blood-pressure', 'dots'],
  CONSTRAINT score_components_valid CHECK (
    array_ndims(components) = 1 AND cardinality(components) BETWEEN 1 AND 4 AND
    components <@ ARRAY['bmi', 'biceps', 'blood-pressure', 'dots']::text[] AND
    array_position(components, NULL) IS NULL AND
    cardinality(components) =
      ('bmi' = ANY(components))::int + ('biceps' = ANY(components))::int +
      ('blood-pressure' = ANY(components))::int + ('dots' = ANY(components))::int
  )
);

INSERT INTO score_settings DEFAULT VALUES;
