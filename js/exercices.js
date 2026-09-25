'use strict';
/*
 * Les questions d'une fiche de révision, et leur correction.
 *
 * ── Cinq formes de question ────────────────────────────────────────────────
 *
 *   recto-verso   on voit le recto, on retourne, on dit soi-même si on savait
 *   qcm-def       « Que veut dire pusillanime ? » — quatre définitions
 *   qcm-mot       une définition — quatre mots
 *   saisie        une définition, l'initiale et le nombre de lettres — écrire
 *   trou          une citation dont le mot a disparu — le retrouver
 *
 * Une fiche « def » (retrouver le sens) ne peut pas se corriger au clavier :
 * personne ne tape une définition, et aucune machine ne jugerait la sienne.
 * Elle commence en choix multiple, le temps de faire connaissance, puis passe
 * au recto-verso, où l'on se juge soi-même. Une fiche « mot » (retrouver le
 * mot) va du choix multiple à l'écriture, avec la phrase à trou quand le
 * dictionnaire a une citation où le mot est repéré.
 *
 * ── Pourquoi l'initiale ────────────────────────────────────────────────────
 *
 * « Qui manque de courage » appelle aussi bien « lâche », « peureux »,
 * « poltron » que « pusillanime ». Sans indice, la question d'écriture
 * n'aurait pas de réponse unique, et l'on serait compté faux en ayant raison.
 * L'initiale et le nombre de lettres désignent le mot sans le donner.
 *
 * ── La correction ──────────────────────────────────────────────────────────
 *
 * juste     le mot tel quel, majuscule ou pas
 * presque   les bonnes lettres sans les accents (« pusillanime » pour
 *           « pusillanimé »), une faute de frappe dans un mot long, ou, dans
 *           une phrase à trou, le lemme au lieu de la forme (« cheval » pour
 *           « chevaux ») — le mot est su, la forme pas tout à fait
 * faux      le reste
 */
