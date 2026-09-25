'use strict';
/*
 * L'onglet Carnet : ce qui est à soi.
 *
 *   Mes mots    les mots qu'on a entrés soi-même, et le bouton pour en ajouter
 *   Mes notes   toutes les notes, la plus récente d'abord
 *   Mes fiches  les mots en révision, avec leur prochaine échéance
 *
 * Un filtre commun en tête : il cherche dans le mot, et pour les notes dans
 * leur texte aussi.
 */
(function (racine) {

  const { element, bouton } = Outils;
  let rubrique = 'mots';
  let contenu = null;
  let filtre = null;
  let onglets = null;

  function brancher() {
    contenu = document.getElementById('carnet-contenu');
    filtre = document.getElementById('carnet-filtre');
    onglets = document.getElementById('carnet-onglets');
    for (const b of onglets.querySelectorAll('button')) {
      b.addEventListener('click', () => { rubrique = b.dataset.rubrique; dessiner(); });
    }
    filtre.addEventListener('input', dessiner);
    for (const evenement of ['perso-change', 'notes-changees', 'fiches-changees']) {
      document.addEventListener(evenement, () => {
        if (!document.getElementById('vue-carnet').hidden) dessiner();
      });
    }
  }

  function correspond(...textes) {
    const k = Lexique.cle(filtre.value);
    if (!k) return true;
    return textes.some((t) => Lexique.cle(t || '').indexOf(k) !== -1);
  }

  function ouvrir(ref) {
    if (ref.startsWith('perso:')) Fiche.ouvrir({ perso: ref.slice(6) });
    else Fiche.ouvrir({ mot: ref.slice(5) });
  }

  function vide(texte) {
    contenu.appendChild(element('p', 'discret vide', texte));
  }

  async function dessiner() {
    if (!contenu) return;
    for (const b of onglets.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.rubrique === rubrique));
    }
    const courante = rubrique;
    const lignes = element('ul', 'liste-carnet');
    const tete = element('div', 'carnet-tete');
    if (courante === 'mots') await mots(lignes, tete);
    else if (courante === 'notes') await notes(lignes, tete);
    else await fiches(lignes, tete);
    if (courante !== rubrique) return;   // on a changé de rubrique pendant l'attente
    contenu.textContent = '';
    contenu.appendChild(tete);
    if (lignes.children.length) contenu.appendChild(lignes);
  }

  function ligne(titre, sous, action, extra) {
    const li = element('li');
    const b = bouton('ligne-carnet', '', action);
    b.appendChild(element('span', 'mot', titre));
    if (sous) b.appendChild(element('span', 'sous', sous));
    li.appendChild(b);
    if (extra) li.appendChild(extra);
    return li;
  }

  async function mots(lignes, tete) {
    tete.appendChild(bouton('bouton-principal', '+ Entrer un nouveau mot', () => Perso.ouvrir({})));
    const tous = Perso.tous();
    tete.appendChild(element('p', 'discret',
      tous.length ? Outils.nombre(tous.length, 'mot') + ' à vous.'
        : 'Un mot que le dictionnaire ignore, ou votre propre définition : entrez-le ici, '
          + 'avec ses sens, ses exemples, son étymologie, ses synonymes et contraires.'));
    for (const m of tous) {
      if (!correspond(m.mot)) continue;
      const premier = (m.sens.find((s) => s.d) || {}).d || '';
      lignes.appendChild(ligne(m.mot, [m.nature, premier].filter(Boolean).join(' — '),
        () => Fiche.ouvrir({ perso: m.id })));
    }
    if (tous.length && !lignes.children.length) vide('Aucun mot ne correspond au filtre.');
  }

  async function notes(lignes, tete) {
    const toutes = await Notes.toutes();
    tete.appendChild(element('p', 'discret', toutes.length
      ? Outils.nombre(toutes.length, 'note') + '.'
      : 'Aucune note encore. Ouvrez un mot et touchez « ✎ Note ».'));
    for (const n of toutes) {
      if (!correspond(n.mot, n.texte)) continue;
      const extrait = n.texte.length > 120 ? n.texte.slice(0, 120).replace(/\s+\S*$/, '') + '…' : n.texte;
      const li = ligne(n.mot, extrait, () => ouvrir(n.id));
      li.querySelector('.sous').classList.add('note-extrait');
      li.appendChild(element('span', 'date discret', Outils.dateLisible(n.modifie)));
      lignes.appendChild(li);
    }
    if (toutes.length && !lignes.children.length) vide('Aucune note ne correspond au filtre.');
  }

  async function fiches(lignes, tete) {
    const cartes = await Store.toutesLesCartes().catch(() => []);
    const parRef = new Map();
    for (const c of cartes) {
      if (!parRef.has(c.ref)) parRef.set(c.ref, []);
      parRef.get(c.ref).push(c);
    }
    tete.appendChild(element('p', 'discret', parRef.size
      ? Outils.nombre(parRef.size, 'mot') + ' en révision, ' + Outils.nombre(cartes.length, 'fiche') + '.'
      : 'Aucun mot en révision. Ouvrez un mot et touchez « Ajouter aux fiches ».'));
    const groupes = Array.from(parRef.entries()).map(([ref, liste]) => ({
      ref, liste,
      mot: liste[0].mot,
      echeance: Math.min(...liste.map((c) => (c.etat === 'nouveau' ? Infinity : c.echeance))),
      nouvelle: liste.every((c) => c.etat === 'nouveau'),
      acquise: liste.every((c) => c.etat === 'revision' && c.intervalle >= Revision.ACQUISE),
    })).sort((a, b) => a.echeance - b.echeance || a.mot.localeCompare(b.mot, 'fr'));
    for (const g of groupes) {
      if (!correspond(g.mot)) continue;
      const quand = g.nouvelle ? 'nouvelle' : Outils.echeanceLisible(g.echeance);
      const statut = g.acquise ? ' · acquise' : '';
      const retirer = bouton('lien-discret retirer', 'Retirer', async () => {
        const retirees = await Revision.oublier(g.ref);
        document.dispatchEvent(new CustomEvent('fiches-changees'));
        Outils.annoncer('« ' + g.mot + ' » retiré des fiches.', async () => {
          await Revision.restaurer(retirees);
          document.dispatchEvent(new CustomEvent('fiches-changees'));
        });
      });
      lignes.appendChild(ligne(g.mot, quand + statut, () => ouvrir(g.ref), retirer));
    }
    if (parRef.size && !lignes.children.length) vide('Aucun mot ne correspond au filtre.');
  }

  function reinitialiser() {
    if (filtre) filtre.value = '';
  }

  racine.Carnet = { brancher, dessiner, reinitialiser,
    montrer(r) { rubrique = r; dessiner(); } };

})(window);
