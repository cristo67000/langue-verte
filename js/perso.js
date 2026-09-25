'use strict';
/*
 * « Mes mots » — les mots qu'on entre soi-même.
 *
 * Le dictionnaire a ses trous : un mot régional, un terme de métier, un
 * néologisme, un mot rencontré dans un livre et que le Wiktionnaire ignore. Et
 * parfois on veut sa propre définition, avec ses propres exemples. Un mot à soi
 * a la même forme qu'une fiche du dictionnaire — sens et exemples, étymologie,
 * synonymes et contraires, expressions — et se révise de la même façon.
 *
 * ── Ce qui le distingue d'une entrée du dictionnaire ────────────────────────
 *
 * Son identité ne dépend pas de son orthographe : `p-` suivi d'un tirage au
 * hasard, fixé à la création. Corriger « chaffouin » en « chafouin » garde ses
 * fiches de révision et sa note. Il vit dans IndexedDB, pas dans le cache :
 * une mise à jour du dictionnaire ne peut pas l'emporter.
 *
 * Un mot à soi qui s'écrit comme une vedette du dictionnaire est permis : ce
 * sont deux fiches distinctes, et la recherche montre les deux.
 */
(function (racine) {

  const { element, bouton } = Outils;
  const SENS_MAX = 12;
  const LISTE_MAX = 40;

  let mots = [];               // en mémoire : la recherche est synchrone

  async function charger() {
    try { mots = await Store.tousLesMotsPerso(); } catch (e) { mots = []; }
    return mots;
  }

  function tous() {
    return mots.slice().sort((a, b) => a.cle.localeCompare(b.cle, 'fr'));
  }

  function lire(id) {
    return mots.find((m) => m.id === id) || null;
  }

  function nouvelIdentifiant() {
    const hasard = new Uint32Array(2);
    crypto.getRandomValues(hasard);
    return 'p-' + hasard[0].toString(36) + hasard[1].toString(36).slice(0, 4);
  }

  function propre(texte, max) {
    return String(texte || '').replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '').trim().slice(0, max || 1000);
  }

  /* « calme, sérénité ; paix » → ['calme', 'sérénité', 'paix']. */
  function enListe(texte) {
    return String(texte || '').split(/[,;\n]+/).map((m) => propre(m, 80)).filter(Boolean)
      .slice(0, LISTE_MAX);
  }

  /* « à tâtons — sans y voir » → { e: 'à tâtons', d: 'sans y voir' }. */
  function enExpressions(texte) {
    return String(texte || '').split('\n').map((ligne) => {
      const [e, ...reste] = ligne.split(/\s+[—–:-]\s+|\s*[—–:]\s*/);
      return { e: propre(e, 120), d: propre(reste.join(' — '), 300) };
    }).filter((x) => x.e).slice(0, LISTE_MAX);
  }

  async function enregistrer(donnees) {
    const t = Date.now();
    const ancien = donnees.id ? lire(donnees.id) : null;
    const mot = {
      id: ancien ? ancien.id : nouvelIdentifiant(),
      mot: propre(donnees.mot, 120),
      nature: propre(donnees.nature, 60),
      api: propre(donnees.api, 80).replace(/^[\\/[]+|[\\/\]]+$/g, ''),
      sens: (donnees.sens || []).map((s) => ({
        d: propre(s.d, 1000), x: propre(s.x, 600), r: propre(s.r, 60),
      })).filter((s) => s.d || s.x).slice(0, SENS_MAX),
      etymologie: propre(donnees.etymologie, 3000),
      synonymes: enListe(donnees.synonymes),
      contraires: enListe(donnees.contraires),
      expressions: enExpressions(donnees.expressions),
      cree: ancien ? ancien.cree : t,
      modifie: t,
    };
    mot.cle = Lexique.cle(mot.mot);
    await Store.ecrireMotPerso(mot);
    mots = mots.filter((m) => m.id !== mot.id).concat([mot]);
    if (ancien && ancien.mot !== mot.mot) {
      await Revision.renommer('perso:' + mot.id, mot.mot);
      await Notes.renommer('perso:' + mot.id, mot.mot);
    }
    document.dispatchEvent(new CustomEvent('perso-change'));
    return mot;
  }

  /* Supprime le mot, ses fiches et sa note, et rend de quoi tout remettre. */
  async function supprimer(id) {
    const mot = lire(id);
    if (!mot) return null;
    const ref = 'perso:' + id;
    const cartes = await Revision.oublier(ref);
    const note = await Notes.lire(ref);
    if (note) await Notes.supprimer(ref);
    await Store.supprimerMotPerso(id);
    mots = mots.filter((m) => m.id !== id);
    document.dispatchEvent(new CustomEvent('perso-change'));
    return { mot, cartes, note };
  }

  async function restaurer(sauvegarde) {
    if (!sauvegarde) return;
    await Store.ecrireMotPerso(sauvegarde.mot);
    mots = mots.filter((m) => m.id !== sauvegarde.mot.id).concat([sauvegarde.mot]);
    await Revision.restaurer(sauvegarde.cartes || []);
    if (sauvegarde.note) await Store.ecrireNote(sauvegarde.note);
    document.dispatchEvent(new CustomEvent('perso-change'));
    document.dispatchEvent(new CustomEvent('notes-changees'));
  }

  /* Les mots à soi dont la clé commence par la saisie, ou dont un mot
   * intérieur commence ainsi — au même format que les résultats du
   * dictionnaire. */
  function chercher(k, limite) {
    const sortie = [];
    for (const m of mots) {
      const debut = m.cle.startsWith(k);
      const interieur = !debut && m.cle.split(/[\s'\-]+/).some((j) => j.startsWith(k));
      if (!debut && !interieur) continue;
      sortie.push(resultat(m, m.cle === k));
      if (sortie.length >= limite) break;
    }
    return sortie;
  }

  function resultat(m, exact) {
    const premier = (m.sens.find((s) => s.d) || {}).d || '';
    return {
      mot: m.mot, cle: m.cle, perso: m.id, bande: 0, tranche: -1,
      nature: m.nature ? abreger(m.nature) : '',
      apercu: premier.length > 44 ? premier.slice(0, 44).replace(/\s+\S*$/, '') + '…' : premier,
      expression: m.mot.indexOf(' ') !== -1,
      exact: !!exact,
    };
  }

  function abreger(nature) {
    const table = [['nom masculin', 'n. m.'], ['nom féminin', 'n. f.'], ['nom', 'n.'],
      ['adjectif', 'adj.'], ['verbe', 'v.'], ['adverbe', 'adv.'], ['expression', 'expr.'],
      ['locution', 'loc.']];
    const n = nature.toLowerCase();
    for (const [long_, court] of table) if (n.startsWith(long_)) return court;
    return n.split(' ')[0].slice(0, 8);
  }

  /* Un mot à soi, mis dans la forme d'une entrée du dictionnaire : la fiche,
   * la séance et les exercices n'ont ainsi qu'un seul format à connaître. */
  function enEntree(m) {
    const lecture = {
      nat: m.nature || '',
      s: m.sens.filter((s) => s.d || s.x).map((s) => {
        const sens = { d: s.d || '' };
        if (s.r) sens.r = [s.r];
        if (s.x) sens.x = [[s.x, marquer(s.x, m.mot)]];
        return sens;
      }),
    };
    if (m.api) lecture.api = m.api;
    if (m.synonymes.length) lecture.syn = m.synonymes.map((w) => [w]);
    if (m.contraires.length) lecture.ant = m.contraires.map((w) => [w]);
    const entree = { m: m.mot, perso: m.id, b: null, l: [lecture] };
    if (m.etymologie) {
      entree.et = [[m.etymologie]];
      lecture.e = 0;
    }
    if (m.expressions.length) entree.loc = m.expressions.map((x) => (x.d ? [x.e, x.d] : [x.e]));
    return entree;
  }

  /* Repère le mot dans son exemple, pour le souligner et pour la phrase à
   * trou : la vedette telle quelle, sinon un mot qui commence comme elle
   * (« chafouins » pour « chafouin »). */
  function marquer(texte, mot) {
    const k = Lexique.cle(mot);
    if (!k || k.indexOf(' ') !== -1) {
      const i = Lexique.cle(texte).indexOf(k);
      return i >= 0 && k ? [i, i + k.length] : null;
    }
    const motif = /[\p{L}\p{M}'’-]+/gu;
    let trouve;
    while ((trouve = motif.exec(texte))) {
      const kk = Lexique.cle(trouve[0]);
      if (kk === k || (kk.startsWith(k.slice(0, Math.max(3, k.length - 2))) && kk.length - k.length <= 3)) {
        return [trouve.index, trouve.index + trouve[0].length];
      }
    }
    return null;
  }

  /* De quoi préremplir le formulaire depuis une fiche du dictionnaire. */
  function depuisEntree(e) {
    const sens = [];
    for (const l of e.l) {
      for (const s of l.s) {
        if (sens.length >= 6) break;
        sens.push({ d: s.d, x: s.x && s.x[0] ? s.x[0][0] : '', r: (s.r || []).join(', ') });
      }
    }
    const l0 = e.l[0] || {};
    const liste = (champ) => e.l.flatMap((l) => (l[champ] || []).map((x) => x[0]))
      .filter((w, i, t) => t.indexOf(w) === i).slice(0, 15).join(', ');
    return {
      mot: e.m,
      nature: l0.nat || '',
      api: l0.api || '',
      sens,
      etymologie: e.et && e.et[0] ? e.et[0].join('\n\n') : '',
      synonymes: liste('syn'),
      contraires: liste('ant'),
      expressions: (e.loc || []).slice(0, 12).map((x) => (x[1] ? x[0] + ' — ' + x[1] : x[0])).join('\n'),
    };
  }

  // ── Le formulaire ─────────────────────────────────────────────────────────

  const NATURES = ['', 'nom masculin', 'nom féminin', 'nom masculin et féminin', 'adjectif',
    'verbe', 'adverbe', 'expression', 'locution', 'interjection', 'autre'];

  let panneau = null;
  let apresEnregistrement = null;

  function champ(etiquette, controle, aide) {
    const bloc = element('label', 'champ');
    bloc.appendChild(element('span', 'champ-titre', etiquette));
    bloc.appendChild(controle);
    if (aide) bloc.appendChild(element('span', 'champ-aide', aide));
    return bloc;
  }

  function saisie(valeur, attributs) {
    const i = element('input', 'saisie-texte');
    i.type = 'text';
    i.value = valeur || '';
    i.autocomplete = 'off';
    Object.assign(i, attributs || {});
    return i;
  }

  function zone(valeur, lignes) {
    const z = element('textarea', 'saisie-texte');
    z.rows = lignes || 3;
    z.value = valeur || '';
    return z;
  }

  /* Ouvre le formulaire : `existant` pour modifier un mot à soi, `graphie`
   * pour en créer un à partir d'une recherche restée vaine. */
  function ouvrir(options) {
    const opts = options || {};
    panneau = document.getElementById('panneau-perso');
    const conteneur = document.getElementById('formulaire-perso');
    conteneur.textContent = '';
    apresEnregistrement = opts.apres || null;
    const existant = opts.id ? lire(opts.id) : null;
    const depart = existant ? JSON.parse(JSON.stringify(existant)) : (opts.depart || {
      mot: opts.graphie || '', sens: [{ d: '', x: '', r: '' }],
    });
    if (!depart.sens || !depart.sens.length) depart.sens = [{ d: '', x: '', r: '' }];
    const texteDe = (v) => (Array.isArray(v) ? v.join(', ') : (v || ''));
    const texteExpressions = (v) => (Array.isArray(v)
      ? v.map((x) => (x.d ? x.e + ' — ' + x.d : x.e)).join('\n') : (v || ''));

    const tete = element('div', 'fiche-tete');
    tete.appendChild(element('span', 'espace'));
    tete.appendChild(bouton('fiche-fermer', 'Fermer', fermer));
    conteneur.appendChild(tete);
    conteneur.appendChild(element('h2', null, existant ? 'Modifier mon mot' : 'Nouveau mot'));
    conteneur.appendChild(element('p', 'discret',
      'Seul le mot est obligatoire. Une définition au moins permet d’en faire une fiche de révision.'));

    const formulaire = element('form', 'formulaire');
    formulaire.noValidate = true;
    const champMot = saisie(depart.mot, { required: true, maxLength: 120 });
    champMot.setAttribute('autocapitalize', 'off');
    formulaire.appendChild(champ('Mot ou expression', champMot));

    const avis = element('div', 'avis-dico');
    formulaire.appendChild(avis);
    function verifierDico() {
      avis.textContent = '';
      const r = Lexique.vedette(champMot.value.trim()) || null;
      if (!r || existant) return;
      avis.appendChild(element('span', null, '« ' + r.mot + ' » est déjà dans le dictionnaire. '));
      avis.appendChild(bouton('lien-discret', 'Ouvrir sa fiche', () => {
        fermer();
        Fiche.ouvrir({ mot: r.mot });
      }));
      avis.appendChild(bouton('lien-discret', 'Partir de sa fiche', async () => {
        const e = await Lexique.entree(r.mot).catch(() => null);
        if (e) ouvrir({ depart: depuisEntree(e), apres: apresEnregistrement });
      }));
    }
    champMot.addEventListener('input', verifierDico);

    const choixNature = element('select', 'saisie-texte');
    const natures = NATURES.slice();
    if (depart.nature && natures.indexOf(depart.nature) === -1) natures.splice(1, 0, depart.nature);
    for (const n of natures) {
      const o = element('option', null, n || '—');
      o.value = n;
      if (n === (depart.nature || '')) o.selected = true;
      choixNature.appendChild(o);
    }
    formulaire.appendChild(champ('Nature', choixNature));
    const champApi = saisie(depart.api, { maxLength: 80, placeholder: 'ʃa.fwɛ̃' });
    formulaire.appendChild(champ('Prononciation (API, facultatif)', champApi));

    // Les sens : autant de blocs que l'on veut, chacun avec son exemple.
    const blocSens = element('fieldset', 'sens-perso');
    blocSens.appendChild(element('legend', null, 'Sens et cas d’usage'));
    const listeSens = element('div');
    blocSens.appendChild(listeSens);
    function ajouterSens(s) {
      const bloc = element('div', 'un-sens');
      const numero = element('span', 'numero-sens', '');
      bloc.appendChild(numero);
      const d = zone(s.d, 2);
      d.placeholder = 'Définition';
      d.className += ' sens-d';
      const x = zone(s.x, 2);
      x.placeholder = 'Exemple, cas d’usage';
      x.className += ' sens-x';
      const r = saisie(s.r, { maxLength: 60, placeholder: 'Registre, milieu (argot, verlan, familier…)' });
      r.className += ' sens-r';
      bloc.appendChild(d);
      bloc.appendChild(x);
      bloc.appendChild(r);
      bloc.appendChild(bouton('lien-discret retirer-sens', 'Retirer ce sens', () => {
        bloc.remove();
        renumeroter();
      }));
      listeSens.appendChild(bloc);
      renumeroter();
    }
    function renumeroter() {
      const blocs = listeSens.querySelectorAll('.un-sens');
      blocs.forEach((b, i) => {
        b.querySelector('.numero-sens').textContent = (i + 1) + '.';
        b.querySelector('.retirer-sens').hidden = blocs.length < 2;
      });
      boutonSens.hidden = blocs.length >= SENS_MAX;
    }
    const boutonSens = bouton('bouton-discret', '+ Ajouter un sens', () => ajouterSens({}));
    blocSens.appendChild(boutonSens);
    for (const s of depart.sens) ajouterSens(s);
    formulaire.appendChild(blocSens);

    const champEtym = zone(depart.etymologie, 3);
    formulaire.appendChild(champ('Étymologie', champEtym));
    const champSyn = zone(texteDe(depart.synonymes), 2);
    formulaire.appendChild(champ('Synonymes', champSyn, 'Séparés par des virgules.'));
    const champAnt = zone(texteDe(depart.contraires), 2);
    formulaire.appendChild(champ('Contraires', champAnt, 'Séparés par des virgules.'));
    const champExpr = zone(texteExpressions(depart.expressions), 3);
    formulaire.appendChild(champ('Expressions et locutions', champExpr,
      'Une par ligne, suivie si vous voulez d’un tiret et de son sens : « à tâtons — sans y voir ».'));

    const erreur = element('p', 'erreur', '');
    erreur.hidden = true;
    formulaire.appendChild(erreur);

    const pied = element('div', 'ligne-boutons pied-formulaire');
    const valider = element('button', 'bouton-principal', 'Enregistrer');
    valider.type = 'submit';
    pied.appendChild(valider);
    pied.appendChild(bouton('bouton-discret', 'Annuler', fermer));
    formulaire.appendChild(pied);

    if (existant) {
      formulaire.appendChild(bouton('lien-discret supprimer-mot', 'Supprimer ce mot', async () => {
        const sauvegarde = await supprimer(existant.id);
        fermer();
        if (racine.Fiche) Fiche.fermer();
        Outils.annoncer('« ' + existant.mot + ' » supprimé.', () => restaurer(sauvegarde));
      }));
    }

    formulaire.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mot = champMot.value.trim();
      if (!mot) {
        erreur.textContent = 'Il faut au moins le mot.';
        erreur.hidden = false;
        champMot.focus();
        return;
      }
      valider.disabled = true;
      const sens = Array.from(listeSens.querySelectorAll('.un-sens')).map((b) => ({
        d: b.querySelector('.sens-d').value,
        x: b.querySelector('.sens-x').value,
        r: b.querySelector('.sens-r').value,
      }));
      try {
        const enregistre = await enregistrer({
          id: existant ? existant.id : null,
          mot, nature: choixNature.value, api: champApi.value, sens,
          etymologie: champEtym.value, synonymes: champSyn.value,
          contraires: champAnt.value, expressions: champExpr.value,
        });
        fermer();
        if (apresEnregistrement) apresEnregistrement(enregistre);
        else if (racine.Fiche) Fiche.ouvrir({ perso: enregistre.id });
      } catch (err) {
        erreur.textContent = 'L’enregistrement a échoué : ' + (err && err.message ? err.message : err);
        erreur.hidden = false;
        valider.disabled = false;
      }
    });

    conteneur.appendChild(formulaire);
    panneau.hidden = false;
    panneau.scrollTop = 0;
    document.body.classList.add('panneau-ouvert');
    verifierDico();
    if (!depart.mot) champMot.focus();
  }

  function fermer() {
    if (!panneau) return;
    panneau.hidden = true;
    document.body.classList.remove('panneau-ouvert');
  }

  function estOuvert() {
    return !!panneau && !panneau.hidden;
  }

  racine.Perso = {
    charger, tous, lire, enregistrer, supprimer, restaurer, chercher, resultat,
    enEntree, depuisEntree, marquer, ouvrir, fermer, estOuvert,
  };

})(window);
