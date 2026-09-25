'use strict';
/*
 * Les mots vifs : tout mot d'une définition ou d'une citation mène à sa fiche.
 *
 * Un dictionnaire se lit en sautant de mot en mot — on cherche « pusillanime »,
 * on lit « qui manque de courage, de caractère », et c'est peut-être
 * « caractère » qu'on voulait vraiment. Chaque mot affiché qui a sa fiche au
 * dictionnaire devient donc touchable ; les formes fléchies mènent à leur
 * lemme (« chevaux » à « cheval »).
 *
 * Jamais de lien mort : un mot absent du dictionnaire reste du texte. Et le
 * mot de la fiche elle-même n'est pas un lien vers sa propre fiche.
 *
 * Un seul écouteur, délégué sur le document : une fiche de « faire » compte
 * des milliers de mots, pas des milliers d'écouteurs.
 */
(function (racine) {

  // Un mot : des lettres, éventuellement liées par des traits d'union
  // (« porte-monnaie »). L'apostrophe coupe : « l’outil » → « l’ » + « outil ».
  const MOT = /[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*/gu;

  /* Résout un mot du texte en vedette, ou rien. Un composé à trait d'union
   * absent du dictionnaire n'est pas découpé : « vas-y » n'est ni « vas » ni
   * « y ».
   *
   * Dans un dictionnaire d'argot, presque tout le texte est en français
   * courant : « des forces de l'ordre » ne doit pas mener aux sens argotiques
   * de « des » ou de « force ». Ne deviennent donc vifs que les mots d'argot —
   * pas les mots-outils, ni les mots courants qui ont aussi un sens d'argot. */
  function cible(graphie, exclue) {
    if (graphie.length < 2) return null;
    if (Lexique.MOTS_OUTILS.has(Lexique.cle(graphie))) return null;
    const r = Lexique.resoudre(graphie);
    if (!r || r.mot === exclue || r.courant) return null;
    return r.mot;
  }

  function ajouterTexte(parent, texte, exclue) {
    let dernier = 0;
    MOT.lastIndex = 0;
    let trouve;
    while ((trouve = MOT.exec(texte))) {
      const v = cible(trouve[0], exclue);
      if (!v) continue;
      if (trouve.index > dernier) parent.appendChild(document.createTextNode(texte.slice(dernier, trouve.index)));
      const span = document.createElement('span');
      span.className = 'mv';
      span.dataset.v = v;
      span.textContent = trouve[0];
      parent.appendChild(span);
      dernier = trouve.index + trouve[0].length;
    }
    if (dernier < texte.length) parent.appendChild(document.createTextNode(texte.slice(dernier)));
  }

  /* Le texte, avec ses mots vifs, et la marque éventuelle — le mot vedette
   * dans une citation, `[début, fin]` — mise en évidence. */
  function texte(chaine, options) {
    const opts = options || {};
    const fragment = document.createDocumentFragment();
    if (!chaine) return fragment;
    const marque = opts.marque;
    const vif = opts.vif !== false && Lexique.taille() > 0;
    const poser = (parent, morceau) => {
      if (vif) ajouterTexte(parent, morceau, opts.exclue);
      else parent.appendChild(document.createTextNode(morceau));
    };
    if (marque && marque[0] >= 0 && marque[1] <= chaine.length && marque[0] < marque[1]) {
      poser(fragment, chaine.slice(0, marque[0]));
      const m = document.createElement('mark');
      m.className = 'cible';
      m.textContent = chaine.slice(marque[0], marque[1]);
      fragment.appendChild(m);
      poser(fragment, chaine.slice(marque[1]));
    } else {
      poser(fragment, chaine);
    }
    return fragment;
  }

  /* Un texte des dictionnaires anciens, dont l'italique est noté `_…_` : les
   * auteurs y mettent les mots cités et les exemples. Chaque morceau garde ses
   * mots vifs. */
  function texteRiche(chaine, options) {
    const fragment = document.createDocumentFragment();
    if (!chaine) return fragment;
    const morceaux = String(chaine).split(/_([^_]+)_/);
    morceaux.forEach((morceau, i) => {
      if (!morceau) return;
      if (i % 2) {
        const italique = document.createElement('i');
        italique.appendChild(texte(morceau, options));
        fragment.appendChild(italique);
      } else {
        fragment.appendChild(texte(morceau, options));
      }
    });
    return fragment;
  }

  document.addEventListener('click', (e) => {
    const span = e.target.closest && e.target.closest('.mv');
    if (!span || !span.dataset.v) return;
    e.preventDefault();
    Fiche.ouvrir({ mot: span.dataset.v });
  });

  racine.MotsVifs = { texte, texteRiche };

})(window);
