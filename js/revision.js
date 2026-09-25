'use strict';
/*
 * Le planificateur : quoi revoir, et quand.
 *
 * ── Pourquoi une répétition espacée ────────────────────────────────────────
 *
 * On oublie vite ce qu'on vient d'apprendre, puis de plus en plus lentement à
 * chaque rappel réussi. Revoir un mot juste avant de l'oublier coûte peu et
 * rapporte beaucoup ; le revoir trop tôt ne rapporte rien, trop tard revient à
 * l'apprendre à neuf. Tout le travail de ce fichier consiste à placer chaque
 * fiche au bon moment.
 *
 * L'algorithme est un SM-2 simplifié, celui de Wortschatz : chaque fiche porte
 * un intervalle et une « facilité » ; une réussite multiplie l'intervalle par
 * la facilité, un échec renvoie la fiche en apprentissage et rabote sa
 * facilité.
 *
 * ── Deux sortes de fiches ──────────────────────────────────────────────────
 *
 *   def   voir le mot, retrouver ce qu'il veut dire   « pusillanime » → ?
 *   mot   lire la définition, retrouver le mot         « qui manque de courage » → ?
 *
 * Les deux s'oublient à des rythmes différents : on reconnaît « pusillanime »
 * en lisant bien avant de savoir le placer soi-même. Une échéance commune
 * suivrait la plus facile des deux et ferait croire su un mot qu'on ne sait
 * que reconnaître. Le réglage « Ce que demandent les fiches » permet de n'en
 * garder qu'une.
 *
 * ── Ce que la fiche ne contient pas ────────────────────────────────────────
 *
 * Ni la définition ni les exemples : seulement la référence du mot. Le
 * dictionnaire peut ainsi être remplacé par une version plus récente, et un
 * mot à soi corrigé, sans que les révisions en soient affectées.
 */
