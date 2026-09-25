'use strict';
/*
 * Petits outils partagés par tous les modules.
 *
 * Tout ce qui s'affiche passe par `element()` et `textContent` : rien de ce
 * que contient le dictionnaire, ni de ce que l'on tape soi-même, n'est jamais
 * interprété comme du HTML.
 */
(function (racine) {

  function element(balise, classe, texte) {
    const noeud = document.createElement(balise);
    if (classe) noeud.className = classe;
    if (texte !== undefined && texte !== null) noeud.textContent = texte;
    return noeud;
  }

  function bouton(classe, texte, action) {
    const b = element('button', classe, texte);
    b.type = 'button';
    if (action) b.addEventListener('click', action);
    return b;
  }

  /* Une taille lisible : « 30,1 Mo ». */
  function humain(octets) {
    const unites = ['o', 'Ko', 'Mo', 'Go'];
    let valeur = octets;
    let rang = 0;
    while (valeur >= 1024 && rang < unites.length - 1) { valeur /= 1024; rang += 1; }
    const nombre = rang === 0 ? Math.round(valeur) : valeur.toFixed(1);
    return String(nombre).replace('.', ',') + ' ' + unites[rang];
  }

  /* « 1 fiche », « 3 fiches » — le pluriel français ordinaire, zéro compris
   * au singulier comme le veut l'usage. */
  function nombre(n, singulier, pluriel) {
    return n + ' ' + (n > 1 ? (pluriel || singulier + 's') : singulier);
  }

  const JOUR = 24 * 60 * 60 * 1000;

  /* « aujourd'hui », « demain », « dans 3 jours », « dans 2 mois ». */
  function echeanceLisible(quand, maintenant) {
    const t = maintenant || Date.now();
    if (quand <= t) return 'à revoir';
    const minuit = new Date(t);
    minuit.setHours(0, 0, 0, 0);
    const jours = Math.floor((quand - minuit.getTime()) / JOUR);
    if (jours <= 0) {
      const minutes = Math.round((quand - t) / 60000);
      if (minutes < 60) return 'dans ' + nombre(Math.max(1, minutes), 'minute');
      return 'aujourd’hui';
    }
    if (jours === 1) return 'demain';
    if (jours < 31) return 'dans ' + jours + ' jours';
    if (jours < 365) return 'dans ' + nombre(Math.round(jours / 30.4), 'mois', 'mois');
    return 'dans ' + nombre(Math.round(jours / 365), 'an');
  }

  /* Un intervalle en jours, pour les boutons « Difficile · 3 j ». */
  function intervalleCourt(millisecondes) {
    const minutes = millisecondes / 60000;
    if (minutes < 60) return Math.max(1, Math.round(minutes)) + ' min';
    const jours = millisecondes / JOUR;
    if (jours < 1) return Math.round(minutes / 60) + ' h';
    if (jours < 31) return Math.round(jours) + ' j';
    if (jours < 365) return Math.round(jours / 30.4) + ' mois';
    return (jours / 365).toFixed(1).replace('.', ',').replace(',0', '') + ' an';
  }

  function dateLisible(quand) {
    try {
      return new Date(quand).toLocaleDateString('fr-FR',
        { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return new Date(quand).toISOString().slice(0, 10);
    }
  }

  /* Mélange de Fisher-Yates, sur une copie. */
  function melanger(liste) {
    const copie = liste.slice();
    for (let i = copie.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
  }

  /* Un annonceur discret, en bas de l'écran, pour ce qui vient de se faire
   * et peut se défaire : « Retiré des fiches — Annuler ». */
  let minuterieAnnonce = null;
  function annoncer(texte, action, libelleAction) {
    const zone = document.getElementById('annonce');
    if (!zone) return;
    zone.textContent = '';
    zone.appendChild(element('span', null, texte));
    if (action) {
      zone.appendChild(bouton('lien-annonce', libelleAction || 'Annuler', () => {
        zone.hidden = true;
        action();
      }));
    }
    zone.hidden = false;
    requestAnimationFrame(() => zone.classList.add('visible'));
    if (minuterieAnnonce) clearTimeout(minuterieAnnonce);
    minuterieAnnonce = setTimeout(() => {
      zone.classList.remove('visible');
      setTimeout(() => { zone.hidden = true; }, 250);
    }, action ? 6000 : 3000);
  }

  racine.Outils = {
    element, bouton, humain, nombre, echeanceLisible, intervalleCourt, dateLisible,
    melanger, annoncer, JOUR,
  };

})(window);
