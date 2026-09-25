'use strict';
/*
 * La fiche d'un mot.
 *
 * Dans l'ordre où on la lit : le mot, sa prononciation, sa fréquence ou son
 * époque, ses thèmes ; les boutons qui servent (fiches de révision, note) ;
 * puis, pour chaque nature, ses sens d'argot numérotés avec leurs marques
 * d'usage, leurs citations, leurs synonymes et contraires ; les autres mots
 * d'argot qui disent la même chose ; l'étymologie ; ce qu'en disaient les
 * dictionnaires du XIXᵉ siècle ; les expressions, les dérivés ; mes notes.
 *
 * Trois sortes d'entrées s'affichent de la même façon :
 *
 *   un mot du Wiktionnaire   ses sens d'argot et de familier seulement ; s'il
 *                            est aussi un mot courant (« cheval »), une ligne
 *                            rappelle son sens courant, qu'on ne détaille pas ;
 *   un mot des anciens seuls sa fiche est faite des articles de Delvau, de
 *                            Larchey ou de Virmaître ; la « lecture » cachée
 *                            (`o`) ne sert qu'à la recherche et aux révisions ;
 *   un mot à soi             `Perso.enEntree()` le met dans cette forme.
 *
 * ── On y navigue ───────────────────────────────────────────────────────────
 *
 * Tout mot d'une définition, tout synonyme, toute expression mène à sa fiche.
 * La fiche garde donc une pile : « ← flic » ramène d'où l'on vient, et le
 * bouton Retour du téléphone fait de même — chaque fiche ouverte pose une
 * entrée dans l'historique du navigateur. Sur un grand écran, la fiche
 * s'ouvre à droite de la liste, qui reste lisible et cliquable.
 */
