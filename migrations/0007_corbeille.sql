-- Corbeille : un sondage supprimé garde ses données pendant 30 jours (deleted_at = moment de la suppression),
-- le temps de le restaurer, puis la tâche programmée du serveur l'efface pour de bon.
ALTER TABLE polls ADD COLUMN deleted_at INTEGER;
CREATE INDEX polls_deleted_at ON polls (deleted_at);
