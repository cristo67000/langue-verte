'use strict';
/*
 * Stockage local — IndexedDB.
 *
 * Rien ne sort de l'appareil : pas de compte, pas de serveur, pas de mesure
 * d'audience. Le dictionnaire lui-même n'est pas ici — il est dans le cache du
 * service worker, en fichiers ; ici ne vit que ce qui appartient à la personne
 * qui s'en sert.
 *
 * Six magasins :
 *   reglages    une ligne par réglage
 *   cartes      une fiche de révision : quel mot, quelle question, quand revoir
 *   journal     une ligne par réponse donnée, pour les statistiques
 *   historique  les mots récemment consultés
 *   notes       une note personnelle attachée à un mot — du dictionnaire ou à soi
 *   perso       les mots qu'on a entrés soi-même
 *
 * ── Des références, jamais des copies ───────────────────────────────────────
 *
 * Une fiche de révision et une note désignent leur mot par une référence :
 *
 *   dico:flic       une vedette du dictionnaire
 *   perso:p-1a2b3c  un mot à soi, par son identifiant stable
 *
 * Le dictionnaire peut donc être remplacé par une version plus récente sans
 * rien perdre : les notes et les fiches retrouvent leur mot par son nom. Et
 * l'identifiant d'un mot à soi ne dépend pas de son orthographe — corriger
 * une faute de frappe ne perd ni sa note ni ses révisions.
 */
