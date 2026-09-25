'use strict';
/*
 * L'onglet Réviser : l'accueil des fiches, la séance, le bilan.
 *
 * ── Qui juge ───────────────────────────────────────────────────────────────
 *
 * Aux choix multiples, à l'écriture et à la phrase à trou, c'est
 * l'application : juste, presque ou faux, et le calendrier suit. Seul « C'était
 * facile » est laissé à la personne, après une réponse juste — c'est la seule
 * chose que l'application ne peut pas savoir.
 *
 * À la fiche recto-verso, c'est la personne : elle retourne la fiche et dit
 * si elle savait. Chaque bouton annonce quand la fiche reviendra — « Je savais
 * · 6 j » —, ce qui rend le choix concret.
 *
 * ── Une fiche ratée revient ────────────────────────────────────────────────
 *
 * Une fiche ratée repasse en fin de séance, deux fois au plus : la revoir dans
 * quelques minutes est ce qui la fait tenir jusqu'au lendemain.
 */
(function (racine) {

  const { element, bouton } = Outils;
  const $ = (id) => document.getElementById(id);
  const RETOURS_MAX = 2;
  const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ù', 'û', 'ô', 'î', 'ï', 'ë', 'œ'];

  let reglages = null;
  let e = {};
  const etat = {
    file: [], position: 0, libre: false, stats: null, retours: new Map(),
    enAttente: null,        // une réponse juste pas encore notée (« C'était facile » ?)
    ratees: [], actif: false,
  };

  function brancher(r) {
    reglages = r;
    for (const id of ['revision-accueil', 'revision-compteurs', 'b-commencer', 'revision-vide',
      'b-vers-recherche', 'revision-rien-du-jour', 'b-entrainement', 'bloc-progres', 'seance',
      'seance-jauge', 'seance-compte', 'b-arreter', 'seance-libre', 'seance-consigne',
      'seance-enonce', 'seance-zone', 'seance-verdict', 'verdict-texte', 'verdict-remarque',
      'verdict-fiche', 'verdict-boutons', 'seance-bilan', 'bilan-chiffres', 'bilan-texte',
      'b-continuer', 'b-terminer', 'pastille-dues']) {
      e[id] = $(id);
    }
    e['b-commencer'].addEventListener('click', () => commencer(false));
    e['b-entrainement'].addEventListener('click', () => commencer(true));
    e['b-arreter'].addEventListener('click', arreter);
    e['b-continuer'].addEventListener('click', () => commencer(etat.libre));
    e['b-terminer'].addEventListener('click', () => { montrer('accueil'); rafraichir(); });
    e['b-vers-recherche'].addEventListener('click', () => App.basculer('chercher'));
    // Pendant une séance, rafraichir() ne repeint que la pastille de l'onglet.
    document.addEventListener('fiches-changees', () => rafraichir());
  }

  function montrer(quoi) {
    e['revision-accueil'].hidden = quoi !== 'accueil';
    e.seance.hidden = quoi !== 'seance';
    e['seance-bilan'].hidden = quoi !== 'bilan';
  }

  // ── L'accueil ─────────────────────────────────────────────────────────────

  function compteur(chiffre, libelle, classe) {
    const c = element('div', 'compteur ' + (classe || ''));
    c.appendChild(element('span', 'chiffre', String(chiffre)));
    c.appendChild(element('span', 'etiquette-compteur', libelle));
    return c;
  }

  async function rafraichir() {
    if (!e.seance) return;
    let c;
    try { c = await Revision.compter(reglages.nouveautesParJour); } catch (err) { return; }
    const pastille = e['pastille-dues'];
    pastille.hidden = c.aFaire === 0;
    pastille.textContent = c.aFaire > 99 ? '99+' : String(c.aFaire);
    if (etat.actif) return;

    const zone = e['revision-compteurs'];
    zone.textContent = '';
    zone.appendChild(compteur(c.dues, 'à revoir', c.dues ? 'mal' : ''));
    zone.appendChild(compteur(Math.min(c.nouvelles, c.aFaire - c.dues), 'nouvelles'));
    zone.appendChild(compteur(c.mots, c.mots > 1 ? 'mots suivis' : 'mot suivi', 'bien'));

    e['revision-vide'].hidden = c.total > 0;
    zone.hidden = c.total === 0;
    e['b-commencer'].hidden = c.aFaire === 0;
    e['b-commencer'].textContent = 'Commencer — ' + Outils.nombre(c.aFaire, 'fiche');
    e['revision-rien-du-jour'].hidden = !(c.total > 0 && c.aFaire === 0);
    e['b-entrainement'].hidden = c.total === 0;
    await dessinerProgres(c);
  }

  async function dessinerProgres(c) {
    const bloc = e['bloc-progres'];
    bloc.textContent = '';
    if (!c.total) return;
    const s = await Revision.serie().catch(() => null);
    bloc.appendChild(element('h3', 'rubrique', 'Où j’en suis'));
    const liste = element('ul', 'progres-liste');
    const ligne = (texte) => liste.appendChild(element('li', null, texte));
    if (s) {
      ligne(s.jours ? 'Série : ' + Outils.nombre(s.jours, 'jour') + ' d’affilée.' : 'Pas encore de série en cours.');
      if (s.reponses) ligne('Aujourd’hui : ' + Outils.nombre(s.reponses, 'réponse') + ', dont '
        + s.justes + (s.justes > 1 ? ' justes.' : ' juste.'));
    }
    ligne(Outils.nombre(c.acquises, 'fiche acquise', 'fiches acquises')
      + ' (revue à plus de trois semaines), ' + c.apprentissage + ' en apprentissage, '
      + Outils.nombre(c.nouvelles, 'nouvelle', 'nouvelles') + ' en attente.');
    if (c.prochaine !== Infinity && c.aFaire === 0) {
      ligne('Prochaine fiche : ' + Outils.echeanceLisible(c.prochaine) + '.');
    }
    bloc.appendChild(liste);
    if (c.total) {
      const jauge = element('div', 'jauge');
      const barre = element('div');
      barre.style.width = Math.round(100 * c.acquises / c.total) + '%';
      jauge.appendChild(barre);
      jauge.title = 'Part des fiches acquises';
      bloc.appendChild(jauge);
    }
  }

  // ── La séance ─────────────────────────────────────────────────────────────

  async function commencer(libre) {
    etat.libre = libre;
    etat.file = libre ? await Revision.fileLibre(20) : await Revision.file(reglages.nouveautesParJour);
    etat.position = 0;
    etat.stats = { juste: 0, presque: 0, faux: 0, total: 0 };
    etat.retours = new Map();
    etat.ratees = [];
    etat.enAttente = null;
    if (!etat.file.length) { montrer('accueil'); rafraichir(); return; }
    etat.actif = true;
    e['seance-libre'].hidden = !libre;
    montrer('seance');
    suivante();
  }

  async function arreter() {
    await validerEnAttente();
    etat.actif = false;
    Voix.taire();
    if (etat.stats && etat.stats.total) bilan();
    else { montrer('accueil'); rafraichir(); }
  }

  async function entreeDe(carte) {
    if (carte.ref.startsWith('perso:')) {
      const m = Perso.lire(carte.ref.slice(6));
      return m ? Perso.enEntree(m) : null;
    }
    return Lexique.entree(carte.ref.slice(5)).catch(() => null);
  }

  async function suivante() {
    await validerEnAttente();
    Voix.taire();
    while (etat.position < etat.file.length) {
      const carte = etat.file[etat.position];
      const entree = await entreeDe(carte);
      if (entree) {
        const question = await Exercices.preparer(carte, entree, reglages.mode).catch(() => null);
        if (question) { dessiner(question); return; }
      }
      // Hors ligne et pas encore téléchargée, ou mot à soi supprimé : on passe.
      etat.position += 1;
    }
    etat.actif = false;
    bilan();
  }

  function avancer() {
    const total = etat.file.length;
    e['seance-jauge'].style.width = Math.round(100 * etat.position / Math.max(1, total)) + '%';
    e['seance-compte'].textContent = (etat.position + 1) + ' / ' + total;
  }

  function enonceMot(q) {
    const bloc = element('div', 'enonce');
    const ligne = element('p', 'enonce-mot');
    ligne.appendChild(document.createTextNode(q.entree.m + ' '));
    ligne.appendChild(Voix.bouton(q.entree.m));
    bloc.appendChild(ligne);
    if (q.nature) bloc.appendChild(element('p', 'enonce-nature', q.nature));
    return bloc;
  }

  function enonceDefinition(q) {
    const bloc = element('div', 'enonce');
    if (q.nature) bloc.appendChild(element('p', 'enonce-nature', q.nature));
    if (q.marques.length) {
      const m = element('p', 'marques');
      for (const x of q.marques) m.appendChild(element('span', 'marque', x));
      bloc.appendChild(m);
    }
    bloc.appendChild(element('p', 'enonce-definition', q.definition));
    return bloc;
  }

  function dessiner(q) {
    avancer();
    e['seance-verdict'].hidden = true;
    e['seance-consigne'].textContent = q.consigne;
    const enonce = e['seance-enonce'];
    const zone = e['seance-zone'];
    enonce.textContent = '';
    zone.textContent = '';
    const pourMot = q.carte.type === 'mot';

    if (q.forme === 'trou') {
      const t = q.trou;
      const p = element('p', 'enonce-phrase');
      p.appendChild(document.createTextNode(t.texte.slice(0, t.marque[0])));
      p.appendChild(element('span', 'trou', '_____'));
      p.appendChild(document.createTextNode(t.texte.slice(t.marque[1])));
      enonce.appendChild(p);
      enonce.appendChild(element('p', 'enonce-indice', 'Sens : ' + Exercices.court(
        Exercices.masquer(t.definition, q.entree.m), 160)));
      enonce.appendChild(element('p', 'enonce-indice', 'Indice : ' + Exercices.indice(t.cible)));
    } else if (pourMot) {
      enonce.appendChild(enonceDefinition(q));
      if (q.forme === 'saisie') enonce.appendChild(element('p', 'enonce-indice', 'Indice : ' + q.indice));
    } else {
      enonce.appendChild(enonceMot(q));
    }

    if (q.forme === 'qcm-def' || q.forme === 'qcm-mot') dessinerChoix(q, zone);
    else if (q.forme === 'saisie' || q.forme === 'trou') dessinerSaisie(q, zone);
    else dessinerRectoVerso(q, zone);
  }

  function dessinerChoix(q, zone) {
    for (const choix of q.choix) {
      zone.appendChild(bouton('choix' + (q.forme === 'qcm-mot' ? ' choix-mot' : ''), choix, () => {
        for (const b of zone.querySelectorAll('.choix')) {
          b.disabled = true;
          if (b.textContent === q.bonne) b.classList.add('bonne');
        }
        const juste = choix === q.bonne;
        if (!juste) {
          const choisi = Array.from(zone.querySelectorAll('.choix')).find((b) => b.textContent === choix);
          if (choisi) choisi.classList.add('mauvaise');
        }
        conclure(q, juste ? 'juste' : 'faux', juste ? '' : 'La bonne réponse est en vert.');
      }));
    }
  }

  function dessinerSaisie(q, zone) {
    const champ = element('input', 'saisie');
    champ.type = 'text';
    champ.autocomplete = 'off';
    champ.setAttribute('autocapitalize', 'off');
    champ.setAttribute('autocorrect', 'off');
    champ.spellcheck = false;
    champ.setAttribute('aria-label', 'Votre réponse');
    champ.enterKeyHint = 'done';
    zone.appendChild(champ);

    const touches = element('div', 'touches');
    for (const lettre of ACCENTS) {
      touches.appendChild(bouton('touche', lettre, () => {
        const debut = champ.selectionStart === null ? champ.value.length : champ.selectionStart;
        const fin = champ.selectionEnd === null ? debut : champ.selectionEnd;
        champ.value = champ.value.slice(0, debut) + lettre + champ.value.slice(fin);
        champ.focus();
        champ.setSelectionRange(debut + 1, debut + 1);
      }));
    }
    zone.appendChild(touches);

    const ligne = element('div', 'ligne-boutons');
    const valider = bouton('bouton-principal', 'Valider');
    const passer = bouton('bouton-discret', 'Je ne sais pas');
    ligne.appendChild(valider);
    ligne.appendChild(passer);
    zone.appendChild(ligne);

    function repondre(abandon) {
      champ.disabled = true;
      valider.disabled = true;
      passer.disabled = true;
      for (const t of touches.querySelectorAll('button')) t.disabled = true;
      if (abandon) { conclure(q, 'faux', 'La réponse était « ' + q.attendu + ' ».'); return; }
      const lemme = q.forme === 'trou' ? q.entree.m : null;
      const c = Exercices.corriger(champ.value, q.attendu, lemme);
      const remarque = c.remarque || (c.verdict === 'faux' ? 'La réponse était « ' + q.attendu + ' ».' : '');
      conclure(q, c.verdict, remarque);
    }
    valider.addEventListener('click', () => { if (champ.value.trim()) repondre(false); else champ.focus(); });
    passer.addEventListener('click', () => repondre(true));
    champ.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && champ.value.trim()) { ev.preventDefault(); repondre(false); }
    });
    setTimeout(() => champ.focus(), 50);
  }

  /* Le verso d'une fiche : ce qu'il faut savoir du mot, en bref. */
  function verso(entree, pourMot) {
    const bloc = element('div', 'verso');
    if (pourMot) {
      const p = element('p', 'verso-mot');
      p.appendChild(document.createTextNode(entree.m + ' '));
      p.appendChild(Voix.bouton(entree.m));
      bloc.appendChild(p);
    }
    let n = 0;
    for (const l of entree.l) {
      for (const s of l.s) {
        if (!s.d || s.p || n >= 3) continue;
        n += 1;
        const d = element('p', 'verso-sens');
        d.appendChild(element('span', 'numero-sens', n + '. '));
        if (s.r && s.r.length) d.appendChild(element('span', 'marque-discrete', '(' + s.r.join(', ') + ') '));
        d.appendChild(document.createTextNode(Exercices.court(s.d, 260)));
        bloc.appendChild(d);
        if (n === 1 && s.x && s.x[0]) {
          const x = element('p', 'verso-exemple');
          x.appendChild(MotsVifs.texte(Exercices.court(s.x[0][0], 240), {
            marque: s.x[0][0].length <= 240 ? s.x[0][1] : null, vif: false }));
          bloc.appendChild(x);
        }
      }
    }
    const syn = [];
    for (const l of entree.l) for (const x of l.syn || []) if (syn.length < 6 && syn.indexOf(x[0]) === -1) syn.push(x[0]);
    const ant = [];
    for (const l of entree.l) for (const x of l.ant || []) if (ant.length < 4 && ant.indexOf(x[0]) === -1) ant.push(x[0]);
    if (syn.length) bloc.appendChild(element('p', 'verso-proches', '≈ ' + syn.join(', ')));
    if (ant.length) bloc.appendChild(element('p', 'verso-proches', '≠ ' + ant.join(', ')));
    return bloc;
  }

  function dessinerRectoVerso(q, zone) {
    const pourMot = q.carte.type === 'mot';
    zone.appendChild(bouton('bouton-principal retourner', 'Retourner la fiche', async () => {
      zone.textContent = '';
      zone.appendChild(verso(q.entree, pourMot));
      const note = await Notes.rappel(q.carte.ref);
      if (note) zone.appendChild(note);
      const notes = element('div', 'notes-boutons');
      const choix = [
        [Revision.RATE, 'À revoir', 'mal'],
        [Revision.DIFFICILE, 'Difficile', 'moyen'],
        [Revision.CORRECT, 'Je savais', 'bien'],
        [Revision.FACILE, 'Facile', 'facile'],
      ];
      for (const [qualite, libelle, classe] of choix) {
        const b = bouton('note-bouton ' + classe, '', () => noterEtSuivre(q, qualite, 'recto-verso'));
        b.appendChild(element('span', 'note-libelle', libelle));
        if (!etat.libre) b.appendChild(element('span', 'note-delai', Outils.intervalleCourt(Revision.delaiSi(q.carte, qualite))));
        notes.appendChild(b);
      }
      zone.appendChild(element('p', 'consigne', 'Saviez-vous ?'));
      zone.appendChild(notes);
      zone.appendChild(bouton('lien-discret', 'Voir la fiche complète', () => ouvrirFiche(q)));
    }));
  }

  function ouvrirFiche(q) {
    if (q.entree.perso) Fiche.ouvrir({ perso: q.entree.perso });
    else Fiche.ouvrir({ mot: q.entree.m });
  }

  async function noterEtSuivre(q, qualite, exercice) {
    compter(qualite >= Revision.CORRECT ? 'juste' : (qualite === Revision.DIFFICILE ? 'presque' : 'faux'), q);
    await enregistrer(q, qualite, exercice);
    etat.position += 1;
    suivante();
  }

  function compter(verdict, q) {
    etat.stats[verdict] += 1;
    etat.stats.total += 1;
    if (verdict === 'faux' && etat.ratees.indexOf(q.carte.ref) === -1) etat.ratees.push(q.carte.ref);
  }

  async function enregistrer(q, qualite, exercice) {
    const suite = await Revision.noter(q.carte, qualite, exercice, etat.libre).catch(() => q.carte);
    if (qualite === Revision.RATE && !etat.libre) {
      const n = etat.retours.get(q.carte.id) || 0;
      if (n < RETOURS_MAX) {
        etat.retours.set(q.carte.id, n + 1);
        etat.file.push(suite);
      }
    }
    document.dispatchEvent(new CustomEvent('fiches-changees'));
  }

  /* Une réponse juste attend le « Continuer » pour être notée : entre-temps,
   * « C'était facile » peut la surclasser. Toute sortie la note. */
  async function validerEnAttente() {
    const attente = etat.enAttente;
    if (!attente) return;
    etat.enAttente = null;
    await enregistrer(attente.q, attente.qualite, attente.q.forme);
  }

  async function conclure(q, verdict, remarque) {
    compter(verdict, q);
    const qualite = verdict === 'juste' ? Revision.CORRECT
      : (verdict === 'presque' ? Revision.DIFFICILE : Revision.RATE);
    if (verdict === 'juste') etat.enAttente = { q, qualite };
    else await enregistrer(q, qualite, q.forme);

    const cadre = e['seance-verdict'];
    cadre.className = 'verdict ' + verdict;
    e['verdict-texte'].textContent = verdict === 'juste' ? 'Juste !'
      : (verdict === 'presque' ? 'Presque.' : 'Pas cette fois.');
    e['verdict-remarque'].textContent = remarque || '';
    const fiche = e['verdict-fiche'];
    fiche.textContent = '';
    fiche.appendChild(verso(q.entree, true));
    const note = await Notes.rappel(q.carte.ref);
    if (note) fiche.appendChild(note);

    const boutons = e['verdict-boutons'];
    boutons.textContent = '';
    const continuer = bouton('bouton-principal', 'Continuer', () => { etat.position += 1; suivante(); });
    boutons.appendChild(continuer);
    if (verdict === 'juste' && !etat.libre) {
      boutons.appendChild(bouton('bouton-discret', 'C’était facile', () => {
        if (etat.enAttente) etat.enAttente.qualite = Revision.FACILE;
        etat.position += 1;
        suivante();
      }));
    }
    boutons.appendChild(bouton('lien-discret', 'Fiche', () => ouvrirFiche(q)));
    cadre.hidden = false;
    continuer.focus({ preventScroll: true });
    // Le verdict et « Continuer » à l'écran ; le rappel se lit en défilant.
    cadre.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Le bilan ──────────────────────────────────────────────────────────────

  async function bilan() {
    await validerEnAttente();
    etat.actif = false;
    montrer('bilan');
    const s = etat.stats;
    const zone = e['bilan-chiffres'];
    zone.textContent = '';
    zone.appendChild(compteur(s.juste, 'justes', 'bien'));
    zone.appendChild(compteur(s.presque, 'presque', 'moyen'));
    zone.appendChild(compteur(s.faux, s.faux > 1 ? 'ratées' : 'ratée', 'mal'));
    const texte = e['bilan-texte'];
    texte.textContent = '';
    if (etat.ratees.length) {
      texte.appendChild(document.createTextNode('À retravailler : '));
      etat.ratees.forEach((ref, i) => {
        if (i) texte.appendChild(document.createTextNode(', '));
        const mot = ref.startsWith('perso:') ? ((Perso.lire(ref.slice(6)) || {}).mot || '?') : ref.slice(5);
        texte.appendChild(bouton('lie', mot, () => (ref.startsWith('perso:')
          ? Fiche.ouvrir({ perso: ref.slice(6) }) : Fiche.ouvrir({ mot }))));
      });
      texte.appendChild(document.createTextNode('.'));
    } else if (s.total) {
      texte.textContent = 'Aucune erreur — bravo.';
    }
    const c = await Revision.compter(reglages.nouveautesParJour).catch(() => null);
    e['b-continuer'].hidden = etat.libre ? false : !(c && c.aFaire > 0);
    e['b-continuer'].textContent = etat.libre ? 'Encore un entraînement' : 'Continuer — ' + Outils.nombre(c ? c.aFaire : 0, 'fiche');
    rafraichir();
  }

  function regler(r) {
    reglages = r;
    if (!etat.actif) rafraichir();
  }

  racine.Seance = {
    brancher, rafraichir, regler,
    get active() { return etat.actif; },
  };

})(window);
