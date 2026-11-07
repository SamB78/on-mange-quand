-- Un sondage : ses réglages (nom, période, jours et moments) et le créneau choisi.
CREATE TABLE polls (
  id TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  final_idx INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Une réponse par personne et par sondage. name_key = prénom sans accents ni majuscules.
-- ans = un caractère par créneau : 0 pas dispo, 1 dispo, 2 si besoin.
CREATE TABLE answers (
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  name_key TEXT NOT NULL,
  name TEXT NOT NULL,
  ans TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, name_key)
);