(function (racine) {

  const DEFINITION_MAX = 220;

  function premierSens(entree, pourMot) {
    const tous = [];
    for (const l of entree.l) for (const s of l.s) if (s.d) tous.push({ s, l });
    if (!tous.length) return null;
    if (!pourMot) return tous.find((x) => !x.s.v) || tous[0];
    // Pour retrouver le mot, une définition qui ne le contient pas.
    const k = Lexique.cle(entree.m);
    return tous.find((x) => !x.s.v && Lexique.cle(x.s.d).indexOf(k) === -1)
      || tous.find((x) => !x.s.v) || tous[0];
  }

  /* Le mot vedette retiré d'une définition : « D'une manière rapide » reste
   * lisible, mais « rapidement : avec rapidité » donnerait la réponse. */
  function masquer(texte, mot) {
    if (!texte || !mot || mot.length < 3 || mot.indexOf(' ') !== -1) return texte;
    // Le mot et sa famille proche : « rapidement » masque aussi « rapide ».
    const racine_ = mot.length <= 6 ? mot : mot.slice(0, Math.max(5, mot.length - 4));
    const echappe = racine_.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return texte.replace(new RegExp('(?<![\\p{L}])' + echappe + '[\\p{L}]*', 'giu'), '…');
  }

  function court(texte, max) {
    const t = String(texte || '').replace(/\s+/g, ' ').trim();
    if (t.length <= (max || DEFINITION_MAX)) return t;
    return t.slice(0, max || DEFINITION_MAX).replace(/\s+\S*$/, '') + '…';
  }

  /* Une citation où le mot est repéré, pour la phrase à trou. Les plus
   * courtes d'abord : une phrase à trou de quarante mots se lit mal. */
  function phraseATrou(entree) {
    const candidates = [];
    for (const l of entree.l) {
      for (const s of l.s) {
        for (const x of s.x || []) {
          const [texte, marque] = x;
          if (!marque || texte.length > 260) continue;
          const cible = texte.slice(marque[0], marque[1]);
          if (!/[\p{L}]{2,}/u.test(cible)) continue;
          candidates.push({ texte, marque, cible, definition: s.d });
        }
      }
    }
    candidates.sort((a, b) => a.texte.length - b.texte.length);
    return candidates.length ? candidates[Math.floor(Math.random() * Math.min(3, candidates.length))] : null;
  }

  // ── Les leurres des choix multiples ───────────────────────────────────────

  /* L'argot a dix mots pour une chose : « fric », « pognon » et « thune »
   * disent tous l'argent. Un leurre qui dirait la même chose que la bonne
   * réponse serait une seconde bonne réponse, et l'on serait compté faux en
   * ayant raison. Deux mots que l'index du français vers l'argot range sous
   * un même mot français ne se leurrent donc jamais l'un l'autre. */
  function partagentUnSens(a, b) {
    if (!racine.Lexique || !Lexique.conceptsDe) return false;
    const ca = Lexique.conceptsDe(a);
    if (!ca.length) return false;
    return Lexique.conceptsDe(b).some((k) => ca.indexOf(k) !== -1);
  }

  /* D'autres entrées, pour fabriquer des leurres : celles de la même tranche
   * pour un mot du dictionnaire — même début alphabétique, ce qui rend le
   * choix du mot plus délicat, à dessein — ou d'une tranche courante tirée au
   * hasard pour un mot à soi. */
  async function voisins(entree) {
    let lot = [];
    if (!entree.perso) {
      const r = Lexique.vedette(entree.m);
      if (r) lot = await Lexique.tranche(r.tranche).catch(() => []);
    }
    if (lot.length < 30) {
      const r = Lexique.auHasard((x) => x.bande <= 2 && !x.expression);
      if (r) lot = lot.concat(await Lexique.tranche(r.tranche).catch(() => []));
    }
    const perso = racine.Perso ? Perso.tous().map(Perso.enEntree) : [];
    return lot.concat(perso).filter((e) => e.m !== entree.m && !partagentUnSens(entree.m, e.m));
  }

  function natureCourte(entree) {
    return ((entree.l[0] || {}).nat || '').split(' ').slice(0, 2).join(' ');
  }

  async function leurresDefinitions(entree, bonne, combien) {
    const nature = natureCourte(entree);
    const tous = await voisins(entree);
    const vus = new Set([Lexique.cle(bonne).slice(0, 30)]);
    const pareils = [];
    const autres = [];
    for (const e of Outils.melanger(tous)) {
      const x = premierSens(e, false);
      if (!x || x.s.v) continue;
      const d = court(masquer(x.s.d, e.m), 160);
      const k = Lexique.cle(d).slice(0, 30);
      if (d.length < 12 || vus.has(k)) continue;
      vus.add(k);
      (natureCourte(e) === nature ? pareils : autres).push(d);
    }
    return pareils.concat(autres).slice(0, combien);
  }

  async function leurresMots(entree, combien) {
    const nature = natureCourte(entree);
    const tous = await voisins(entree);
    const expression = entree.m.indexOf(' ') !== -1;
    const vus = new Set([Lexique.cle(entree.m)]);
    const pareils = [];
    const autres = [];
    for (const e of Outils.melanger(tous)) {
      const k = Lexique.cle(e.m);
      if (vus.has(k) || (e.m.indexOf(' ') !== -1) !== expression) continue;
      vus.add(k);
      (natureCourte(e) === nature ? pareils : autres).push(e.m);
    }
    return pareils.concat(autres).slice(0, combien);
  }

  // ── Le choix de la question ───────────────────────────────────────────────

  function formeVoulue(carte, entree, mode) {
    if (mode === 'cartes') return 'recto-verso';
    const neuve = carte.etat === 'nouveau' || carte.etat === 'apprentissage';
    const jeune = carte.intervalle < 7;
    if (carte.type === 'def') {
      if (neuve) return 'qcm-def';
      if (jeune) return Math.random() < 0.5 ? 'qcm-def' : 'recto-verso';
      return 'recto-verso';
    }
    const trou = !!phraseATrou(entree);
    if (carte.etat === 'nouveau') return 'qcm-mot';
    if (neuve) return trou && Math.random() < 0.5 ? 'trou' : 'qcm-mot';
    return trou && Math.random() < 0.5 ? 'trou' : 'saisie';
  }

  /* Prépare la question d'une fiche. Rend un objet que `seance.js` dessine :
   * `forme`, `consigne`, et ce qu'il faut selon la forme. */
  async function preparer(carte, entree, mode, formeImposee) {
    let forme = formeImposee || formeVoulue(carte, entree, mode);
    const pourMot = carte.type === 'mot';
    const x = premierSens(entree, pourMot);
    if (!x) return null;
    const definition = court(pourMot ? masquer(x.s.d, entree.m) : x.s.d);
    const nature = x.l.nat || '';
    const question = { forme, carte, entree, definition, nature, marques: x.s.r || [] };

    if (forme === 'trou') {
      const t = phraseATrou(entree);
      if (!t) forme = question.forme = 'saisie';
      else {
        question.trou = t;
        question.attendu = t.cible;
        question.consigne = 'Complétez la citation';
      }
    }
    if (forme === 'qcm-def') {
      const leurres = await leurresDefinitions(entree, definition, 3);
      if (leurres.length < 2) forme = question.forme = 'recto-verso';
      else {
        question.choix = Outils.melanger([definition].concat(leurres));
        question.bonne = definition;
        question.consigne = 'Que veut dire ce mot ?';
      }
    }
    if (forme === 'qcm-mot') {
      const leurres = await leurresMots(entree, 3);
      if (leurres.length < 2) forme = question.forme = 'saisie';
      else {
        question.choix = Outils.melanger([entree.m].concat(leurres));
        question.bonne = entree.m;
        question.consigne = 'Quel mot correspond à cette définition ?';
      }
    }
    if (forme === 'saisie') {
      question.attendu = entree.m;
      question.consigne = 'Écrivez le mot';
      question.indice = indice(entree.m);
    }
    if (forme === 'recto-verso') {
      question.consigne = pourMot ? 'Quel est ce mot ?' : 'Que veut dire ce mot ?';
    }
    return question;
  }

  /* « p… (11 lettres) » ; pour une expression, l'initiale de chaque mot :
   * « t… d… l… p… ». */
  function indice(mot) {
    const mots = mot.split(/\s+/);
    if (mots.length > 1) return mots.map((m) => m[0] + '…').join(' ') + ' (' + mots.length + ' mots)';
    const lettres = (mot.match(/[\p{L}]/gu) || []).length;
    return mot[0] + '… (' + lettres + ' lettres)';
  }

  // ── La correction ─────────────────────────────────────────────────────────

  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const ligne = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      let precedent = ligne[0];
      ligne[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const temporaire = ligne[j];
        ligne[j] = Math.min(ligne[j] + 1, ligne[j - 1] + 1,
          precedent + (a[i - 1] === b[j - 1] ? 0 : 1));
        precedent = temporaire;
      }
    }
    return ligne[b.length];
  }

  function normaliser(texte) {
    return String(texte || '').trim().replace(/\s+/g, ' ').replace(/[’‘´`]/g, "'")
      .replace(/[.!?;:,]+$/, '').toLowerCase();
  }

  /* Rend `{ verdict: 'juste' | 'presque' | 'faux', remarque }`. `lemme` est
   * le mot vedette quand la réponse attendue en est une forme (phrase à
   * trou). */
  function corriger(reponse, attendu, lemme) {
    const r = normaliser(reponse);
    const a = normaliser(attendu);
    if (!r) return { verdict: 'faux', remarque: '' };
    if (r === a) return { verdict: 'juste', remarque: '' };
    if (Lexique.cle(r) === Lexique.cle(a)) {
      return { verdict: 'presque', remarque: 'Attention aux accents : « ' + attendu + ' ».' };
    }
    if (lemme && Lexique.cle(r) === Lexique.cle(lemme)) {
      return { verdict: 'presque', remarque: 'C’est bien le mot, mais la phrase demande la forme « ' + attendu + ' ».' };
    }
    const ka = Lexique.cle(a);
    if (ka.length >= 6 && distance(Lexique.cle(r), ka) === 1) {
      return { verdict: 'presque', remarque: 'Une lettre de travers : « ' + attendu + ' ».' };
    }
    return { verdict: 'faux', remarque: '' };
  }

  racine.Exercices = {
    preparer, corriger, masquer, indice, phraseATrou, premierSens, court, distance, partagentUnSens,
  };

})(window);
