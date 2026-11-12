-- Limite de débit maison : nombre d'écritures par minute, par empreinte d'adresse IP (bloc /64 en IPv6).
-- La limite intégrée aux Workers ne bloquait rien sur notre compte. Lignes effacées par la tâche de nuit.
CREATE TABLE rate_hits (
  bucket TEXT NOT NULL,      -- 'write' : toute écriture ; 'create' : création de sondage
  ip_hash TEXT NOT NULL,
  minute INTEGER NOT NULL,   -- Date.now() / 60000, arrondi
  hits INTEGER NOT NULL,
  PRIMARY KEY (bucket, ip_hash, minute)
);
CREATE INDEX rate_hits_minute ON rate_hits (minute);
