-- Every sync now refetches a fixed three-month window, so the per-connection start is dead.
ALTER TABLE eufy_sync DROP COLUMN import_from;
