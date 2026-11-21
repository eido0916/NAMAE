PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS names (
 id INTEGER PRIMARY KEY, country TEXT NOT NULL, name TEXT NOT NULL,
 normalized TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('given_name','surname')),
 language TEXT NOT NULL DEFAULT 'und', reading_ja TEXT, reading_source TEXT,
 reading_status TEXT NOT NULL DEFAULT 'pending' CHECK(reading_status IN ('pending','verified','rejected')),
 UNIQUE(country,normalized,type,language)
);
CREATE TABLE IF NOT EXISTS entities (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('person','character')),
 name TEXT NOT NULL, given_names_json TEXT NOT NULL DEFAULT '[]', family_names_json TEXT NOT NULL DEFAULT '[]',
 nationalities_json TEXT NOT NULL DEFAULT '[]', occupations_json TEXT NOT NULL DEFAULT '[]',
 description TEXT, work TEXT, image_url TEXT, image_license TEXT, image_credit TEXT, image_source TEXT,
 image_approved INTEGER NOT NULL DEFAULT 0, source_url TEXT NOT NULL,
 sitelinks INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS name_entities (
 name_id INTEGER NOT NULL REFERENCES names(id), entity_id TEXT NOT NULL REFERENCES entities(id),
 country TEXT NOT NULL, confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
 status TEXT NOT NULL CHECK(status IN ('pending','verified','rejected')),
 priority INTEGER NOT NULL DEFAULT 0, evidence_json TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT,
 PRIMARY KEY(name_id,entity_id)
);
CREATE INDEX IF NOT EXISTS detail_lookup ON names(country,type,normalized);
CREATE INDEX IF NOT EXISTS relation_status ON name_entities(name_id,status,priority);
CREATE TABLE IF NOT EXISTS collection_jobs (
 name_id INTEGER PRIMARY KEY REFERENCES names(id), state TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, error TEXT, evidence_json TEXT
);
CREATE TABLE IF NOT EXISTS response_cache (
 key TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_logs (
 id INTEGER PRIMARY KEY, name_id INTEGER REFERENCES names(id), state TEXT NOT NULL,
 message TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entity_localizations (
 entity_id TEXT NOT NULL, locale TEXT NOT NULL, type TEXT NOT NULL,
 body TEXT NOT NULL, PRIMARY KEY(entity_id,locale,type)
);
PRAGMA user_version = 1;