(function (racine) {

  const JOUR = 24 * 60 * 60 * 1000;
  const MINUTE = 60 * 1000;

  /* Les paliers d'apprentissage, avant qu'une fiche n'entre en révision
   * espacée. Le premier est court exprès : revoir dix minutes plus tard une
   * fiche qu'on vient de rater est ce qui la fait tenir jusqu'au lendemain. */
  const PALIERS = [10 * MINUTE, JOUR];

  const FACILITE_INITIALE = 2.5;
  const FACILITE_MIN = 1.3;
  const FACILITE_MAX = 2.8;

  /* Au-delà de trois semaines d'intervalle, une fiche est dite acquise. */
  const ACQUISE = 21;

  const RATE = 0, DIFFICILE = 1, CORRECT = 2, FACILE = 3;

  function maintenant() {
    return Date.now();
  }

  function identifiant(ref, type) {
    return ref + '#' + type;
  }

  function neuve(ref, mot, type) {
    const t = maintenant();
    return {
      id: identifiant(ref, type),
      ref, mot, type,
      etat: 'nouveau',
      palier: 0,
      intervalle: 0,
      facilite: FACILITE_INITIALE,
      echeance: t,
      reussites: 0,
      echecs: 0,
      cree: t,
      vu: 0,
    };
  }

  /* Réglé depuis les Réglages ; ne vaut que pour les fiches créées ensuite.
   * Changer d'avis n'efface pas des mois de révisions : on cesse simplement
   * d'en fabriquer. */
  let sensDesFiches = 'les-deux';

  function typesVoulus() {
    if (sensDesFiches === 'def') return ['def'];
    if (sensDesFiches === 'mot') return ['mot'];
    return ['def', 'mot'];
  }

  async function apprendre(ref, mot) {
    const existantes = await Store.cartesDe(ref);
    const deja = new Set(existantes.map((c) => c.type));
    const creees = [];
    for (const type of typesVoulus()) {
      if (deja.has(type)) continue;
      const carte = neuve(ref, mot, type);
      await Store.ecrireCarte(carte);
      creees.push(carte);
    }
    return creees;
  }

  /* Retire les fiches d'un mot et les rend, pour qu'un « Annuler » puisse les
   * remettre telles quelles — intervalle, facilité, réussites. */
  async function oublier(ref) {
    const cartes = await Store.cartesDe(ref);
    for (const carte of cartes) await Store.supprimerCarte(carte.id);
    return cartes;
  }

  async function restaurer(cartes) {
    for (const carte of cartes) await Store.ecrireCarte(carte);
  }

  async function estSuivi(ref) {
    return (await Store.cartesDe(ref)).length > 0;
  }

  /* Un mot à soi renommé : ses fiches gardent leur identifiant, seule
   * l'étiquette d'affichage suit. */
  async function renommer(ref, mot) {
    for (const carte of await Store.cartesDe(ref)) {
      if (carte.mot !== mot) await Store.ecrireCarte(Object.assign(carte, { mot }));
    }
  }

  // ── Le calcul de la prochaine échéance ────────────────────────────────────

  function borner(valeur, bas, haut) {
    return Math.max(bas, Math.min(haut, valeur));
  }

  /* Applique un jugement et rend la fiche mise à jour. Fonction pure : elle
   * n'écrit rien, ce qui la rend vérifiable (build/essais.mjs). */
  function juger(carte, qualite, quand) {
    const t = quand || maintenant();
    const suite = Object.assign({}, carte, { vu: t });

    if (qualite === RATE) {
      suite.etat = 'apprentissage';
      suite.palier = 0;
      suite.echecs = carte.echecs + 1;
      suite.facilite = borner(carte.facilite - 0.2, FACILITE_MIN, FACILITE_MAX);
      suite.echeance = t + PALIERS[0];
      /* L'intervalle n'est pas remis à zéro mais divisé : un mot su pendant
       * trois mois puis raté une fois n'est pas revenu au premier jour. */
      suite.intervalle = Math.max(1, Math.round(carte.intervalle * 0.3));
      return suite;
    }

    suite.reussites = carte.reussites + 1;

    if (suite.etat === 'nouveau' || suite.etat === 'apprentissage') {
      /* Une fiche neuve n'a franchi aucun palier : sa première réussite la
       * place au palier 0, dix minutes plus tard — pas au lendemain. */
      const suivant = qualite === FACILE ? PALIERS.length
        : (suite.etat === 'nouveau' ? 0 : carte.palier + 1);
      if (suivant >= PALIERS.length) {
        suite.etat = 'revision';
        suite.intervalle = qualite === FACILE ? 4 : Math.max(1, suite.intervalle || 1);
        suite.echeance = t + suite.intervalle * JOUR;
      } else {
        suite.etat = 'apprentissage';
        suite.palier = suivant;
        suite.echeance = t + PALIERS[suivant];
      }
      return suite;
    }

    const ajustement = qualite === FACILE ? 0.1 : (qualite === DIFFICILE ? -0.15 : 0);
    suite.facilite = borner(carte.facilite + ajustement, FACILITE_MIN, FACILITE_MAX);
    const coefficient = qualite === DIFFICILE ? 1.2 : suite.facilite;
    suite.intervalle = Math.max(1, Math.round(Math.max(carte.intervalle, 1) * coefficient));
    suite.intervalle = Math.min(suite.intervalle, 730);
    suite.echeance = t + suite.intervalle * JOUR;
    return suite;
  }

  /* Combien de temps avant de revoir la fiche, selon la réponse : c'est ce
   * qu'affichent les boutons d'une fiche recto-verso. */
  function delaiSi(carte, qualite) {
    const t = maintenant();
    return juger(carte, qualite, t).echeance - t;
  }

  /* `libre` : un entraînement hors calendrier. La réponse est journalisée —
   * elle compte dans les statistiques du jour — mais la fiche n'est pas
   * touchée : s'entraîner dix fois ne doit pas faire croire au planificateur
   * qu'un mot est su pour six mois. */
  async function noter(carte, qualite, exercice, libre) {
    const suite = libre ? carte : juger(carte, qualite);
    if (!libre) await Store.ecrireCarte(suite);
    await Store.noter({
      quand: maintenant(),
      carte: carte.id,
      ref: carte.ref,
      mot: carte.mot,
      type: carte.type,
      exercice: exercice || null,
      qualite,
      etatAvant: carte.etat,
      libre: !!libre,
    });
    return suite;
  }

  // ── Composition d'une séance ──────────────────────────────────────────────

  function debutDuJour(t) {
    const d = new Date(t || maintenant());
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* Combien de fiches neuves ont déjà été entamées aujourd'hui — lu dans le
   * journal plutôt que dans un compteur qui se désynchroniserait. */
  async function nouveautesDuJour() {
    const lignes = await Store.journalDepuis(debutDuJour());
    const vues = new Set();
    for (const ligne of lignes) {
      if (ligne.etatAvant === 'nouveau' && !ligne.libre) vues.add(ligne.carte);
    }
    return vues.size;
  }

  /* La file d'une séance : ce qui est dû, puis quelques nouveautés. Les deux
   * fiches d'un même mot ne doivent pas se suivre : la première donnerait la
   * réponse de la seconde. */
  async function file(quota) {
    const t = maintenant();
    const dues = (await Store.cartesDues(t)).filter((c) => c.etat !== 'nouveau');
    const neuves = (await Store.toutesLesCartes()).filter((c) => c.etat === 'nouveau');
    const place = Math.max(0, (quota === undefined ? 10 : quota) - await nouveautesDuJour());
    neuves.sort((a, b) => a.cree - b.cree || (a.type === 'def' ? -1 : 1));
    return espacer(Outils.melanger(dues).concat(neuves.slice(0, place)));
  }

  /* Un entraînement libre : un tirage parmi toutes les fiches, les plus
   * fragiles d'abord. */
  async function fileLibre(combien) {
    const toutes = await Store.toutesLesCartes();
    const fragiles = toutes.slice().sort((a, b) =>
      (a.intervalle - b.intervalle) || (b.echecs - a.echecs) || (Math.random() - 0.5));
    return espacer(Outils.melanger(fragiles.slice(0, combien || 20)));
  }

  function espacer(liste) {
    const sortie = [];
    const attente = [];
    for (const carte of liste) {
      const recents = sortie.slice(-3).map((c) => c.ref);
      if (recents.indexOf(carte.ref) !== -1) attente.push(carte);
      else sortie.push(carte);
    }
    // Ce qui attendait est réinséré aussi loin que possible de son jumeau.
    for (const carte of attente) {
      let place = sortie.length;
      for (let i = sortie.length; i >= 0; i -= 1) {
        const avant = sortie[i - 1];
        const apres = sortie[i];
        if ((!avant || avant.ref !== carte.ref) && (!apres || apres.ref !== carte.ref)) {
          place = i;
          break;
        }
      }
      sortie.splice(place, 0, carte);
    }
    return sortie;
  }

  /* Ce que montre l'onglet Réviser. Deux unités : ce qu'il reste à faire se
   * compte en fiches, ce qu'on suit se compte en mots. */
  async function compter(quota) {
    const t = maintenant();
    const toutes = await Store.toutesLesCartes();
    const nouvelles = toutes.filter((c) => c.etat === 'nouveau').length;
    const dues = toutes.filter((c) => c.etat !== 'nouveau' && c.echeance <= t).length;
    const place = Math.max(0, (quota === undefined ? 10 : quota) - await nouveautesDuJour());
    return {
      total: toutes.length,
      mots: new Set(toutes.map((c) => c.ref)).size,
      nouvelles,
      dues,
      aFaire: dues + Math.min(nouvelles, place),
      apprentissage: toutes.filter((c) => c.etat === 'apprentissage').length,
      acquises: toutes.filter((c) => c.etat === 'revision' && c.intervalle >= ACQUISE).length,
      prochaine: toutes.filter((c) => c.etat !== 'nouveau' && c.echeance > t)
        .reduce((min, c) => Math.min(min, c.echeance), Infinity),
    };
  }

  /* Les jours d'affilée où l'on a révisé, aujourd'hui compris s'il y a eu
   * une réponse — sinon jusqu'à hier : la série n'est pas rompue tant que la
   * journée n'est pas finie. */
  async function serie() {
    const lignes = await Store.journalDepuis(maintenant() - 400 * JOUR);
    const jours = new Set(lignes.map((l) => debutDuJour(l.quand)));
    let jour = debutDuJour();
    if (!jours.has(jour)) jour -= JOUR;
    let n = 0;
    while (jours.has(jour)) {
      n += 1;
      // Un changement d'heure décale minuit d'une heure : on recale.
      jour = debutDuJour(jour - JOUR / 2);
    }
    const aujourdhui = lignes.filter((l) => l.quand >= debutDuJour());
    return {
      jours: n,
      reponses: aujourdhui.length,
      justes: aujourdhui.filter((l) => l.qualite >= CORRECT).length,
    };
  }

  racine.Revision = {
    RATE, DIFFICILE, CORRECT, FACILE, JOUR, PALIERS, ACQUISE, FACILITE_INITIALE,
    identifiant, neuve, apprendre, oublier, restaurer, estSuivi, renommer,
    juger, delaiSi, noter, file, fileLibre, espacer, compter, serie, nouveautesDuJour,
    get sensDesFiches() { return sensDesFiches; },
    set sensDesFiches(v) { sensDesFiches = v; },
  };

})(window);