(function (racine) {

  const NOM = 'langue-verte';
  const VERSION = 1;
  let bd = null;

  function ouvrir() {
    if (bd) return Promise.resolve(bd);
    return new Promise((resoudre, rejeter) => {
      const demande = indexedDB.open(NOM, VERSION);
      demande.onupgradeneeded = (e) => {
        const base = e.target.result;
        if (!base.objectStoreNames.contains('reglages')) {
          base.createObjectStore('reglages', { keyPath: 'cle' });
        }
        if (!base.objectStoreNames.contains('cartes')) {
          const magasin = base.createObjectStore('cartes', { keyPath: 'id' });
          magasin.createIndex('echeance', 'echeance', { unique: false });
          magasin.createIndex('ref', 'ref', { unique: false });
          magasin.createIndex('etat', 'etat', { unique: false });
        }
        if (!base.objectStoreNames.contains('journal')) {
          const magasin = base.createObjectStore('journal', { keyPath: 'id', autoIncrement: true });
          magasin.createIndex('quand', 'quand', { unique: false });
        }
        if (!base.objectStoreNames.contains('historique')) {
          const magasin = base.createObjectStore('historique', { keyPath: 'ref' });
          magasin.createIndex('quand', 'quand', { unique: false });
        }
        if (!base.objectStoreNames.contains('notes')) {
          const magasin = base.createObjectStore('notes', { keyPath: 'id' });
          magasin.createIndex('modifie', 'modifie', { unique: false });
        }
        if (!base.objectStoreNames.contains('perso')) {
          const magasin = base.createObjectStore('perso', { keyPath: 'id' });
          magasin.createIndex('cle', 'cle', { unique: false });
          magasin.createIndex('cree', 'cree', { unique: false });
        }
      };
      demande.onsuccess = () => {
        bd = demande.result;
        /* Un autre onglet qui demanderait une version supérieure resterait
         * bloqué tant que celui-ci garde la base ouverte. */
        bd.onversionchange = () => { bd.close(); bd = null; };
        resoudre(bd);
      };
      demande.onerror = () => rejeter(demande.error);
    });
  }

  function transaction(magasins, mode) {
    return ouvrir().then((base) => base.transaction(magasins, mode));
  }

  function promesse(requete) {
    return new Promise((resoudre, rejeter) => {
      requete.onsuccess = () => resoudre(requete.result);
      requete.onerror = () => rejeter(requete.error);
    });
  }

  /* Les opérations élémentaires sur un magasin, écrites une fois. */
  async function lire(magasin, cle_) {
    const t = await transaction([magasin], 'readonly');
    return promesse(t.objectStore(magasin).get(cle_));
  }
  async function ecrire(magasin, valeur) {
    const t = await transaction([magasin], 'readwrite');
    await promesse(t.objectStore(magasin).put(valeur));
    return valeur;
  }
  async function effacer(magasin, cle_) {
    const t = await transaction([magasin], 'readwrite');
    return promesse(t.objectStore(magasin).delete(cle_));
  }
  async function tout(magasin) {
    const t = await transaction([magasin], 'readonly');
    return promesse(t.objectStore(magasin).getAll());
  }
  async function vider(magasin) {
    const t = await transaction([magasin], 'readwrite');
    return promesse(t.objectStore(magasin).clear());
  }

  // ── Réglages ──────────────────────────────────────────────────────────────

  const DEFAUTS = {
    voix: true,
    voixFr: null,              // { uri, nom } d'une voix préférée, ou rien : automatique
    nouveautesParJour: 10,
    sensDesFiches: 'les-deux', // 'les-deux' | 'def' | 'mot'
    mode: 'varie',             // 'varie' | 'cartes'
    toutHorsLigne: true,       // télécharger la suite du dictionnaire d'office
  };

  async function lireReglages() {
    const lignes = await tout('reglages');
    const valeurs = Object.assign({}, DEFAUTS);
    for (const ligne of lignes) valeurs[ligne.cle] = ligne.valeur;
    return valeurs;
  }

  function ecrireReglage(cle_, valeur) {
    return ecrire('reglages', { cle: cle_, valeur }).then(() => valeur);
  }

  // ── Fiches de révision ────────────────────────────────────────────────────

  function cartesDe(ref) {
    return transaction(['cartes'], 'readonly')
      .then((t) => promesse(t.objectStore('cartes').index('ref').getAll(ref)));
  }

  function cartesDues(quand) {
    return transaction(['cartes'], 'readonly').then((t) => promesse(
      t.objectStore('cartes').index('echeance').getAll(IDBKeyRange.upperBound(quand))));
  }

  // ── Journal ───────────────────────────────────────────────────────────────

  async function noter(ligne) {
    const t = await transaction(['journal'], 'readwrite');
    return promesse(t.objectStore('journal').add(ligne));
  }

  async function journalDepuis(quand) {
    const t = await transaction(['journal'], 'readonly');
    return promesse(t.objectStore('journal').index('quand').getAll(IDBKeyRange.lowerBound(quand)));
  }

  // ── Historique de consultation ────────────────────────────────────────────

  const HISTORIQUE_MAX = 40;

  async function consulter(ref, mot) {
    const t = await transaction(['historique'], 'readwrite');
    const magasin = t.objectStore('historique');
    await promesse(magasin.put({ ref, mot, quand: Date.now() }));
    const lignes = await promesse(magasin.index('quand').getAll());
    for (const vieux of lignes.slice(0, Math.max(0, lignes.length - HISTORIQUE_MAX))) {
      magasin.delete(vieux.ref);
    }
  }

  async function historique() {
    const t = await transaction(['historique'], 'readonly');
    const lignes = await promesse(t.objectStore('historique').index('quand').getAll());
    return lignes.reverse();
  }

  racine.Store = {
    ouvrir, DEFAUTS,
    lireReglages, ecrireReglage,
    lireCarte: (id) => lire('cartes', id),
    ecrireCarte: (carte) => ecrire('cartes', carte),
    supprimerCarte: (id) => effacer('cartes', id),
    toutesLesCartes: () => tout('cartes'),
    cartesDe, cartesDues,
    noter, journalDepuis, toutLeJournal: () => tout('journal'),
    consulter, historique,
    effacerHistorique: (ref) => effacer('historique', ref),
    lireNote: (id) => lire('notes', id),
    ecrireNote: (note) => ecrire('notes', note),
    supprimerNote: (id) => effacer('notes', id),
    toutesLesNotes: () => tout('notes'),
    lireMotPerso: (id) => lire('perso', id),
    ecrireMotPerso: (mot) => ecrire('perso', mot),
    supprimerMotPerso: (id) => effacer('perso', id),
    tousLesMotsPerso: () => tout('perso'),
    vider,
  };

})(window);
