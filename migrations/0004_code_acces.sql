-- Code d'accès facultatif (4 à 6 chiffres), choisi par un organisateur connecté. NULL : le lien suffit.
-- Gardé tel quel pour que l'organisateur puisse toujours le retrouver sur la page du sondage.
ALTER TABLE polls ADD COLUMN pin TEXT;

-- Essais de code récents, pour bloquer les tentatives en série : par sondage et par empreinte d'adresse IP.
-- Chaque ligne est effacée 15 minutes après le premier essai, ou dès que le bon code est donné.
CREATE TABLE pin_tries (
  poll_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  tries INTEGER NOT NULL,
  since INTEGER NOT NULL,
  PRIMARY KEY (poll_id, ip_hash)
);
CREATE INDEX pin_tries_since ON pin_tries (since);
