'use strict';
/*
 * La mise à jour, et le fait de la dire.
 *
 * Une application posée sur l'écran d'accueil ne se recharge jamais : on
 * l'ouvre, on s'en sert, on la referme. Le service worker, lui, va chercher la
 * version suivante en silence et la tient prête — mais tant que la page vit sur
 * l'ancienne, la correction publiée n'atteint personne. Une version pouvait
 * ainsi dormir dans le cache d'un téléphone pendant des semaines, et rien, ni
 * dans l'application ni ailleurs, ne l'aurait laissé deviner.
 *
 * D'où ce module. Il fait trois choses :
 *
 *   il surveille   `updatefound` annonce qu'une version arrive ; l'état
 *                  `installed` dit qu'elle est complète, pré-cache compris.
 *                  C'est seulement là qu'on peut promettre une mise à jour
 *                  immédiate — annoncer plus tôt ferait attendre devant un
 *                  bouton qui ne répond pas.
 *   il demande     rien ne bascule sans un clic. Une application qui se
 *                  recharge sous les doigts fait perdre ce qu'on était en train
 *                  de faire, ici une séance de révision entamée.
 *   il vérifie     le navigateur ne consulte `sw.js` qu'à la navigation. Une
 *                  application ouverte pendant des jours n'apprendrait jamais
 *                  qu'une version existe : on redemande au retour à l'écran, au
 *                  plus une fois par quart d'heure, et jamais sans réseau.
 *
 * Le service worker n'appelle donc plus `skipWaiting()` de lui-même : il attend
 * ce clic. Ce n'est pas un détail de politesse — tant qu'il attend, l'ancienne
 * version continue de servir et son cache n'est pas effacé sous la page qui
 * s'en sert encore.
 */
