/*
 * Recette visuelle : l'application au format téléphone puis ordinateur,
 * écran par écran.
 *
 * Lance un Chrome sans affichage sur un profil neuf, ouvre l'application
 * servie en local, joue un parcours — chercher un mot d'argot, chercher un mot
 * français, ouvrir des fiches des trois sortes, les ajouter aux fiches de
 * révision, écrire une note, explorer un thème, réviser, entrer un mot à
 * soi — et enregistre une capture à chaque étape. Les erreurs de la page sont
 * relevées : une seule fait échouer la recette.
 *
 *   node build/captures.mjs [adresse] [dossier-de-sortie]
 *
 * Par défaut : http://localhost:8146/ et build/captures/.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { lancerChrome, fermerChrome, ouvrirOnglet } from './pilote_chrome.mjs';

const ADRESSE = process.argv[2] || 'http://localhost:8146/';
const SORTIE = process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'captures');
mkdirSync(SORTIE, { recursive: true });

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = await lancerChrome({ port: 9336 });
let echecs = 0;
try {
  const onglet = await ouvrirOnglet(chrome, 'about:blank');
  const { envoyer, evaluer } = onglet;
  await envoyer('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await onglet.naviguer(ADRESSE);
  const pret = async () => {
    for (let i = 0; i < 80; i += 1) {
      if (await evaluer('return window.Lexique && Lexique.taille() > 0 && document.getElementById("demarrage").hidden').catch(() => false)) return;
      await pause(250);
    }
  };
  await pret();
  await pause(800);

  let n = 0;
  async function capture(nom) {
    n += 1;
    const { data } = await envoyer('Page.captureScreenshot', { format: 'png' });
    const fichier = path.join(SORTIE, String(n).padStart(2, '0') + '-' + nom + '.png');
    writeFileSync(fichier, Buffer.from(data, 'base64'));
    console.log('  capture', path.basename(fichier));
  }
  async function taper(texte) {
    await evaluer(`const q = document.getElementById('q'); q.value = ${JSON.stringify(texte)};
      q.dispatchEvent(new Event('input')); return true;`);
    await pause(300);
  }
  async function verifier(libelle, expression) {
    const ok = await evaluer('return !!(' + expression + ')').catch((e) => { console.log(e.message); return false; });
    console.log((ok ? '  ok   ' : '  NON  ') + libelle);
    if (!ok) echecs += 1;
  }
  async function ouvrirFiche(mot) {
    await evaluer(`Fiche.ouvrir({mot: ${JSON.stringify(mot)}}); return true;`);
    for (let i = 0; i < 100; i += 1) {
      if (await evaluer(`const h = document.querySelector('#fiche .vedette-mot'); return !!h && h.textContent === ${JSON.stringify(mot)}`)) break;
      await pause(150);
    }
    await pause(300);
  }

  // ── Téléphone ──────────────────────────────────────────────────────────
  await capture('accueil');
  await verifier('mot du jour affiché', "!document.getElementById('du-jour').hidden");
  await verifier('thèmes sur l’accueil', "document.querySelectorAll('#accueil-themes .theme-pastille').length >= 5");

  await taper('flics');
  await verifier('« flics » mène à « flic » en tête', "document.querySelector('#resultats .mot').textContent === 'flic'");
  await capture('recherche-forme');

  await taper('argent');
  await verifier('« argent » : les mots d’argot qui le disent',
    "[...document.querySelectorAll('#equivalents .voisin')].some(x => x.textContent === 'fric')");
  await capture('recherche-francais-argot');

  await taper('pipe');
  await verifier('« pipe » trouve « casser sa pipe »',
    "[...document.querySelectorAll('#resultats-expressions .mot, #resultats .mot')].some(x => x.textContent === 'casser sa pipe') || document.querySelector('#resultats-expressions .voir-plus')");

  const debutFiche = Date.now();
  await ouvrirFiche('flic');
  console.log('  (fiche « flic » affichée en ' + ((Date.now() - debutFiche) / 1000).toFixed(1) + ' s)');
  await verifier('fiche « flic » : sens et marques', "document.querySelectorAll('#fiche .sens').length >= 1 && document.querySelector('#fiche .marque.argot')");
  await verifier('fiche « flic » : étymologie', "document.querySelector('#fiche .etymologie-texte')");
  await verifier('fiche « flic » : autres mots pour le même sens', "document.querySelector('#fiche .memes-sens .lie')");
  await capture('fiche-flic');
  await evaluer("document.querySelector('#fiche .memes-sens').scrollIntoView(); return true;");
  await pause(300);
  await capture('fiche-flic-memes-sens');

  // Un mot vif mène à sa fiche, et « ← flic » ramène.
  await evaluer("const b = document.querySelector('#fiche .memes-sens .lie'); b.click(); return true;");
  await pause(1000);
  await verifier('un mot lié ouvre sa fiche, avec retour', "document.querySelector('#fiche .fiche-retour')");
  await evaluer("history.back(); return true;");
  await pause(1000);
  await verifier('le retour ramène à « flic »', "document.querySelector('#fiche .vedette-mot').textContent === 'flic'");

  await evaluer("document.querySelector('#fiche .apprendre').click(); return true;");
  await pause(600);
  await verifier('« flic » ajouté aux fiches', "document.querySelector('#fiche .apprendre').classList.contains('suivi')");
  await evaluer("document.querySelector('#fiche-notes .bouton-discret').click(); return true;");
  await pause(300);
  await evaluer(`const z = document.querySelector('#fiche-notes textarea');
    z.value = 'Flic, keuf, poulet, condé : penser aux mouches, les espions du XIVᵉ siècle.';
    z.dispatchEvent(new Event('input')); document.querySelector('#fiche-notes .bouton-principal').click(); return true;`);
  await pause(600);
  await verifier('note enregistrée', "document.querySelector('#fiche-notes .note-texte')");

  await ouvrirFiche('cheval');
  await verifier('fiche « cheval » : le sens courant rappelé', "document.querySelector('#fiche .sens-courant')");
  await verifier('fiche « cheval » : Larchey', "document.querySelector('#fiche .ancien-larchey')");
  await capture('fiche-cheval');
  await evaluer("document.querySelector('#fiche .anciens').scrollIntoView(); return true;");
  await pause(300);
  await capture('fiche-cheval-anciens');

  await ouvrirFiche('abat-reluit');
  await verifier('fiche « abat-reluit » : mot des seuls anciens', "document.querySelector('#fiche .anciens.principal') && !document.querySelector('#fiche .lecture')");
  await capture('fiche-ancienne');

  for (const mot of ['pognon', 'chelou', 'casser sa pipe', 'bagnole', 'tronche']) {
    await ouvrirFiche(mot);
    await evaluer("const b = document.querySelector('#fiche .apprendre'); if (b && !b.classList.contains('suivi')) b.click(); return true;");
    await pause(400);
  }
  await capture('fiche-chelou-ou-autre');
  await evaluer("Fiche.fermer(); return true;");
  await pause(600);

  await evaluer("App.basculer('explorer'); return true;");
  await pause(600);
  await verifier('les thèmes', "document.querySelectorAll('#liste-themes .carte-theme').length >= 12");
  await capture('explorer');
  await evaluer("Explorer.ouvrirTheme('verlan'); return true;");
  await pause(1200);
  await verifier('thème « verlan » : une liste', "document.querySelectorAll('#theme-mots .resultat').length >= 30");
  await capture('explorer-verlan');

  await evaluer("App.basculer('reviser'); return true;");
  await pause(800);
  await verifier('compteurs de révision', "document.querySelectorAll('#revision-compteurs .compteur').length === 3");
  await capture('reviser-accueil');
  await evaluer("document.getElementById('b-commencer').click(); return true;");
  await pause(1500);
  await verifier('une question est posée', "document.getElementById('seance-consigne').textContent.length > 3");
  await capture('seance-question');
  await evaluer(`const c = document.querySelector('#seance-zone .choix');
    if (c) c.click(); else { const r = document.querySelector('#seance-zone .retourner');
      if (r) r.click(); else [...document.querySelectorAll('#seance-zone button')].find(b => /sais pas/.test(b.textContent)).click(); }
    return true;`);
  await pause(900);
  await capture('seance-reponse');
  for (let i = 0; i < 160; i += 1) {
    const fini = await evaluer(`
      if (!document.getElementById('seance-bilan').hidden) return true;
      const v = document.getElementById('seance-verdict');
      if (!v.hidden) { document.querySelector('#verdict-boutons .bouton-principal').click(); return false; }
      const nb = document.querySelector('#seance-zone .note-bouton.bien'); if (nb) { nb.click(); return false; }
      const c = document.querySelector('#seance-zone .choix:not([disabled])'); if (c) { c.click(); return false; }
      const r = document.querySelector('#seance-zone .retourner'); if (r) { r.click(); return false; }
      const s = document.querySelector('#seance-zone .saisie');
      if (s && !s.disabled) { [...document.querySelectorAll('#seance-zone button')].find(b => /sais pas/.test(b.textContent)).click(); }
      return false;`);
    if (fini) break;
    await pause(600);
  }
  await verifier('bilan de séance', "!document.getElementById('seance-bilan').hidden");
  await capture('seance-bilan');

  await evaluer("App.basculer('carnet'); return true;");
  await pause(500);
  await evaluer("Perso.ouvrir({graphie: 'daronne de ouf'}); return true;");
  await pause(500);
  await evaluer(`const f = document.querySelector('#formulaire-perso form');
    f.querySelector('.sens-d').value = 'Mère formidable (entendu au lycée).';
    f.querySelector('.sens-x').value = 'Sa daronne de ouf lui a payé le concert.';
    return true;`);
  await capture('mot-perso-formulaire');
  await evaluer("document.querySelector('#formulaire-perso .pied-formulaire .bouton-principal').click(); return true;");
  await pause(1200);
  await verifier('le mot à soi a sa fiche', "document.querySelector('#fiche .vedette-mot') && document.querySelector('#fiche .vedette-mot').textContent === 'daronne de ouf'");
  await evaluer("Fiche.fermer(); return true;");
  await pause(500);
  await evaluer("Carnet.montrer('notes'); return true;");
  await pause(500);
  await verifier('la note figure au carnet', "document.querySelector('#carnet-contenu .note-extrait')");
  await capture('carnet-notes');

  await evaluer("App.basculer('reglages'); return true;");
  await pause(1200);
  await capture('reglages');

  // ── Ordinateur ─────────────────────────────────────────────────────────
  await envoyer('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluer("App.basculer('chercher'); return true;");
  await pause(600);
  await capture('ordinateur-accueil');
  await taper('prison');
  await ouvrirFiche('taule');
  await verifier('ordinateur : la liste reste visible à côté de la fiche',
    "(() => { const f = document.getElementById('fiche').getBoundingClientRect(); const l = document.getElementById('equivalents').getBoundingClientRect(); return f.left > l.right - 1 && l.width > 200; })()");
  await capture('ordinateur-recherche-et-fiche');
  await evaluer("Fiche.fermer(); return true;");
  await pause(400);
  await evaluer("App.basculer('explorer'); return true;");
  await pause(600);
  await capture('ordinateur-explorer');

  if (onglet.erreurs.length) {
    console.log('Erreurs de la page :');
    for (const e of onglet.erreurs) console.log('   ', e);
    echecs += onglet.erreurs.length;
  }
  onglet.fermer();
} finally {
  await fermerChrome(chrome);
}
console.log(echecs ? echecs + ' échec(s)' : 'Recette sans échec.');
process.exit(echecs ? 1 : 0);
