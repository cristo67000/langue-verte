'use strict';
/*
 * « Mes notes » — ce qu'on écrit soi-même sur un mot.
 *
 * Un moyen mnémotechnique, la phrase où l'on a rencontré le mot, une nuance
 * qu'on veut retenir : rien de cela n'appartient au dictionnaire, et tout cela
 * vaut plus, pour qui l'écrit, que la définition qu'il recopie. Une note est
 * donc rangée à part, dans son propre magasin, sous la référence du mot :
 *
 *   dico:feu        une vedette du dictionnaire
 *   perso:p-1a2b3c  un mot qu'on a entré soi-même
 *
 * Mettre à jour le dictionnaire, ou corriger l'orthographe d'un mot à soi, ne
 * touche donc à aucune note.
 *
 * Une note est affichée avec `textContent`, jamais `innerHTML` : les sauts de
 * ligne sont rendus par la feuille de style (`white-space: pre-wrap`), et rien
 * de ce qu'on tape n'est jamais interprété.
 *
 * Le bouton « Enregistrer » existe, mais la note se sauve aussi d'elle-même
 * après une seconde d'inactivité, et quand on quitte la zone de saisie :
 * perdre trois lignes tapées au téléphone parce qu'on a refermé la fiche
 * serait la seule faute impardonnable de ce module.
 */
(function (racine) {

  const { element, bouton } = Outils;
  const TEXTE_MAX = 4000;
  const REPOS = 1100;

  /* Les sauts de ligne sont gardés ; les autres signes de commande partent —
   * ils ne s'affichent pas et n'ont rien à faire dans une sauvegarde. */
  function assainir(texte) {
    if (texte === undefined || texte === null) return '';
    return String(texte)
      .replace(/\r\n?/g, '\n')
      .replace(/[\x00-\x08\x0B-\x1F\x7F\u{2028}\u{2029}]/gu, '')
      .slice(0, TEXTE_MAX)
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  async function lire(ref) {
    if (!ref) return null;
    try { return (await Store.lireNote(ref)) || null; } catch (e) { return null; }
  }

  /* Écrit, ou efface si le texte est vide : une note vide n'est pas une note. */
  async function ecrire(ref, mot, texte) {
    if (!ref) return null;
    const propre = assainir(texte);
    if (!propre) {
      await Store.supprimerNote(ref).catch(() => {});
      return null;
    }
    const ancienne = await lire(ref);
    const t = Date.now();
    const note = {
      id: ref,
      mot: mot || (ancienne && ancienne.mot) || '',
      texte: propre,
      cree: (ancienne && ancienne.cree) || t,
      modifie: t,
    };
    await Store.ecrireNote(note);
    document.dispatchEvent(new CustomEvent('notes-changees'));
    return note;
  }

  async function supprimer(ref) {
    await Store.supprimerNote(ref).catch(() => {});
    document.dispatchEvent(new CustomEvent('notes-changees'));
  }

  async function renommer(ref, mot) {
    const note = await lire(ref);
    if (note && note.mot !== mot) await Store.ecrireNote(Object.assign(note, { mot }));
  }

  async function toutes() {
    const liste = await Store.toutesLesNotes().catch(() => []);
    return liste.sort((a, b) => b.modifie - a.modifie);
  }

  // ── Le bloc « Mes notes » d'une fiche ─────────────────────────────────────

  /* Trois états : vide (un bouton), écriture (une zone de saisie), lue (le
   * texte, « Modifier », « Supprimer »). Le bloc se redessine tout seul. */
  function construire(ref, mot) {
    const section = element('section', 'mes-notes');
    const titre = element('h3', 'rubrique', 'Mes notes');
    section.appendChild(titre);
    const corps = element('div', 'note-corps');
    section.appendChild(corps);

    let note = null;
    let effacee = null;
    let minuterie = null;

    function vider() { corps.textContent = ''; }

    function dessinerVide() {
      vider();
      if (effacee) {
        const ligne = element('p', 'note-retrait');
        ligne.appendChild(element('span', null, 'Note supprimée. '));
        ligne.appendChild(bouton('lien-discret', 'Annuler', async () => {
          await Store.ecrireNote(effacee).catch(() => {});
          note = effacee;
          effacee = null;
          document.dispatchEvent(new CustomEvent('notes-changees'));
          dessinerLue();
        }));
        corps.appendChild(ligne);
      } else {
        corps.appendChild(element('p', 'discret',
          'Un moyen de s’en souvenir, la phrase où vous l’avez croisé, une nuance à retenir…'));
      }
      corps.appendChild(bouton('bouton-discret', '✎ Ajouter une note', () => dessinerEcriture('')));
    }

    function dessinerLue() {
      vider();
      corps.appendChild(element('p', 'note-texte', note.texte));
      const ligne = element('div', 'ligne-boutons');
      ligne.appendChild(bouton('bouton-discret', 'Modifier', () => dessinerEcriture(note.texte)));
      ligne.appendChild(bouton('lien-discret', 'Supprimer', async () => {
        effacee = note;
        note = null;
        await supprimer(ref);
        dessinerVide();
      }));
      corps.appendChild(ligne);
    }

    function dessinerEcriture(valeur) {
      vider();
      effacee = null;
      const zone = element('textarea', 'note-saisie');
      zone.value = valeur || '';
      zone.rows = 4;
      zone.maxLength = TEXTE_MAX;
      zone.setAttribute('aria-label', 'Ma note sur « ' + mot + ' »');
      zone.placeholder = 'Ma note…';
      corps.appendChild(zone);
      const ligne = element('div', 'ligne-boutons');
      const enregistrer = bouton('bouton-principal', 'Enregistrer');
      const annuler = bouton('bouton-discret', 'Annuler');
      ligne.appendChild(enregistrer);
      ligne.appendChild(annuler);
      corps.appendChild(ligne);
      const etat = element('span', 'note-etat discret', '');
      corps.appendChild(etat);

      async function sauver(silencieux) {
        if (minuterie) { clearTimeout(minuterie); minuterie = null; }
        note = await ecrire(ref, mot, zone.value);
        if (silencieux) {
          etat.textContent = note ? 'Enregistrée.' : '';
          return;
        }
        if (note) dessinerLue(); else dessinerVide();
      }

      zone.addEventListener('input', () => {
        if (minuterie) clearTimeout(minuterie);
        etat.textContent = '';
        minuterie = setTimeout(() => sauver(true), REPOS);
      });
      zone.addEventListener('blur', () => { if (zone.isConnected) sauver(true); });
      enregistrer.addEventListener('click', () => sauver(false));
      annuler.addEventListener('click', () => {
        if (minuterie) { clearTimeout(minuterie); minuterie = null; }
        if (note) dessinerLue(); else dessinerVide();
      });
      zone.focus();
    }

    lire(ref).then((trouvee) => {
      note = trouvee;
      if (note) dessinerLue(); else dessinerVide();
    }).catch(() => dessinerVide());

    return section;
  }

  /* Le rappel d'une note pendant une révision — seulement après la réponse :
   * une note contient souvent le moyen de retrouver le mot, c'est-à-dire la
   * réponse elle-même. */
  async function rappel(ref) {
    const note = await lire(ref);
    if (!note || !note.texte) return null;
    const bloc = element('div', 'rappel-note');
    bloc.appendChild(element('span', 'rappel-note-titre', 'Ma note'));
    bloc.appendChild(element('p', 'note-texte', note.texte));
    return bloc;
  }

  racine.Notes = { assainir, lire, ecrire, supprimer, renommer, toutes, construire, rappel, TEXTE_MAX };

})(window);
