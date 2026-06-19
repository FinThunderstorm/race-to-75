ALTER TABLE integration_connection
  ADD COLUMN external_user_id text;

ALTER TABLE integration_connection
  ADD CONSTRAINT integration_connection_external_user_id_not_blank CHECK (
    external_user_id IS NULL OR btrim(external_user_id) <> ''
  );

CREATE UNIQUE INDEX integration_connection_provider_external_user_id_unique
  ON integration_connection(provider, external_user_id)
  WHERE external_user_id IS NOT NULL;
