'use strict';
/*
 * Amorçage : réglages, dictionnaire, mots à soi, service worker.
 *
 * Le service worker est enregistré en dernier, une fois l'application à
 * l'écran : il sert au deuxième lancement, pas au premier, et le retarder
 * évite de disputer la bande passante aux fichiers dont l'affichage a besoin
 * tout de suite. Son enregistrement est confié à `MiseAJour`, qui surveille
 * l'arrivée d'une version et se charge de l'annoncer.
 */
(function () {

  async function demarrer() {
    const ecran = document.getElementById('demarrage');

    let reglages;
    try {
      reglages = await Store.lireReglages();
    } catch (erreur) {
      // Une navigation privée peut refuser IndexedDB : on ouvre quand même le
      // dictionnaire, sans mémoire.
      reglages = Object.assign({}, Store.DEFAUTS);
    }

    let manifeste;
    try {
      const reponse = await fetch('data/manifeste.json');
      if (!reponse.ok) throw new Error('manifeste : ' + reponse.status);
      manifeste = await reponse.json();
      await Lexique.charger(manifeste);
      await Perso.charger().catch(() => {});
      App.brancher({ reglages, manifeste });
      ecran.classList.add('parti');
      setTimeout(() => { ecran.hidden = true; }, 300);
    } catch (erreur) {
      ecran.textContent = '';
      ecran.appendChild(Outils.element('p', null, 'Le dictionnaire n’a pas pu s’ouvrir.'));
      ecran.appendChild(Outils.element('p', 'discret',
        String(erreur && erreur.message ? erreur.message : erreur)));
      ecran.appendChild(Outils.bouton('bouton-discret', 'Réessayer', () => location.reload()));
      return;
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then((enregistrement) => MiseAJour.surveiller(enregistrement))
        .catch((erreur) => console.warn('La Langue verte : service worker non installé —', erreur));
    }
    Paquets.auto(manifeste, reglages).catch(() => {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();

})();
