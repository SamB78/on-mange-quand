-- Compte Firebase de l'organisateur. NULL : sondage créé sans compte, où tout le monde peut tout faire.
ALTER TABLE polls ADD COLUMN owner_uid TEXT;
-- Sondage clôturé par l'organisateur : plus personne d'autre ne peut modifier les réponses.
ALTER TABLE polls ADD COLUMN closed INTEGER NOT NULL DEFAULT 0;
-- Compte de la personne qui a répondu en étant connectée (NULL sinon).
ALTER TABLE answers ADD COLUMN uid TEXT;

CREATE INDEX polls_owner_uid ON polls (owner_uid);
CREATE INDEX answers_uid ON answers (uid);
