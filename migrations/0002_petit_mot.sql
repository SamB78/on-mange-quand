-- Petit mot facultatif laissé avec une réponse (ex. « dispo seulement après 20 h »).
ALTER TABLE answers ADD COLUMN note TEXT NOT NULL DEFAULT '';
