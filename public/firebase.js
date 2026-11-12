// Connexion par Firebase Authentication. Chargé après app.js, qui expose omqAuthAttach / omqAuthDisabled.
// Ces valeurs sont publiques : elles désignent le projet Firebase, rien de plus. Vides = app sans comptes.
const SDK = 'https://www.gstatic.com/firebasejs/13.1.0/';
const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const CONFIG = LOCAL
  ? { apiKey: 'demo-cle-locale', authDomain: 'localhost', projectId: 'demo-omq' } // émulateur local : npm run auth:local
  : {
      apiKey: 'AIzaSyCWEeqOLSoIuYSICVr7heOH1mQMI3VWdt8',
      authDomain: 'on-mange-quand-5a00a.firebaseapp.com',
      projectId: 'on-mange-quand-5a00a',
      appId: '1:704019232045:web:0f4fab0151c054cd498fa4',
    };

const MESSAGES = {
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
  'auth/invalid-login-credentials': 'E-mail ou mot de passe incorrect.',
  'auth/wrong-password': 'Mot de passe incorrect.',
  'auth/user-not-found': 'E-mail ou mot de passe incorrect.',
  'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse. Connectez-vous, ou utilisez « Mot de passe oublié ».',
  'auth/weak-password': 'Mot de passe trop court : 6 caractères minimum.',
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/missing-password': 'Indiquez votre mot de passe.',
  'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
  'auth/popup-blocked': 'La fenêtre Google a été bloquée. Autorisez les fenêtres pop-up pour ce site, puis réessayez.',
  'auth/network-request-failed': 'Connexion impossible. Vérifiez votre réseau.',
  'auth/user-disabled': 'Ce compte a été désactivé.',
  'auth/account-exists-with-different-credential': 'Un compte existe déjà avec cette adresse : connectez-vous avec votre mot de passe.',
  'auth/requires-recent-login': 'Par sécurité, reconnectez-vous puis réessayez.',
  'auth/user-mismatch': 'Ce n’est pas le compte connecté. Réessayez avec le bon compte.',
  'auth/operation-not-allowed': 'Ce mode de connexion n’est pas encore activé.',
};
const SILENT = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];
function friendly(e) {
  const code = (e && e.code) || '';
  const err = new Error(MESSAGES[code] || 'La connexion a échoué. Réessayez.');
  err.code = code;
  err.silent = SILENT.includes(code);
  return err;
}

if (!CONFIG.apiKey) {
  window.omqAuthDisabled();
} else {
  try {
    const [{ initializeApp }, fa] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js')]);
    const a = fa.getAuth(initializeApp(CONFIG));
    a.languageCode = 'fr';
    if (LOCAL) fa.connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true });
    const google = new fa.GoogleAuthProvider();
    google.setCustomParameters({ prompt: 'select_account' });
    const toUser = (u) => u && {
      uid: u.uid,
      email: u.email || '',
      name: u.displayName || '',
      verified: !!u.emailVerified,
      provider: u.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'password',
    };
    const guard = (fn) => async (...args) => { try { return await fn(...args); } catch (e) { throw friendly(e); } };
    let listener = () => {};
    window.omqAuthAttach({
      onChange(cb) { listener = cb; fa.onAuthStateChanged(a, (u) => cb(toUser(u))); },
      token: (force) => (a.currentUser ? a.currentUser.getIdToken(!!force) : Promise.resolve(null)),
      signIn: guard((email, password) => fa.signInWithEmailAndPassword(a, email, password)),
      signUp: guard(async (name, email, password) => {
        const { user } = await fa.createUserWithEmailAndPassword(a, email, password);
        if (name) await fa.updateProfile(user, { displayName: name });
        fa.sendEmailVerification(user).catch(() => {});
        listener(toUser(user)); // le prénom vient d'être ajouté : on prévient la page
      }),
      google: guard(() => fa.signInWithPopup(a, google)),
      reset: guard((email) => fa.sendPasswordResetEmail(a, email)),
      verify: guard(() => fa.sendEmailVerification(a.currentUser)),
      logout: () => fa.signOut(a),
      reauth: guard(async (password) => {
        const u = a.currentUser;
        if (u.providerData.some((p) => p.providerId === 'password')) {
          await fa.reauthenticateWithCredential(u, fa.EmailAuthProvider.credential(u.email, password));
        } else {
          await fa.reauthenticateWithPopup(u, google);
        }
      }),
      remove: guard(() => fa.deleteUser(a.currentUser)),
    });
  } catch (e) {
    console.error('Connexion indisponible :', e);
    window.omqAuthDisabled();
  }
}