(function (racine) {

  /* Assez rare pour ne pas peser sur la batterie ni sur le réseau, assez
   * fréquent pour qu'une correction publiée le matin arrive dans la journée. */
  const ENTRE_DEUX_VERIFICATIONS = 15 * 60 * 1000;

  /* Si le service worker ne répond pas au feu vert, on recharge quand même :
   * au pire la page revient telle qu'elle était, servie par la version en
   * place, et le bandeau se représentera. */
  const PATIENCE = 3000;

  let enregistrement = null;
  let elements = null;
  let versionActive = null;
  let derniereVerification = 0;
  let rechargementDemande = false;
  let ecarte = false;          // « Plus tard » — pour cette visite seulement

  function brancher() {
    if (elements) return;
    elements = {
      bandeau: document.getElementById('mise-a-jour'),
      texte: document.getElementById('mise-a-jour-texte'),
      appliquer: document.getElementById('b-mettre-a-jour'),
      plusTard: document.getElementById('b-maj-plus-tard'),
    };
    if (!elements.bandeau) return;
    elements.appliquer.addEventListener('click', appliquer);
    elements.plusTard.addEventListener('click', () => { ecarte = true; masquer(); });
  }

  // ── Le bandeau ────────────────────────────────────────────────────────────

  /* Le bandeau porte ses textes dans le HTML : ce module ne fait que le
   * montrer et le cacher. */
  function annoncer() {
    brancher();
    if (!elements.bandeau || ecarte) return;
    elements.appliquer.disabled = false;
    elements.bandeau.hidden = false;
    // Le bandeau doit être posé avant d'être animé, sinon il apparaît d'un bloc.
    requestAnimationFrame(() => elements.bandeau.classList.add('visible'));
  }

  function masquer() {
    if (!elements || !elements.bandeau) return;
    elements.bandeau.classList.remove('visible');
    elements.bandeau.hidden = true;
  }

  function enAttente() {
    return !!(enregistrement && enregistrement.waiting && navigator.serviceWorker.controller);
  }

  /* Le feu vert. On le donne au service worker qui patiente ; c'est lui qui, en
   * prenant la main, déclenchera `controllerchange` et donc le rechargement. */
  function appliquer() {
    rechargementDemande = true;
    if (elements && elements.appliquer) elements.appliquer.disabled = true;
    const attendant = enregistrement && enregistrement.waiting;
    if (!attendant) { racine.location.reload(); return; }
    attendant.postMessage({ type: 'passer-devant' });
    setTimeout(() => { if (rechargementDemande) racine.location.reload(); }, PATIENCE);
  }

  // ── Surveillance ──────────────────────────────────────────────────────────

  /* Reçoit l'enregistrement rendu par `navigator.serviceWorker.register()`.
   * C'est `demarrage.js` qui appelle, une fois l'application à l'écran. */
  function surveiller(inscription) {
    if (!inscription) return;
    enregistrement = inscription;
    derniereVerification = Date.now();  // le navigateur vient de le faire
    brancher();
    demanderLaVersion();

    // Une version peut déjà patienter : un autre onglet l'a installée.
    if (enAttente()) annoncer();

    inscription.addEventListener('updatefound', () => {
      const arrivant = inscription.installing;
      if (!arrivant) return;
      arrivant.addEventListener('statechange', () => {
        /* `installed` avec un contrôleur en place : c'est bien une mise à jour,
         * et elle est entière. Sans contrôleur, c'est la toute première
         * installation — il n'y a rien à annoncer, la page est déjà à jour. */
        if (arrivant.state === 'installed' && navigator.serviceWorker.controller) {
          annoncer();
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      /* Ne recharger que si nous l'avons demandé. Le premier `claim()` d'une
       * installation neuve passe aussi par ici, et recharger là ferait
       * clignoter l'application au tout premier lancement. */
      if (rechargementDemande) racine.location.reload();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') verifier();
    });
  }

  /* Redemande au serveur s'il existe une version plus récente.
   *
   * Renvoie ce qu'il y a à en dire : 'prete', 'en-cours', 'a-jour', 'echec',
   * 'sans-service-worker' — ou 'trop-tot' pour une vérification automatique qui
   * arrive trop près de la précédente. Le bandeau, lui, n'attend pas cette
   * réponse : il vient de `updatefound`, quelle que soit l'origine du contrôle.
   */
  async function verifier(force) {
    if (!enregistrement) return 'sans-service-worker';
    /* Une demande explicite annule le « Plus tard » : quelqu'un qui vient
     * chercher la mise à jour dans les Réglages doit pouvoir l'appliquer, pas
     * seulement apprendre qu'elle existe. */
    if (force) ecarte = false;
    if (!force) {
      const t = Date.now();
      if (t - derniereVerification < ENTRE_DEUX_VERIFICATIONS) return 'trop-tot';
      if (racine.navigator.onLine === false) return 'trop-tot';
      derniereVerification = t;
    }
    try {
      await enregistrement.update();
    } catch (erreur) {
      return 'echec';
    }
    if (enAttente()) {
      if (force) annoncer();
      return 'prete';
    }
    /* `update()` rend la main dès que le travail est lancé : le téléchargement
     * du noyau peut encore courir. Le dire évite de répondre « à jour » à
     * quelqu'un dont la nouvelle version est en train d'arriver. */
    if (enregistrement.installing) return 'en-cours';
    return 'a-jour';
  }

  /* La version de la coquille n'existe qu'à un endroit, `sw.js` — la recopier
   * ici en ferait un jumeau à tenir à jour, et ces jumeaux-là finissent
   * toujours par diverger. On la lui demande. */
  function demanderLaVersion() {
    const actif = navigator.serviceWorker.controller;
    if (!actif) return;
    const canal = new MessageChannel();
    canal.port1.onmessage = (e) => {
      if (e.data && e.data.version) versionActive = e.data.version;
    };
    actif.postMessage({ type: 'version' }, [canal.port2]);
  }

  racine.MiseAJour = {
    surveiller, verifier, appliquer,
    get version() { return versionActive; },
  };

})(window);
