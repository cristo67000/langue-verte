'use strict';
/*
 * Sauvegarde : tout ce qui est à soi, dans un fichier, et retour.
 *
 * Rien ne quitte l'appareil de lui-même ; c'est précisément pourquoi il faut
 * un moyen de tout emporter en changeant de téléphone. Le fichier contient
 * les fiches de révision, le journal des réponses, les notes, les mots à soi
 * et les réglages — pas le dictionnaire, qui se retélécharge.
 *
 * ── Recharger, c'est fusionner ─────────────────────────────────────────────
 *
 * Recharger un fichier n'efface rien. Chaque élément est rapproché de celui
 * qui porte le même identifiant, et c'est le plus récent qui l'emporte : une
 * note modifiée hier sur le téléphone n'est pas écrasée par la version de la
 * semaine dernière sur la tablette. Le bilan dit ce qui a été ajouté, mis à
 * jour ou laissé tel quel.
 */
(function (racine) {

  const { element, bouton } = Outils;
  const FORMAT = 1;

  async function exporter() {
    const [cartes, journal, notes, perso, reglages] = await Promise.all([
      Store.toutesLesCartes(), Store.toutLeJournal(), Store.toutesLesNotes(),
      Store.tousLesMotsPerso(), Store.lireReglages(),
    ]);
    const donnees = {
      application: 'langue-verte',
      format: FORMAT,
      date: new Date().toISOString(),
      reglages, cartes, journal: journal.map((l) => { const c = Object.assign({}, l); delete c.id; return c; }),
      notes, perso,
    };
    const texte = JSON.stringify(donnees, null, 1);
    const fichier = new Blob([texte], { type: 'application/json' });
    const nom = 'langue-verte-' + new Date().toISOString().slice(0, 10) + '.json';
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(fichier);
    lien.download = nom;
    document.body.appendChild(lien);
    lien.click();
    setTimeout(() => { URL.revokeObjectURL(lien.href); lien.remove(); }, 1000);
    return { nom, octets: fichier.size, cartes: cartes.length, notes: notes.length, perso: perso.length };
  }

  function valide(d) {
    return d && d.application === 'langue-verte' && typeof d.format === 'number'
      && d.format <= FORMAT && Array.isArray(d.cartes);
  }

  async function fusionner(d) {
    const bilan = { ajoutes: 0, misAJour: 0, inchanges: 0, journal: 0 };

    async function unir(liste, lire, ecrire, date) {
      for (const element_ of liste || []) {
        if (!element_ || !element_.id) continue;
        const present = await lire(element_.id);
        if (!present) { await ecrire(element_); bilan.ajoutes += 1; }
        else if ((date(element_) || 0) > (date(present) || 0)) { await ecrire(element_); bilan.misAJour += 1; }
        else bilan.inchanges += 1;
      }
    }
    await unir(d.cartes, Store.lireCarte, Store.ecrireCarte, (c) => Math.max(c.vu || 0, c.cree || 0));
    await unir(d.notes, Store.lireNote, Store.ecrireNote, (n) => n.modifie);
    await unir(d.perso, Store.lireMotPerso, Store.ecrireMotPerso, (m) => m.modifie);

    // Le journal : on ajoute ce qui n'y est pas, reconnu à l'instant et à la fiche.
    const existant = new Set((await Store.toutLeJournal()).map((l) => l.quand + ' ' + l.carte));
    for (const ligne of d.journal || []) {
      if (!ligne || !ligne.quand || existant.has(ligne.quand + ' ' + ligne.carte)) continue;
      const copie = Object.assign({}, ligne);
      delete copie.id;
      await Store.noter(copie);
      bilan.journal += 1;
    }
    await Perso.charger();
    document.dispatchEvent(new CustomEvent('perso-change'));
    document.dispatchEvent(new CustomEvent('notes-changees'));
    document.dispatchEvent(new CustomEvent('fiches-changees'));
    return bilan;
  }

  function dessiner(zone) {
    zone.textContent = '';
    const ligne = element('div', 'ligne-boutons ligne-sauvegarde');
    const retour = element('p', 'discret retour-sauvegarde', '');
    ligne.appendChild(bouton('bouton-discret', 'Enregistrer dans un fichier', async () => {
      try {
        const r = await exporter();
        retour.textContent = 'Fichier « ' + r.nom + ' » ('
          + Outils.humain(r.octets) + ') : ' + Outils.nombre(r.cartes, 'fiche') + ', '
          + Outils.nombre(r.notes, 'note') + ', ' + Outils.nombre(r.perso, 'mot') + ' à vous.';
      } catch (e) {
        retour.textContent = 'L’enregistrement a échoué : ' + (e && e.message ? e.message : e);
      }
    }));
    const choix = element('input');
    choix.type = 'file';
    choix.accept = 'application/json,.json';
    choix.hidden = true;
    choix.addEventListener('change', async () => {
      const fichier = choix.files && choix.files[0];
      choix.value = '';
      if (!fichier) return;
      try {
        const d = JSON.parse(await fichier.text());
        if (!valide(d)) throw new Error('ce fichier n’est pas une sauvegarde de La Langue verte');
        const b = await fusionner(d);
        retour.textContent = 'Sauvegarde rechargée : ' + b.ajoutes + ' ajouté(s), '
          + b.misAJour + ' mis à jour, ' + b.inchanges + ' déjà à jour, '
          + b.journal + ' réponse(s) ajoutée(s) au journal.';
      } catch (e) {
        retour.textContent = 'Impossible de recharger : ' + (e && e.message ? e.message : e) + '.';
      }
    });
    ligne.appendChild(bouton('bouton-discret', 'Recharger un fichier', () => choix.click()));
    zone.appendChild(ligne);
    zone.appendChild(choix);
    zone.appendChild(retour);
  }

  racine.Sauvegarde = { exporter, fusionner, valide, dessiner };

})(window);
