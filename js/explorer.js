'use strict';
/*
 * L'onglet Explorer : l'argot par milieu, par époque, par région.
 *
 * Un dictionnaire d'argot ne se lit pas seulement mot par mot : on veut
 * savoir comment parlaient les poilus, les typographes, les voleurs de 1880,
 * ou ce que disent les forums d'aujourd'hui. Les thèmes sont calculés à la
 * construction (build/construire.py, THEMES) d'après les marques du
 * Wiktionnaire et les milieux que nomment Delvau, Larchey et Virmaître.
 *
 * La liste des thèmes et leurs effectifs viennent du manifeste, lu au
 * démarrage : la grille s'affiche d'emblée. Les listes de mots, elles, sont
 * dans data/dico/themes.json, lu au premier thème ouvert.
 */
(function (racine) {

  const { element, bouton } = Outils;
  const PAR_PAGE = 60;

  let manifeste = null;
  let e = {};
  let courant = null;          // { theme, ordre, position }

  function brancher(options) {
    manifeste = options.manifeste;
    e = {
      accueil: document.getElementById('explorer-accueil'),
      grille: document.getElementById('liste-themes'),
      vue: document.getElementById('explorer-theme'),
      titre: document.getElementById('theme-titre'),
      description: document.getElementById('theme-description'),
      ordre: document.getElementById('theme-ordre'),
      mots: document.getElementById('theme-mots'),
      plus: document.getElementById('theme-plus'),
      retour: document.getElementById('b-themes-retour'),
    };
    e.retour.addEventListener('click', () => montrerAccueil());
    e.plus.addEventListener('click', () => page());
    e.ordre.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b || !courant) return;
      courant.ordre = b.dataset.ordre;
      dessinerTheme();
    });
  }

  function themes() {
    return (manifeste && manifeste.themes) || [];
  }

  function nomDuTheme(id) {
    const t = themes().find((x) => x.id === id);
    return t ? t.nom : '';
  }

  // ── La grille ─────────────────────────────────────────────────────────────

  function carte(t, compacte) {
    const b = bouton(compacte ? 'theme-pastille' : 'carte-theme', '', () => ouvrirTheme(t.id));
    b.appendChild(element('span', 'carte-theme-nom', t.nom));
    b.appendChild(element('span', 'carte-theme-nombre', t.n.toLocaleString('fr-FR')
      + (compacte ? '' : (t.n > 1 ? ' mots' : ' mot'))));
    return b;
  }

  function dessinerGrille() {
    if (e.grille.childElementCount) return;
    for (const t of themes()) {
      const c = carte(t, false);
      if (t.desc) c.appendChild(element('span', 'carte-theme-desc', t.desc));
      e.grille.appendChild(c);
    }
  }

  /* Quelques thèmes sur l'accueil de la recherche, pour qu'on sache que
   * l'onglet existe. */
  function dessinerApercu(zone) {
    zone.textContent = '';
    const liste = themes();
    if (!liste.length) { zone.hidden = true; return; }
    zone.appendChild(element('h3', 'rubrique', 'Explorer par thème'));
    const bloc = element('div', 'voisins');
    for (const t of liste.filter((x) => ['verlan', 'internet', 'armee', 'pegre', 'quebec', 'ancien']
      .indexOf(x.id) !== -1)) {
      bloc.appendChild(carte(t, true));
    }
    bloc.appendChild(bouton('theme-pastille tous', 'Tous les thèmes →', () => App.basculer('explorer')));
    zone.appendChild(bloc);
    zone.hidden = false;
  }

  function montrerAccueil() {
    courant = null;
    e.vue.hidden = true;
    e.accueil.hidden = false;
    dessinerGrille();
    racine.scrollTo(0, 0);
  }

  // ── Un thème ──────────────────────────────────────────────────────────────

  async function ouvrirTheme(id) {
    if (racine.App && document.getElementById('vue-explorer').hidden) App.basculer('explorer', { garder: true });
    e.accueil.hidden = true;
    e.vue.hidden = false;
    e.titre.textContent = nomDuTheme(id) || '…';
    e.description.textContent = '';
    e.mots.textContent = '';
    e.plus.hidden = true;
    e.mots.appendChild(element('li', 'discret attente', 'Ouverture…'));
    racine.scrollTo(0, 0);
    let liste;
    try {
      liste = await Lexique.themes();
    } catch (erreur) {
      e.mots.textContent = '';
      e.mots.appendChild(element('li', 'discret', 'Les thèmes n’ont pas pu être lus : '
        + (erreur && erreur.message ? erreur.message : erreur)));
      return;
    }
    const theme = liste.find((t) => t.id === id);
    if (!theme) { montrerAccueil(); return; }
    courant = { theme, ordre: 'usage', position: 0 };
    dessinerTheme();
  }

  function motsDans(ordre) {
    const mots = courant.theme.mots;
    if (ordre !== 'alpha') return mots;
    return mots.slice().sort((a, b) => Lexique.cle(a).localeCompare(Lexique.cle(b), 'fr'));
  }

  function dessinerTheme() {
    const t = courant.theme;
    e.titre.textContent = t.nom;
    e.description.textContent = t.desc + ' — ' + t.mots.length.toLocaleString('fr-FR')
      + (t.mots.length > 1 ? ' mots et expressions.' : ' mot.');
    for (const b of e.ordre.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.ordre === courant.ordre));
    }
    courant.liste = motsDans(courant.ordre);
    courant.position = 0;
    e.mots.textContent = '';
    page();
  }

  function ligne(mot) {
    const r = Lexique.vedette(mot);
    const li = element('li');
    const b = bouton('resultat', '', () => Fiche.ouvrir({ mot }));
    const tete = element('span', 'resultat-tete');
    tete.appendChild(element('span', 'mot', mot));
    if (r && r.nature) tete.appendChild(element('span', 'nature-courte', r.nature));
    if (r && r.ancien) tete.appendChild(element('span', 'pastille xixe', 'XIXᵉ'));
    b.appendChild(tete);
    if (r && r.apercu) b.appendChild(element('span', 'apercu', r.apercu));
    li.appendChild(b);
    return li;
  }

  function page() {
    if (!courant) return;
    const fin = Math.min(courant.liste.length, courant.position + PAR_PAGE);
    for (let i = courant.position; i < fin; i += 1) e.mots.appendChild(ligne(courant.liste[i]));
    courant.position = fin;
    const reste = courant.liste.length - fin;
    e.plus.hidden = reste <= 0;
    e.plus.textContent = 'Voir plus (' + reste.toLocaleString('fr-FR') + ')';
  }

  /* Appelé quand on arrive sur l'onglet par la barre : la grille, sauf si un
   * thème vient d'être demandé. */
  function montrer(options) {
    if (options && options.garder) return;
    montrerAccueil();
  }

  racine.Explorer = { brancher, montrer, ouvrirTheme, nomDuTheme, dessinerApercu, themes };

})(window);
