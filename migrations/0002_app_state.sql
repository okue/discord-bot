-- App-wide key-value state (e.g. hash of the last registered command definitions)
CREATE TABLE app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
