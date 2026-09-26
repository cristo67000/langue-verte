'use strict';
/*
 * L'interface : onglets, recherche, accueil, réglages.
 *
 * La recherche est synchrone. Chercher un début de mot parmi 28 000 vedettes
 * est une dichotomie — une quinzaine de comparaisons — et coûte moins qu'un
 * battement de cil ; ce qui coûte, c'est de dessiner la liste. Il n'y a donc
 * pas de temporisation à la frappe : les résultats suivent la touche.
 *
 * Deux recherches à la fois, dans les deux sens :
 *
 *   de l'argot    « thune » → la fiche de thune, et les mots qui commencent ainsi ;
 *   vers l'argot  « argent » → fric, pognon, thune, oseille… — les mots
 *                 d'argot que leurs définitions donnent pour « argent ».
 *
 * Sur un ordinateur, « / » place le curseur dans la recherche, les flèches
 * parcourent les résultats, Entrée ouvre, Échap referme.
 */
(function (racine) {

  const { element, bouton } = Outils;
  const $ = (id) => document.getElementById(id);
  const e = {};
  let reglages = null;
  let manifeste = null;

  // ── Onglets ───────────────────────────────────────────────────────────────

  function basculer(nom, options) {
    for (const vue of document.querySelectorAll('.vue')) vue.hidden = vue.id !== 'vue-' + nom;
    for (const b of e.onglets.querySelectorAll('button')) {
      if (b.dataset.vue === nom) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
    if (nom === 'reviser') Seance.rafraichir();
    if (nom === 'carnet') Carnet.dessiner(); else Carnet.reinitialiser();
    if (nom === 'reglages') dessinerReglages();
    if (nom === 'chercher') dessinerAccueil();
    if (nom === 'explorer') Explorer.montrer(options);
    racine.scrollTo(0, 0);
  }

  // ── Recherche ─────────────────────────────────────────────────────────────

  function ligneDeResultat(r) {
    const b = bouton('resultat', '', () => ouvrirResultat(r));
    const tete = element('span', 'resultat-tete');
    tete.appendChild(element('span', 'mot', r.mot));
    if (r.nature) tete.appendChild(element('span', 'nature-courte', r.nature));
    if (r.via) tete.appendChild(element('span', 'via', '← ' + r.via));
    if (r.perso) tete.appendChild(element('span', 'pastille perso', 'à moi'));
    if (r.ancien) tete.appendChild(element('span', 'pastille xixe', 'XIXᵉ'));
    b.appendChild(tete);
    if (r.apercu) b.appendChild(element('span', 'apercu', r.apercu));
    const li = element('li');
    li.appendChild(b);
    return li;
  }

  function ouvrirResultat(r) {
    if (r.perso) Fiche.ouvrir({ perso: r.perso });
    else Fiche.ouvrir({ mot: r.mot });
  }

  const EXPRESSIONS_VISIBLES = 8;
  const EQUIVALENTS_VISIBLES = 18;

  let derniersResultats = [];

  /* « En argot, “argent” se dit : fric, pognon, thune… » */
  function dessinerEquivalents(saisie) {
    const zone = e.equivalents;
    zone.textContent = '';
    const trouve = Lexique.equivalents(saisie, 120);
    if (!trouve) { zone.hidden = true; return null; }
    const modernes = trouve.resultats.filter((r) => !r.ancien);
    const anciens = trouve.resultats.filter((r) => r.ancien);
    const titre = element('h3', 'rubrique rubrique-equivalents');
    titre.appendChild(document.createTextNode('En argot, « ' + trouve.mot + ' » se dit'));
    zone.appendChild(titre);
    const bloc = element('div', 'voisins');
    const ajouter = (liste, depart, fin) => {
      for (const r of liste.slice(depart, fin)) {
        const b = bouton('voisin' + (r.ancien ? ' xixe' : ''), r.mot, () => ouvrirResultat(r));
        b.title = r.apercu || '';
        bloc.appendChild(b);
      }
    };
    const tous = modernes.concat(anciens);
    ajouter(tous, 0, EQUIVALENTS_VISIBLES);
    zone.appendChild(bloc);
    if (tous.length > EQUIVALENTS_VISIBLES) {
      const plus = bouton('lien-discret voir-plus', 'Voir les ' + tous.length + ' mots'
        + (anciens.length ? ' (dont ' + anciens.length + ' du XIXᵉ siècle)' : ''), () => {
        ajouter(tous, EQUIVALENTS_VISIBLES, tous.length);
        plus.remove();
      });
      zone.appendChild(plus);
    }
    zone.hidden = false;
    return trouve;
  }

  function rechercher() {
    const saisie = e.q.value;
    e.qVider.hidden = !saisie;
    const vide = !saisie.trim();
    e.accueil.hidden = !vide;
    e.resultats.textContent = '';
    e.expressions.textContent = '';
    if (vide) {
      e.resultats.hidden = true;
      e.expressions.hidden = true;
      e.equivalents.hidden = true;
      e.rien.hidden = true;
      e.ajouter.hidden = true;
      derniersResultats = [];
      return;
    }
    const equivalents = dessinerEquivalents(saisie);
    const resultats = Lexique.chercher(saisie, 30);
    derniersResultats = resultats;
    const vus = new Set(resultats.map((r) => r.mot));
    const expressions = Lexique.expressionsPour(saisie, 300).filter((r) => !vus.has(r.mot));

    e.resultats.hidden = !resultats.length;
    for (const r of resultats) e.resultats.appendChild(ligneDeResultat(r));

    e.expressions.hidden = !expressions.length;
    if (expressions.length) {
      e.expressions.appendChild(element('h3', 'rubrique', 'Expressions ('
        + expressions.length + ')'));
      const liste = element('ul', 'liste-resultats');
      expressions.slice(0, EXPRESSIONS_VISIBLES).forEach((r) => liste.appendChild(ligneDeResultat(r)));
      e.expressions.appendChild(liste);
      if (expressions.length > EXPRESSIONS_VISIBLES) {
        let position = EXPRESSIONS_VISIBLES;
        const plus = bouton('lien-discret voir-plus', '', () => {
          expressions.slice(position, position + 30).forEach((r) => liste.appendChild(ligneDeResultat(r)));
          position += 30;
          if (position >= expressions.length) plus.remove();
          else plus.textContent = 'Voir plus (' + (expressions.length - position) + ')';
        });
        plus.textContent = 'Voir plus (' + (expressions.length - position) + ')';
        e.expressions.appendChild(plus);
      }
    }

    const rien = !resultats.length && !expressions.length && !equivalents;
    e.rien.hidden = !rien;
    if (rien) {
      e.rienConseil.textContent = 'Vérifiez l’orthographe — les accents sont facultatifs : « chelou » ou « chélou ». '
        + 'L’argot s’écrit souvent de plusieurs façons. S’il manque au dictionnaire, entrez-le vous-même dans votre carnet.';
    }
    const exact = resultats.some((r) => r.rang === 0);
    e.ajouter.hidden = exact;
    e.ajouter.textContent = '+ Entrer « ' + saisie.trim() + ' » dans mon carnet';
  }

  /* Depuis une fiche : « les 42 mots pour “argent” ». */
  function chercherEquivalent(mot) {
    basculer('chercher');
    e.q.value = mot;
    rechercher();
  }

  // ── Accueil ───────────────────────────────────────────────────────────────

  function numeroDuJour(n) {
    const d = new Date();
    const jours = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    // Un pas premier avec la longueur de la liste : on la parcourt en entier
    // avant de retomber sur le même mot, sans suivre l'ordre alphabétique.
    return (jours * 7919) % n;
  }

  async function dessinerDuJour() {
    const liste = manifeste && manifeste.du_jour;
    const bloc = e.duJour;
    if (!liste || !liste.length) { bloc.hidden = true; return; }
    const mot = liste[numeroDuJour(liste.length)];
    const entree = await Lexique.entree(mot).catch(() => null);
    if (!entree) { bloc.hidden = true; return; }
    bloc.textContent = '';
    bloc.appendChild(element('p', 'du-jour-titre', 'Le mot d’argot du jour'));
    const tete = element('p', 'du-jour-mot');
    tete.appendChild(element('span', null, entree.m));
    tete.appendChild(element('span', 'nature-courte', entree.l[0].nat));
    bloc.appendChild(tete);
    const x = Exercices.premierSens(entree, false);
    if (x) bloc.appendChild(element('p', 'du-jour-def', Exercices.court(x.s.d, 180)));
    if (x && x.s.x && x.s.x[0] && x.s.x[0][0].length < 200) {
      const exemple = element('p', 'du-jour-exemple');
      exemple.appendChild(MotsVifs.texte(x.s.x[0][0], { marque: x.s.x[0][1], vif: false }));
      bloc.appendChild(exemple);
    }
    if (entree.et && entree.et[0]) {
      const phrase = entree.et[0][0].split(/(?<=\.)\s/)[0];
      bloc.appendChild(element('p', 'du-jour-etym', Exercices.court(phrase, 160)));
    }
    bloc.appendChild(bouton('lien-discret', 'Ouvrir la fiche →', () => Fiche.ouvrir({ mot: entree.m })));
    bloc.onclick = (ev) => { if (!ev.target.closest('button')) Fiche.ouvrir({ mot: entree.m }); };
    bloc.hidden = false;
  }

  async function dessinerRecents() {
    const zone = e.recents;
    zone.textContent = '';
    const lignes = await Store.historique().catch(() => []);
    if (!lignes.length) return;
    zone.appendChild(element('h3', 'rubrique', 'Consultés récemment'));
    const bloc = element('div', 'voisins');
    for (const l of lignes.slice(0, 14)) {
      bloc.appendChild(bouton('voisin', l.mot, () => (l.ref.startsWith('perso:')
        ? Fiche.ouvrir({ perso: l.ref.slice(6) }) : Fiche.ouvrir({ mot: l.ref.slice(5) }))));
    }
    zone.appendChild(bloc);
  }

  /* Quatre mots et une expression, tirés des listes du manifeste : courants,
   * et jamais grossiers — l'accueil ne met rien de tel sous les yeux de qui
   * n'a rien demandé. */
  function dessinerSuggestions() {
    const zone = e.suggestions;
    if (zone.childElementCount) return;
    const s = (manifeste && manifeste.suggestions) || { mots: [], expressions: [] };
    const tires = Outils.melanger(s.mots).slice(0, 4).concat(Outils.melanger(s.expressions).slice(0, 1));
    for (const mot of tires) {
      if (!Lexique.vedette(mot)) continue;
      zone.appendChild(bouton('suggestion', mot, () => Fiche.ouvrir({ mot })));
    }
  }

  function dessinerAccueil() {
    dessinerDuJour();
    dessinerRecents();
    Explorer.dessinerApercu(e.accueilThemes);
    dessinerSuggestions();
    peindreHorsLigne(Paquets.dernierEtat);
  }

  function peindreHorsLigne(detail) {
    const p = e.horsLigne;
    if (!detail || detail.fini || detail.supprime || !detail.total) { p.hidden = true; return; }
    const part = Math.round(100 * detail.faits / detail.total);
    if (detail.enCours) {
      p.textContent = 'Dictionnaire en cours de téléchargement pour le hors-ligne : ' + part + ' %.';
    } else if (detail.erreur) {
      p.textContent = 'Téléchargement du dictionnaire interrompu (' + part + ' %) — il reprendra au prochain lancement.';
    } else {
      p.hidden = true;
      return;
    }
    p.hidden = false;
  }

  // ── Réglages ──────────────────────────────────────────────────────────────

  function peindreSegments(conteneur, attribut, valeur) {
    for (const b of conteneur.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset[attribut] === valeur));
    }
  }

  async function regler(cle, valeur) {
    reglages[cle] = valeur;
    await Store.ecrireReglage(cle, valeur).catch(() => {});
    if (cle === 'sensDesFiches') Revision.sensDesFiches = valeur;
    if (cle === 'voix' || cle === 'voixFr') Voix.regler(reglages);
    Seance.regler(reglages);
  }

  async function dessinerDictionnaire() {
    const m = manifeste;
    const d = m.dico;
    e.etatDico.textContent = d.mots.toLocaleString('fr-FR') + ' mots et '
      + d.expressions.toLocaleString('fr-FR') + ' expressions, dont '
      + d.anciens_seuls.toLocaleString('fr-FR') + ' que seuls donnent les dictionnaires du XIXᵉ siècle — '
      + 'édition du ' + Outils.dateLisible(m.construit + 'T12:00:00') + '.';
    const zone = e.zoneTelechargement;
    zone.textContent = '';
    if (!('caches' in racine)) {
      zone.appendChild(element('p', 'discret', 'Ce navigateur ne permet pas de garder le dictionnaire hors ligne.'));
      return;
    }
    const etat = await Paquets.etat(m).catch(() => null);
    const ligne = element('p', 'etat-paquet');
    if (etat && etat.complet) {
      ligne.textContent = '✓ Tout le dictionnaire est sur l’appareil (' + Outils.humain(etat.octetsTotal)
        + ') : il marche sans réseau.';
    } else if (etat) {
      ligne.textContent = 'Le dictionnaire n’est pas encore entièrement sur l’appareil : il manque environ '
        + Outils.humain(etat.octetsManquants) + '.';
    }
    zone.appendChild(ligne);

    const aUneSuite = d.fichiers.suite.length > 0;
    if (aUneSuite) {
      const bascule = element('label', 'bascule');
      const case_ = element('input');
      case_.type = 'checkbox';
      case_.checked = !!reglages.toutHorsLigne;
      case_.addEventListener('change', async () => {
        await regler('toutHorsLigne', case_.checked);
        if (case_.checked) Paquets.telecharger(m).catch(() => {});
        else Paquets.arreter();
      });
      bascule.appendChild(case_);
      bascule.appendChild(element('span', null, 'Garder tout le dictionnaire hors ligne'));
      zone.appendChild(bascule);
    }

    const progres = element('div', 'progres-telechargement');
    const jauge = element('div', 'jauge');
    const barre = element('div');
    jauge.appendChild(barre);
    const texte = element('p', 'discret', '');
    const actions = element('div', 'ligne-boutons');
    progres.appendChild(jauge);
    progres.appendChild(texte);
    progres.appendChild(actions);
    zone.appendChild(progres);

    function peindre(detail) {
      actions.textContent = '';
      const enCours = Paquets.enCours;
      progres.hidden = !(enCours || (detail && (detail.erreur || detail.arrete)) || (etat && !etat.complet));
      if (detail && detail.total) {
        barre.style.width = Math.round(100 * detail.faits / detail.total) + '%';
        texte.textContent = detail.enCours
          ? 'Téléchargement : ' + detail.faits + ' fichiers sur ' + detail.total + ' (' + Outils.humain(detail.octets) + ' reçus).'
          : (detail.erreur ? 'Interrompu : ' + detail.erreur : (detail.arrete ? 'Arrêté.' : ''));
      } else {
        jauge.hidden = !enCours;
        texte.textContent = '';
      }
      if (enCours) {
        actions.appendChild(bouton('bouton-discret', 'Arrêter', () => Paquets.arreter()));
      } else if (etat && !etat.complet) {
        actions.appendChild(bouton('bouton-discret', 'Télécharger maintenant ('
          + Outils.humain(etat.octetsManquants) + ')', () => Paquets.telecharger(m).catch(() => {})));
      }
    }
    peindre(Paquets.dernierEtat);
    e.peindreTelechargement = (detail) => {
      if (detail && detail.fini) dessinerDictionnaire();
      else peindre(detail);
    };
  }

  function dessinerVoix() {
    const zone = e.zoneVoix;
    zone.textContent = '';
    e.reglageVoix.checked = reglages.voix !== false;
    if (!Voix.disponible) {
      zone.appendChild(element('p', 'discret', 'Ce navigateur ne sait pas lire à voix haute.'));
      return;
    }
    const voix = Voix.lister();
    if (!voix.length) {
      zone.appendChild(element('p', 'discret', Voix.pret
        ? 'Aucune voix française sur cet appareil : installez-en une dans les réglages de synthèse vocale du système.'
        : 'Recherche des voix de l’appareil…'));
      return;
    }
    const ligne = element('div', 'ligne-voix');
    const menu = element('select', 'saisie-texte');
    menu.setAttribute('aria-label', 'Voix');
    const nommer = (v) => v.libelle + (v.locale ? '' : ' (en ligne)');
    // Le choix automatique dit quelle voix il prend : France d'abord.
    const auto = element('option', null, 'Automatique' + (Voix.automatique ? ' : ' + nommer(Voix.automatique) : ''));
    auto.value = '';
    menu.appendChild(auto);
    for (const v of voix) {
      const o = element('option', null, nommer(v));
      o.value = v.uri;
      if (reglages.voixFr && reglages.voixFr.uri === v.uri) o.selected = true;
      menu.appendChild(o);
    }
    menu.addEventListener('change', () => {
      const v = voix.find((x) => x.uri === menu.value);
      regler('voixFr', v ? { uri: v.uri, nom: v.nom } : null);
    });
    ligne.appendChild(menu);
    ligne.appendChild(bouton('bouton-discret', 'Essayer', () => Voix.dire(Voix.PHRASE_D_ESSAI)));
    zone.appendChild(ligne);
  }

  async function dessinerReglages() {
    e.nouveautes.value = reglages.nouveautesParJour;
    peindreSegments(e.sens, 'sens', reglages.sensDesFiches);
    peindreSegments(e.mode, 'mode', reglages.mode);
    dessinerVoix();
    Sauvegarde.dessiner(e.zoneSauvegarde);
    Installer.dessiner();
    const version = (racine.MiseAJour && MiseAJour.version) || '';
    e.versions.textContent = 'Application ' + (version || 'v1.0.1') + ' · dictionnaire du '
      + Outils.dateLisible(manifeste.construit + 'T12:00:00') + '.';
    await dessinerDictionnaire();
  }

  function brancherReglages() {
    e.nouveautes.addEventListener('change', () => {
      const n = Math.max(0, Math.min(100, Math.round(Number(e.nouveautes.value) || 0)));
      e.nouveautes.value = n;
      regler('nouveautesParJour', n);
    });
    e.sens.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      regler('sensDesFiches', b.dataset.sens);
      peindreSegments(e.sens, 'sens', b.dataset.sens);
    });
    e.mode.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      regler('mode', b.dataset.mode);
      peindreSegments(e.mode, 'mode', b.dataset.mode);
    });
    e.reglageVoix.addEventListener('change', () => {
      regler('voix', e.reglageVoix.checked);
      dessinerVoix();
    });
    document.addEventListener('voix-changees', () => {
      if (!$('vue-reglages').hidden) dessinerVoix();
    });
    $('b-verifier-maj').addEventListener('click', async () => {
      const etat = $('etat-maj');
      etat.textContent = 'Vérification…';
      const r = racine.MiseAJour ? await MiseAJour.verifier(true) : 'sans-service-worker';
      etat.textContent = {
        prete: 'Une version plus récente est prête : touchez « Mettre à jour » en bas de l’écran.',
        'en-cours': 'Une version plus récente est en train d’arriver.',
        'a-jour': 'L’application est à jour.',
        echec: 'Impossible de vérifier : pas de réseau ?',
        'sans-service-worker': 'Vérification impossible dans ce navigateur.',
      }[r] || '';
    });
  }

  // ── Le clavier, sur un ordinateur ─────────────────────────────────────────

  function enSaisie(cible) {
    return cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA'
      || cible.tagName === 'SELECT' || cible.isContentEditable);
  }

  function brancherClavier() {
    document.addEventListener('keydown', (ev) => {
      if (ev.key === '/' && !enSaisie(ev.target) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        if (racine.Perso && Perso.estOuvert()) return;
        ev.preventDefault();
        if ($('vue-chercher').hidden) basculer('chercher');
        e.q.focus();
        e.q.select();
      }
    });
    // Les flèches descendent de la recherche aux résultats, et d'un résultat
    // à l'autre ; en haut de la liste, on remonte dans le champ.
    $('vue-chercher').addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      const boutons = Array.from($('vue-chercher').querySelectorAll(
        '#equivalents .voisin, #resultats .resultat, #resultats-expressions .resultat'))
        .filter((b) => b.offsetParent !== null);
      if (!boutons.length) return;
      const ici = boutons.indexOf(document.activeElement);
      if (ev.target === e.q) {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); boutons[0].focus(); }
        return;
      }
      if (ici === -1) return;
      ev.preventDefault();
      if (ev.key === 'ArrowDown' && ici < boutons.length - 1) boutons[ici + 1].focus();
      if (ev.key === 'ArrowUp') {
        if (ici > 0) boutons[ici - 1].focus();
        else e.q.focus();
      }
    });
  }

  // ── Branchement ───────────────────────────────────────────────────────────

  function brancher(options) {
    reglages = options.reglages;
    manifeste = options.manifeste;
    Object.assign(e, {
      q: $('q'), qVider: $('q-vider'), accueil: $('accueil'), resultats: $('resultats'),
      expressions: $('resultats-expressions'), equivalents: $('equivalents'), rien: $('rien'),
      rienConseil: $('rien-conseil'), ajouter: $('b-ajouter-depuis-recherche'), onglets: $('onglets'),
      duJour: $('du-jour'), recents: $('recents'), suggestions: $('suggestions'),
      accueilThemes: $('accueil-themes'), horsLigne: $('etat-hors-ligne'),
      etatDico: $('etat-dictionnaire'), zoneTelechargement: $('zone-telechargement'),
      nouveautes: $('reglage-nouveautes'), sens: $('reglage-sens'), mode: $('reglage-mode'),
      reglageVoix: $('reglage-voix'), zoneVoix: $('zone-voix'), zoneSauvegarde: $('zone-sauvegarde'),
      versions: $('apropos-versions'),
    });

    Revision.sensDesFiches = reglages.sensDesFiches;
    Voix.regler(reglages);

    e.q.addEventListener('input', rechercher);
    e.q.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && derniersResultats.length) {
        ev.preventDefault();
        e.q.blur();
        ouvrirResultat(derniersResultats[0]);
      } else if (ev.key === 'Enter') {
        const premier = e.equivalents.querySelector('.voisin');
        if (premier) { ev.preventDefault(); premier.click(); }
      }
    });
    e.qVider.addEventListener('click', () => { e.q.value = ''; rechercher(); e.q.focus(); });
    e.ajouter.addEventListener('click', () => Perso.ouvrir({ graphie: e.q.value.trim() }));
    for (const b of e.onglets.querySelectorAll('button')) {
      b.addEventListener('click', () => basculer(b.dataset.vue));
    }
    document.addEventListener('perso-change', () => { if (e.q.value) rechercher(); });
    document.addEventListener('fiche-fermee', () => {
      if (!$('vue-chercher').hidden && !e.q.value) dessinerRecents();
    });
    document.addEventListener('telechargement', (ev) => {
      peindreHorsLigne(ev.detail);
      if (e.peindreTelechargement && !$('vue-reglages').hidden) e.peindreTelechargement(ev.detail);
    });

    brancherReglages();
    brancherClavier();
    Explorer.brancher({ manifeste });
    Seance.brancher(reglages);
    Carnet.brancher();
    Installer.brancher();
    Seance.rafraichir();
    dessinerAccueil();
  }

  racine.App = { brancher, basculer, chercherEquivalent, get reglages() { return reglages; } };

})(window);