(function (racine) {

  const { element, bouton } = Outils;

  // Au-delà, les sens suivants se déplient à la demande.
  const SENS_VISIBLES = 8;
  // Un article ancien plus long que cela se replie : Larchey cite volontiers
  // une page entière de Vidocq.
  const ANCIEN_REPLIE = 700;

  const BANDES = ['très courant', 'courant', 'moins courant', 'rare'];

  const SOURCES_ANCIENNES = {
    delvau: {
      auteur: 'Alfred Delvau', titre: 'Dictionnaire de la langue verte', annee: '1883',
      supplement: 'supplément de Gustave Fustier',
      lien: 'https://www.gutenberg.org/ebooks/54482',
    },
    larchey: {
      auteur: 'Lorédan Larchey', titre: 'Dictionnaire historique d’argot', annee: '1881',
      supplement: 'supplément',
      lien: 'https://fr.wikisource.org/wiki/Livre:Larchey_-_Dictionnaire_historique_d%E2%80%99argot_-_9e_%C3%A9dition.djvu',
    },
    virmaitre: {
      auteur: 'Charles Virmaître', titre: 'Dictionnaire d’argot fin-de-siècle', annee: '1894',
      supplement: 'petit supplément',
      lien: 'https://www.gutenberg.org/ebooks/57656',
    },
  };

  // Les marques d'usage qui disent l'argot, et celles qui disent la rudesse :
  // elles prennent chacune leur couleur.
  const MARQUES_ARGOT = /^(argot|verlan|louchébem|javanais|largonji|argot .+)$/i;
  const MARQUES_RUDES = /^(vulgaire|injurieux|péjoratif|blasphématoire|très familier)$/i;

  let panneau = null;
  let contenu = null;
  const pile = [];            // les fiches ouvertes, la dernière à l'écran
  let entreeAffichee = null;

  function brancher() {
    if (panneau) return;
    panneau = document.getElementById('fiche');
    contenu = document.getElementById('fiche-contenu');
    racine.addEventListener('popstate', () => {
      if (panneau.hidden) return;
      pile.pop();
      if (pile.length) afficher(pile[pile.length - 1], false);
      else fermer(true);
    });
    racine.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panneau.hidden && !(racine.Perso && Perso.estOuvert())) {
        history.back();
      }
    });
    document.addEventListener('perso-change', () => {
      const haut = pile[pile.length - 1];
      if (!panneau.hidden && haut && haut.perso) afficher(haut, false);
    });
  }

  function refDe(cible) {
    return cible.perso ? 'perso:' + cible.perso : 'dico:' + cible.mot;
  }

  /* Ouvre une fiche : `{mot}` pour le dictionnaire, `{perso}` pour un mot à
   * soi. */
  function ouvrir(cible) {
    brancher();
    const haut = pile[pile.length - 1];
    if (!panneau.hidden && haut && refDe(haut) === refDe(cible)) return;
    pile.push(cible);
    history.pushState({ fiche: pile.length }, '');
    afficher(cible, true);
  }

  function fermer(depuisHistorique) {
    brancher();
    if (panneau.hidden) return;
    if (!depuisHistorique) {
      // Dépile d'un coup toutes les entrées d'historique qu'on avait posées.
      const n = pile.length;
      pile.length = 0;
      panneau.hidden = true;
      document.body.classList.remove('fiche-ouverte');
      if (n) history.go(-n);
    } else {
      pile.length = 0;
      panneau.hidden = true;
      document.body.classList.remove('fiche-ouverte');
    }
    Voix.taire();
    entreeAffichee = null;
    document.dispatchEvent(new CustomEvent('fiche-fermee'));
  }

  async function afficher(cible, nouvelle) {
    panneau.hidden = false;
    document.body.classList.add('fiche-ouverte');
    contenu.textContent = '';
    contenu.appendChild(tete());
    const attente = element('p', 'discret attente', 'Ouverture…');
    contenu.appendChild(attente);
    if (nouvelle) panneau.scrollTop = 0;

    let entree = null;
    let erreur = null;
    if (cible.perso) {
      const mot = Perso.lire(cible.perso);
      entree = mot ? Perso.enEntree(mot) : null;
    } else {
      try { entree = await Lexique.entree(cible.mot); } catch (e) { erreur = e; }
    }
    // Une autre fiche a pu être ouverte pendant l'attente.
    if (pile[pile.length - 1] !== cible) return;
    attente.remove();

    if (!entree) {
      dessinerAbsente(cible, erreur);
      return;
    }
    entreeAffichee = entree;
    dessiner(entree);
    panneau.scrollTop = 0;
    Store.consulter(refDe(cible), entree.m).catch(() => {});
    document.dispatchEvent(new CustomEvent('fiche-ouverte', { detail: { ref: refDe(cible) } }));
  }

  function tete() {
    const barre = element('div', 'fiche-tete');
    if (pile.length > 1) {
      const precedente = pile[pile.length - 2];
      const libelle = precedente.perso ? ((Perso.lire(precedente.perso) || {}).mot || 'Retour') : precedente.mot;
      barre.appendChild(bouton('fiche-retour', '← ' + libelle, () => history.back()));
    }
    barre.appendChild(element('span', 'espace'));
    barre.appendChild(bouton('fiche-fermer', 'Fermer', () => fermer(false)));
    return barre;
  }

  /* Une tranche que l'appareil n'a pas encore, hors ligne : on montre ce que
   * l'index sait déjà — le mot, sa nature, le début de sa définition — et on
   * dit pourquoi le reste manque. */
  function dessinerAbsente(cible, erreur) {
    const r = cible.mot ? Lexique.vedette(cible.mot) : null;
    contenu.appendChild(element('h2', 'vedette-mot', cible.mot || '?'));
    if (r) {
      if (r.nature) contenu.appendChild(element('p', 'nature', r.nature));
      contenu.appendChild(element('p', 'definition', r.apercu));
    }
    const message = element('div', 'bloc-absent');
    if (erreur && erreur.absente) {
      message.appendChild(element('p', null,
        'Cette fiche n’est pas encore sur l’appareil, et le réseau ne répond pas.'));
      message.appendChild(element('p', 'discret',
        'Elle s’ouvrira dès le retour du réseau — ou, pour tout avoir hors ligne, '
        + 'téléchargez le dictionnaire complet dans les Réglages.'));
    } else if (cible.perso) {
      message.appendChild(element('p', null, 'Ce mot a été supprimé de votre carnet.'));
    } else {
      message.appendChild(element('p', null, 'Cette fiche n’a pas pu être ouverte.'));
      if (erreur) message.appendChild(element('p', 'discret', String(erreur.message || erreur)));
    }
    message.appendChild(bouton('bouton-discret', 'Réessayer', () => afficher(cible, false)));
    contenu.appendChild(message);
  }

  // ── Le dessin ─────────────────────────────────────────────────────────────

  /* Un mot lié — synonyme, expression, dérivé : un bouton s'il a sa fiche,
   * du texte sinon. */
  function lien(mot, classe) {
    const r = Lexique.vedette(mot) || (mot !== mot.toLowerCase() ? Lexique.vedette(mot.toLowerCase()) : null);
    if (!r) return element('span', (classe || 'lie') + ' sans-fiche', mot);
    return bouton((classe || 'lie'), mot, () => ouvrir({ mot: r.mot }));
  }

  function classeDeMarque(m) {
    if (MARQUES_RUDES.test(m)) return 'marque rude';
    if (MARQUES_ARGOT.test(m)) return 'marque argot';
    return 'marque';
  }

  function etiquettes(liste, classe) {
    const bloc = element('span', classe || 'marques');
    for (const e of liste || []) bloc.appendChild(element('span', classeDeMarque(e), e));
    return bloc;
  }

  function rubrique(titre, classe) {
    const section = element('section', 'rubrique-fiche ' + (classe || ''));
    section.appendChild(element('h3', 'rubrique', titre));
    return section;
  }

  function lecturesVisibles(e) {
    return e.l.filter((l) => !l.o);
  }

  function dessiner(e) {
    const ref = e.perso ? 'perso:' + e.perso : 'dico:' + e.m;
    const visibles = lecturesVisibles(e);

    // Le mot.
    const vedette = element('div', 'vedette');
    vedette.appendChild(element('h2', 'vedette-mot', e.m));
    vedette.appendChild(Voix.bouton(e.m));
    contenu.appendChild(vedette);

    const infos = element('p', 'infos');
    const api = (e.l.find((l) => l.api) || {}).api;
    if (api) infos.appendChild(element('span', 'api', '\\' + api + '\\'));
    if (e.b === Lexique.ANCIEN) {
      const b = element('span', 'frequence epoque');
      b.appendChild(element('span', 'points', '✦'));
      b.appendChild(element('span', null, ' argot du XIXᵉ siècle'));
      b.title = 'Mot que seuls les dictionnaires de Delvau, Larchey ou Virmaître donnent';
      infos.appendChild(b);
    } else if (e.sp) {
      // La fréquence d'un mot courant (« cheval ») dirait celle de l'animal,
      // pas de l'héroïne : on ne la donne pas.
      infos.appendChild(element('span', 'frequence', 'sens argotiques d’un mot courant'));
    } else if (e.b !== null && e.b !== undefined && !e.x) {
      const b = element('span', 'frequence bande-' + e.b);
      b.title = 'Fréquence d’usage (Lexique 3.83, films et livres)';
      b.appendChild(element('span', 'points', '●●●●'.slice(0, 4 - e.b) + '○○○○'.slice(0, e.b)));
      b.appendChild(element('span', null, ' ' + BANDES[e.b]));
      infos.appendChild(b);
    }
    if (e.perso) infos.appendChild(element('span', 'pastille perso', 'mon mot'));
    contenu.appendChild(infos);

    if (e.th && e.th.length && racine.Explorer) {
      const themes = element('div', 'themes-fiche');
      for (const id of e.th) {
        const nom = Explorer.nomDuTheme(id);
        if (!nom) continue;
        themes.appendChild(bouton('theme-pastille', nom, () => {
          fermer(false);
          Explorer.ouvrirTheme(id);
        }));
      }
      if (themes.childElementCount) contenu.appendChild(themes);
    }

    contenu.appendChild(actions(e, ref));

    // Le sens de la langue courante, en une ligne : « au sens courant » quand
    // il vient d'abord (« cheval », l'animal), « autre sens » quand le mot
    // est d'abord de l'argot (« taule », puis la table de l'enclume).
    if (e.sc) {
      const courant = element('p', 'sens-courant');
      courant.appendChild(element('span', 'sens-courant-titre', e.sp ? 'Au sens courant : ' : 'Autre sens : '));
      courant.appendChild(document.createTextNode(e.sc));
      if (e.nc > 1) {
        courant.appendChild(element('span', 'discret', ' — et ' + (e.nc - 1)
          + (e.nc > 2 ? ' autres sens' : ' autre sens') + ' de la langue courante, non repris ici.'));
      } else {
        courant.appendChild(element('span', 'discret', ' — non repris ici.'));
      }
      contenu.appendChild(courant);
    }

    // Une étymologie par bloc distinct ; si plusieurs natures en ont des
    // différentes, chacune a la sienne.
    const etymologies = e.et || [];
    const plusieurs = etymologies.length > 1;

    visibles.forEach((lecture, numero) => {
      contenu.appendChild(dessinerLecture(e, lecture, numero, visibles.length));
    });

    // Pour un mot que seuls les anciens donnent, leurs articles sont la fiche.
    if (!visibles.length && e.anc) contenu.appendChild(dessinerAnciens(e, true));

    if (!e.perso) {
      const memes = Lexique.memesSens(e.m, 18);
      if (memes.length) contenu.appendChild(dessinerMemesSens(memes));
    }

    if (etymologies.length) {
      const section = rubrique('Étymologie', 'etymologie');
      etymologies.forEach((bloc, i) => {
        if (plusieurs) {
          const natures = visibles.filter((l) => l.e === i).map((l) => l.nat.split(' ')[0]);
          const uniques = natures.filter((n, j) => natures.indexOf(n) === j);
          if (uniques.length) section.appendChild(element('p', 'etymologie-pour', uniques.join(', ')));
        }
        for (const paragraphe of bloc) {
          const p = element('p', 'etymologie-texte');
          p.appendChild(MotsVifs.texte(paragraphe, { exclue: e.m }));
          section.appendChild(p);
        }
      });
      const attestation = (e.l.find((l) => l.at) || {}).at;
      if (attestation) section.appendChild(element('p', 'discret', 'Première attestation : ' + attestation + '.'));
      contenu.appendChild(section);
    }

    if (visibles.length && e.anc) contenu.appendChild(dessinerAnciens(e, false));

    if (e.loc && e.loc.length) contenu.appendChild(listeLiee('Expressions et locutions', e.loc, 'locutions'));
    if (e.prov && e.prov.length) contenu.appendChild(listeLiee('Proverbes et dictons', e.prov, 'locutions'));
    if (e.der && e.der.length) contenu.appendChild(nuage('Dérivés et composés', e.der));
    const apparentes = [].concat(e.rel || [], e.hyper || [], e.hypo || []);
    if (apparentes.length) contenu.appendChild(nuage('Vocabulaire apparenté', apparentes));

    const paronymes = [];
    for (const l of visibles) for (const p of l.par || []) if (paronymes.indexOf(p[0]) === -1) paronymes.push(p[0]);
    if (paronymes.length) contenu.appendChild(nuage('À ne pas confondre avec', paronymes.map((p) => [p])));

    const notes = Notes.construire(ref, e.m);
    notes.id = 'fiche-notes';
    contenu.appendChild(notes);

    contenu.appendChild(source(e));
  }

  function actions(e, ref) {
    const ligne = element('div', 'actions-fiche');
    const suivre = bouton('bouton-principal apprendre', 'Ajouter aux fiches');
    const aDesSens = e.l.some((l) => l.s.some((s) => s.d));
    let retirees = null;

    async function peindre() {
      const suivi = await Revision.estSuivi(ref).catch(() => false);
      suivre.classList.toggle('suivi', suivi);
      suivre.textContent = suivi ? '✓ Dans mes fiches' : '+ Ajouter aux fiches';
      suivre.title = suivi ? 'Toucher pour retirer ce mot des fiches' : '';
      suivre.disabled = !aDesSens && !suivi;
    }

    suivre.addEventListener('click', async () => {
      suivre.disabled = true;
      if (await Revision.estSuivi(ref)) {
        retirees = await Revision.oublier(ref);
        Outils.annoncer('« ' + e.m + ' » retiré des fiches.', async () => {
          await Revision.restaurer(retirees);
          peindre();
          document.dispatchEvent(new CustomEvent('fiches-changees'));
        });
      } else {
        await Revision.apprendre(ref, e.m);
        Outils.annoncer('« ' + e.m + ' » ajouté aux fiches de révision.');
      }
      document.dispatchEvent(new CustomEvent('fiches-changees'));
      await peindre();
      suivre.disabled = false;
    });
    peindre();
    ligne.appendChild(suivre);

    ligne.appendChild(bouton('bouton-discret', '✎ Note', () => {
      const bloc = document.getElementById('fiche-notes');
      if (!bloc) return;
      bloc.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const ajouter = bloc.querySelector('.bouton-discret');
      if (ajouter && /Ajouter/.test(ajouter.textContent)) ajouter.click();
    }));
    if (e.perso) {
      ligne.appendChild(bouton('bouton-discret', 'Modifier', () => Perso.ouvrir({ id: e.perso })));
    }
    return ligne;
  }

  function dessinerLecture(e, lecture, numero, combien) {
    const section = element('section', 'lecture');
    if (lecture.nat || combien > 1) {
      const nature = element('p', 'nature');
      nature.appendChild(element('span', null, lecture.nat || ''));
      if (combien > 1) nature.prepend(element('span', 'numero-lecture', (numero + 1) + ' '));
      section.appendChild(nature);
    }

    if (lecture.f && lecture.f.length) {
      const formes = element('p', 'formes');
      lecture.f.forEach(([graphie, libelle], i) => {
        if (i) formes.appendChild(document.createTextNode(' · '));
        if (libelle) formes.appendChild(element('span', 'forme-libelle', libelle + ' '));
        formes.appendChild(element('b', null, graphie));
      });
      section.appendChild(formes);
    }

    const liste = element('ol', 'sens-liste');
    let principal = 0;
    let secondaire = 0;
    const cachees = [];
    lecture.s.forEach((s, rang) => {
      const li = element('li', 'sens' + (s.p ? ' sous-sens' : ''));
      if (s.p) secondaire += 1; else { principal += 1; secondaire = 0; }
      li.appendChild(element('span', 'numero-sens',
        s.p ? String.fromCharCode(96 + Math.min(secondaire, 26)) + ')' : principal + '.'));
      const corps = element('div', 'sens-corps');
      if (s.r && s.r.length) corps.appendChild(etiquettes(s.r));
      const d = element('p', 'definition');
      d.appendChild(MotsVifs.texte(s.d, { exclue: e.m }));
      corps.appendChild(d);
      if (s.v && s.v.length) {
        const v = element('p', 'renvoi');
        v.appendChild(document.createTextNode('→ '));
        s.v.forEach((m, i) => { if (i) v.appendChild(document.createTextNode(', ')); v.appendChild(lien(m)); });
        corps.appendChild(v);
      }
      for (const x of s.x || []) corps.appendChild(citation(x, e.m));
      if (s.n) corps.appendChild(element('p', 'note-usage', s.n));
      li.appendChild(corps);
      if (rang >= SENS_VISIBLES) { li.hidden = true; cachees.push(li); }
      liste.appendChild(li);
    });
    section.appendChild(liste);
    if (cachees.length) {
      const plus = bouton('lien-discret voir-plus',
        'Voir ' + (cachees.length > 1 ? 'les ' + cachees.length + ' autres sens' : 'l’autre sens'), () => {
          for (const li of cachees) li.hidden = false;
          plus.remove();
        });
      section.appendChild(plus);
    }

    for (const [champ, titre] of [['syn', 'Synonymes'], ['ant', 'Contraires']]) {
      if (lecture[champ] && lecture[champ].length) section.appendChild(proches(titre, lecture[champ], champ));
    }
    for (const n of lecture.no || []) {
      const p = element('p', 'note-usage');
      p.appendChild(MotsVifs.texte(n, { exclue: e.m }));
      section.appendChild(p);
    }
    return section;
  }

  function citation(x, mot) {
    const [texte, marque, reference] = x;
    const bloc = element('blockquote', 'citation');
    const p = element('p', 'citation-texte');
    p.appendChild(MotsVifs.texte(texte, { marque, exclue: mot }));
    p.appendChild(Voix.bouton(texte, 'ecouter-phrase'));
    bloc.appendChild(p);
    if (reference) bloc.appendChild(element('p', 'citation-source', reference));
    return bloc;
  }

  /* Synonymes ou contraires, rangés par le sens auquel ils se rattachent
   * quand le Wiktionnaire le dit. */
  function proches(titre, liste, champ) {
    const bloc = element('div', 'proches ' + champ);
    bloc.appendChild(element('h4', null, titre));
    const groupes = new Map();
    for (const [mot, precision, marques] of liste) {
      const cle = precision || '';
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push([mot, marques]);
    }
    for (const [precision, mots] of groupes) {
      const ligne = element('p', 'proches-ligne');
      if (precision) ligne.appendChild(element('span', 'proches-sens', precision + ' : '));
      mots.forEach(([mot, marques], i) => {
        if (i) ligne.appendChild(document.createTextNode(', '));
        ligne.appendChild(lien(mot));
        if (marques && marques.length) ligne.appendChild(element('span', 'marque-discrete', ' (' + marques.join(', ') + ')'));
      });
      bloc.appendChild(ligne);
    }
    return bloc;
  }

  /* « Autres mots pour “argent” : pognon, thune, oseille… » — les mots
   * d'argot dont la définition dit la même chose, d'après l'index du français
   * vers l'argot. */
  function dessinerMemesSens(memes) {
    const section = rubrique('Autres mots d’argot pour le même sens', 'memes-sens');
    for (const { concept, mots, total } of memes) {
      const ligne = element('p', 'memes-ligne');
      ligne.appendChild(element('span', 'memes-concept', '« ' + concept + ' » : '));
      mots.forEach((m, i) => {
        if (i) ligne.appendChild(document.createTextNode(', '));
        ligne.appendChild(lien(m));
      });
      if (total > mots.length) {
        ligne.appendChild(document.createTextNode(' … '));
        ligne.appendChild(bouton('lien-discret', 'voir les ' + total + ' →', () => {
          fermer(false);
          App.chercherEquivalent(concept);
        }));
      }
      section.appendChild(ligne);
    }
    return section;
  }

  /* Les articles de Delvau, de Larchey et de Virmaître. */
  function dessinerAnciens(e, principal) {
    const section = rubrique(principal ? 'Dans les dictionnaires d’argot du XIXᵉ siècle'
      : 'Au XIXᵉ siècle', 'anciens' + (principal ? ' principal' : ''));
    section.appendChild(element('p', 'avertissement-ancien',
      'Textes d’époque, reproduits tels quels : ils parlent la langue — et parfois les préjugés — de leur temps.'));
    for (const bloc of e.anc) {
      const source = SOURCES_ANCIENNES[bloc.s];
      if (!source) continue;
      const cadre = element('article', 'ancien ancien-' + bloc.s);
      const titre = element('p', 'ancien-source');
      titre.appendChild(element('span', 'ancien-auteur', source.auteur.split(' ').slice(-1)[0]));
      titre.appendChild(element('span', 'ancien-titre', ' · ' + source.titre + ', ' + source.annee));
      cadre.appendChild(titre);
      for (const article of bloc.a) cadre.appendChild(dessinerArticle(article, source, e.m));
      section.appendChild(cadre);
    }
    return section;
  }

  function dessinerArticle(article, source, mot) {
    const bloc = element('div', 'ancien-article');
    const longueur = article.p.reduce((n, p) => n + p.length, 0);
    const replier = longueur > ANCIEN_REPLIE && article.p.length > 1;
    article.p.forEach((texte, i) => {
      const p = element('p', 'ancien-texte');
      if (i === 0) {
        p.appendChild(element('span', 'ancien-vedette', article.v));
        if (article.nat) {
          p.appendChild(document.createTextNode(' '));
          p.appendChild(element('i', 'ancien-nature', article.nat));
        }
        p.appendChild(document.createTextNode(' '));
      }
      p.appendChild(MotsVifs.texteRiche(texte, { exclue: mot }));
      if (replier && i > 0) p.hidden = true;
      bloc.appendChild(p);
    });
    if (replier) {
      const plus = bouton('lien-discret voir-plus', 'Lire la suite de l’article', () => {
        for (const p of bloc.querySelectorAll('.ancien-texte')) p.hidden = false;
        plus.remove();
      });
      bloc.appendChild(plus);
    }
    const notes = [];
    if (article.sup) notes.push('au ' + source.supplement);
    if (article.n) notes.push('expression donnée pour nouvelle en 1894');
    if (article.cr && article.cr.length) notes.push('d’après ' + article.cr.join(' et '));
    const pied = element('p', 'ancien-pied');
    for (const m of article.mil || []) pied.appendChild(element('span', 'marque milieu', m));
    if (notes.length) pied.appendChild(element('span', 'discret', notes.join(' · ')));
    if (pied.childNodes.length) bloc.appendChild(pied);
    return bloc;
  }

  /* Expressions, proverbes : une ligne chacune, avec leur sens quand il est
   * donné. */
  function listeLiee(titre, liste, classe) {
    const section = rubrique(titre, classe);
    const ul = element('ul', 'liste-liee');
    const VISIBLES = 12;
    const cachees = [];
    liste.forEach(([mot, precision, marques], i) => {
      const li = element('li');
      li.appendChild(lien(mot));
      if (precision) li.appendChild(element('span', 'precision', ' — ' + precision));
      if (marques && marques.length) li.appendChild(element('span', 'marque-discrete', ' (' + marques.join(', ') + ')'));
      if (i >= VISIBLES) { li.hidden = true; cachees.push(li); }
      ul.appendChild(li);
    });
    section.appendChild(ul);
    if (cachees.length) {
      const plus = bouton('lien-discret voir-plus', 'Voir les ' + cachees.length + ' autres', () => {
        for (const li of cachees) li.hidden = false;
        plus.remove();
      });
      section.appendChild(plus);
    }
    return section;
  }

  function nuage(titre, liste) {
    const section = rubrique(titre, 'nuage');
    const bloc = element('div', 'voisins');
    for (const [mot] of liste.slice(0, 40)) bloc.appendChild(lien(mot, 'voisin'));
    section.appendChild(bloc);
    return section;
  }

  function source(e) {
    const p = element('p', 'source');
    if (e.perso) {
      const m = Perso.lire(e.perso);
      p.textContent = m ? 'Mot ajouté par vous le ' + Outils.dateLisible(m.cree)
        + (m.modifie !== m.cree ? ', modifié le ' + Outils.dateLisible(m.modifie) : '') + '.' : '';
      return p;
    }
    const morceaux = [];
    if (lecturesVisibles(e).length) {
      const a = element('a', null, 'Wiktionnaire, article « ' + e.m + ' »');
      a.href = 'https://fr.wiktionary.org/wiki/' + encodeURIComponent(e.m.replace(/ /g, '_'));
      a.rel = 'noopener';
      a.target = '_blank';
      morceaux.push([a, ' — licence CC BY-SA 4.0']);
    }
    for (const bloc of e.anc || []) {
      const s = SOURCES_ANCIENNES[bloc.s];
      if (!s) continue;
      const a = element('a', null, s.auteur + ', ' + s.titre + ' (' + s.annee + ')');
      a.href = s.lien;
      a.rel = 'noopener';
      a.target = '_blank';
      morceaux.push([a, ' — domaine public']);
    }
    p.appendChild(document.createTextNode('Sources : '));
    morceaux.forEach(([a, suite], i) => {
      if (i) p.appendChild(document.createTextNode(' ; '));
      p.appendChild(a);
      p.appendChild(document.createTextNode(suite));
    });
    if (!e.x && e.b !== Lexique.ANCIEN && !e.sp) p.appendChild(document.createTextNode('. Fréquence : Lexique 3.83.'));
    else p.appendChild(document.createTextNode('.'));
    return p;
  }

  racine.Fiche = {
    ouvrir, fermer,
    get ouverte() { return !!panneau && !panneau.hidden; },
    get entree() { return entreeAffichee; },
  };

})(window);
