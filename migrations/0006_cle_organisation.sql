-- Clé d'organisation d'un sondage créé sans compte : empreinte d'un secret gardé par le navigateur du créateur.
-- Elle lui permet de modifier, clôturer ou supprimer son sondage depuis cet appareil, puis de le rattacher
-- à un compte (la clé est alors effacée). NULL : sondage avec organisateur, ou d'avant les clés.
ALTER TABLE polls ADD COLUMN admin_key TEXT;
