-- Empreinte du lien organisateur. NULL pour les sondages créés avant : tout le monde peut tout y faire.
ALTER TABLE polls ADD COLUMN admin_hash TEXT;
