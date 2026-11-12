// Thème choisi à la main (sinon celui de l'appareil) : posé avant l'affichage pour éviter un éclair de couleur.
// Fichier à part, et non script dans la page : la politique de sécurité (CSP) interdit les scripts en ligne.
try { var t = localStorage.getItem('on-mange-quand:theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
