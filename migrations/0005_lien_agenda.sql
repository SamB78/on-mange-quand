-- Lien d'agenda personnel d'un compte : ses repas décidés, à ajouter une fois dans son agenda (abonnement).
-- token : partie secrète de l'adresse du lien. Un nouveau lien remplace l'ancien, qui cesse de marcher.
CREATE TABLE feeds (
  uid TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
