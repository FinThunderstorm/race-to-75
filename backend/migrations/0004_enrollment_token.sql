CREATE TABLE enrollment_token (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollment_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT enrollment_token_hash_not_blank CHECK (btrim(token_hash) <> '')
);

CREATE INDEX enrollment_token_user_id_idx ON enrollment_token(user_id);
