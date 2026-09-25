/*
 * Épreuves du cœur de l'application, sans navigateur.
 *
 * Les modules de js/ sont chargés tels quels dans un contexte `vm`, avec les
 * index réels de data/dico/ : on éprouve donc la vraie recherche sur le vrai
 * dictionnaire — formes fléchies, accents facultatifs, expressions par mot,
 * recherche du français vers l'argot —, les entrées des trois sortes (argot du
 * Wiktionnaire, mot courant qui a un sens d'argot, mot des seuls anciens), la
 * correction des réponses et le calendrier de révision.
 *
 *   node build/essais.mjs
 *   node build/essais.mjs --cles < cas.json   (appelé par verifier.py : rend les clés)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf-8');

const contexte = {
  console, Date, Math, JSON, Promise, Set, Map, Int32Array, Uint32Array, RegExp, String, Number,
  Array, Object, Error, TypeError, setTimeout, clearTimeout,
  document: { addEventListener() {}, dispatchEvent() {}, getElementById() { return null; } },
  CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
  crypto: globalThis.crypto,
  fetch: async (chemin) => ({ ok: true, text: async () => lire(chemin), json: async () => JSON.parse(lire(chemin)) }),
};
contexte.window = contexte;
vm.createContext(contexte);
for (const module of ['js/outils.js', 'js/lexique.js', 'js/revision.js', 'js/exercices.js']) {
  vm.runInContext(lire(module), contexte, { filename: module });
}
const { Lexique, Revision, Exercices } = contexte;

if (process.argv[2] === '--cles') {
  // Les cas arrivent par l'entrée standard : 5 000 vedettes ne tiennent pas
  // sur une ligne de commande Windows.
  const cas = JSON.parse(readFileSync(0, 'utf-8'));
  process.stdout.write(JSON.stringify(cas.map((c) => Lexique.cle(c))));
  process.exit(0);
}

const manifeste = JSON.parse(lire('data/manifeste.json'));
await Lexique.charger(manifeste);

let total = 0;
let fautes = 0;
function cas(libelle, condition, detail) {
  total += 1;
  if (!condition) fautes += 1;
  console.log((condition ? '  ok   ' : '  NON  ') + libelle + (!condition && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''));
}
const mots = (liste) => liste.map((r) => r.mot);

// ── La recherche ────────────────────────────────────────────────────────────
console.log('Recherche');
let r = Lexique.chercher('flics');
cas('« flics » → flic en tête', r[0] && r[0].mot === 'flic' && r[0].via === 'flics', mots(r).slice(0, 3));
r = Lexique.chercher('keufs');
cas('« keufs » → keuf', mots(r).includes('keuf'), mots(r).slice(0, 4));
r = Lexique.chercher('chelou');
cas('« chelou » exact, rang 0', r[0] && r[0].mot === 'chelou' && r[0].rang === 0, mots(r).slice(0, 3));
r = Lexique.chercher('chelous');
cas('« chelous » → chelou', mots(r).includes('chelou'), mots(r).slice(0, 3));
r = Lexique.chercher('tele');
cas('« tele » → télé (accents facultatifs)', mots(r).includes('télé'), mots(r).slice(0, 5));
r = Lexique.chercher('bagnole');
cas('« bagnole » exact', r[0] && r[0].mot === 'bagnole', mots(r).slice(0, 3));
r = Lexique.chercher('tr');
cas('« tr » : des mots courants d’abord', r.length > 10 && r.slice(0, 5).every((x) => x.bande <= 2),
  r.slice(0, 5).map((x) => x.mot + ':' + x.bande));
r = Lexique.chercher('abadie');
cas('« abadie » est au dictionnaire', mots(r).includes('abadie'), mots(r).slice(0, 3));
cas('résoudre « flics » dans un texte → flic', (Lexique.resoudre('flics') || {}).mot === 'flic');
cas('un mot absent reste muet', Lexique.resoudre('zzzxq') === null);

console.log('Expressions');
let x = mots(Lexique.expressionsPour('pipe'));
cas('« pipe » → casser sa pipe', x.includes('casser sa pipe'), x.slice(0, 8));
x = mots(Lexique.expressionsPour('jambes cou'));
cas('« jambes cou » → prendre ses jambes à son cou', x.includes('prendre ses jambes à son cou'), x);
x = mots(Lexique.expressionsPour('de'));
cas('« de » seul ne ratisse rien (mot-outil)', x.length === 0, x.length);

console.log('Du français vers l’argot');
let eq = Lexique.equivalents('argent');
cas('« argent » → fric et pognon', eq && mots(eq.resultats).includes('fric') && mots(eq.resultats).includes('pognon'),
  eq && mots(eq.resultats).slice(0, 10));
eq = Lexique.equivalents('policier');
cas('« policier » → flic', eq && mots(eq.resultats).includes('flic'), eq && mots(eq.resultats).slice(0, 10));
eq = Lexique.equivalents('tête');
cas('« tête » (avec accent) → tronche', eq && mots(eq.resultats).includes('tronche'), eq && mots(eq.resultats).slice(0, 12));
eq = Lexique.equivalents('voitures');
cas('« voitures » (pluriel) → bagnole', eq && mots(eq.resultats).includes('bagnole'), eq && eq.mot);
eq = Lexique.equivalents('prison');
const premierAncien = eq ? eq.resultats.findIndex((x) => x.ancien) : -1;
cas('« prison » : les mots d’aujourd’hui avant ceux du XIXᵉ siècle', eq
  && (premierAncien === -1 || eq.resultats.slice(premierAncien).every((x) => x.ancien)),
  eq && eq.resultats.map((x) => x.mot + (x.ancien ? '*' : '')).slice(0, 20));
cas('« zzzxq » → rien', Lexique.equivalents('zzzxq') === null);
const memes = Lexique.memesSens('fric');
cas('« fric » : même sens que pognon', memes.some((m) => m.mots.includes('pognon')), memes.map((m) => m.concept));

console.log('Entrées');
const flic = await Lexique.entree('flic');
cas('« flic » : étymologie et citations repérées', flic && flic.et && flic.l[0].s[0].x && flic.l[0].s[0].x[0][1]);
cas('« flic » : tout d’argot, pas de sens courant', flic && !flic.sc);
const cheval = await Lexique.entree('cheval');
cas('« cheval » : seulement l’argot, et le sens courant rappelé, qui vient d’abord', cheval && cheval.sc
  && cheval.sp && cheval.l.every((l) => l.s.every((s) => !/mammifère/.test(s.d))), cheval && cheval.l[0].s.map((s) => s.d));
cas('« cheval » : pas de dérivés du cheval animal', cheval && !cheval.der && !cheval.rel);
cas('« cheval » : le mot français de l’index s’écrit « héroïne »',
  Lexique.memesSens('cheval').some((m) => m.concept === 'héroïne'), Lexique.memesSens('cheval').map((m) => m.concept));
const lance = await Lexique.entree('lance');
cas('« lance » : un mot courant (l’arme) qui a un sens d’argot', lance && lance.sp && lance.sc);
const taule = await Lexique.entree('taule');
cas('« taule » : d’abord de l’argot — la table de l’enclume n’est qu’un autre sens', taule && !taule.sp,
  taule && { sc: taule.sc, sp: taule.sp });
cas('« taule » dans l’index : pas un mot courant', !Lexique.vedette('taule').courant);
const femme = Lexique.vedette('femme');
cas('« femme » : argot ancien et mot courant à la fois (jamais un mot vif)', femme && femme.ancien && femme.courant,
  femme);
cas('« cheval » : l’article ancien de Larchey', cheval && (cheval.anc || []).some((b) => b.s === 'larchey'));
const abadie = await Lexique.entree('abadie');
cas('« abadie » : l’article de Delvau', abadie && (abadie.anc || []).some((b) => b.s === 'delvau'));
const ancien = mots(Lexique.chercher('abat-reluit')).includes('abat-reluit') ? await Lexique.entree('abat-reluit') : null;
cas('« abat-reluit » : mot des seuls anciens, lecture cachée, bande 4', ancien && ancien.b === 4
  && ancien.l[0].o === 1 && ancien.l[0].s[0].d, ancien && ancien.l);
const pipe = await Lexique.entree('casser sa pipe');
cas('« casser sa pipe » : une expression', pipe && pipe.x === 1);
const themes = await Lexique.themes();
cas('les thèmes : verlan contient « chelou »', themes.find((t) => t.id === 'verlan').mots.includes('chelou'));

// ── La correction ───────────────────────────────────────────────────────────
console.log('Correction');
const c = Exercices.corriger;
cas('juste', c('pognon', 'pognon').verdict === 'juste');
cas('majuscule indifférente', c('Pognon', 'pognon').verdict === 'juste');
cas('accents oubliés → presque', c('tele', 'télé').verdict === 'presque');
cas('une lettre de travers, mot long → presque', c('bagnol', 'bagnole').verdict === 'presque');
cas('une lettre de travers, mot court → faux', c('keuf', 'meuf').verdict === 'faux');
cas('le lemme pour la forme → presque', c('flic', 'flics', 'flic').verdict === 'presque');
cas('autre mot → faux', c('fric', 'pognon').verdict === 'faux');
cas('apostrophe typographique ou droite', c("s'la péter", 's’la péter').verdict === 'juste');
cas('vide → faux', c('  ', 'fric').verdict === 'faux');
cas('masquer : « flic » cache « flicard »', !/flicard/.test(Exercices.masquer('Policier, flicard.', 'flic')));
cas('indice d’une expression', Exercices.indice('casser sa pipe') === 'c… s… p… (3 mots)', Exercices.indice('casser sa pipe'));
cas('fric et pognon ne se leurrent pas (même sens)', Exercices.partagentUnSens('fric', 'pognon'));
cas('fric et bagnole peuvent se leurrer', !Exercices.partagentUnSens('fric', 'bagnole'));

// ── Le calendrier ───────────────────────────────────────────────────────────
console.log('Calendrier');
const JOUR = Revision.JOUR;
const t0 = Date.UTC(2026, 8, 25, 8, 0, 0);
let carte = Revision.neuve('dico:flic', 'flic', 'def');
carte = Revision.juger(carte, Revision.CORRECT, t0);
cas('neuve + juste → 10 minutes', carte.etat === 'apprentissage' && carte.echeance - t0 === 10 * 60000);
carte = Revision.juger(carte, Revision.CORRECT, t0 + 11 * 60000);
cas('puis juste → lendemain', carte.etat === 'apprentissage' && carte.palier === 1);
carte = Revision.juger(carte, Revision.CORRECT, t0 + JOUR);
cas('puis juste → en révision, 1 jour', carte.etat === 'revision' && carte.intervalle === 1);
carte = Revision.juger(carte, Revision.CORRECT, t0 + 2 * JOUR);
cas('révision juste → intervalle × facilité', carte.intervalle === 3, carte.intervalle);
const avant = carte.intervalle;
carte = Revision.juger(carte, Revision.RATE, t0 + 5 * JOUR);
cas('ratée → apprentissage, facilité rabotée', carte.etat === 'apprentissage' && carte.facilite < Revision.FACILITE_INITIALE);
cas('ratée → intervalle divisé, pas remis à zéro', carte.intervalle === Math.max(1, Math.round(avant * 0.3)));
const facile = Revision.juger(Revision.neuve('dico:x', 'x', 'mot'), Revision.FACILE, t0);
cas('neuve + facile → révision à 4 jours', facile.etat === 'revision' && facile.intervalle === 4);
const longue = Object.assign(Revision.neuve('dico:y', 'y', 'def'), { etat: 'revision', intervalle: 700, facilite: 2.8 });
cas('plafond de deux ans', Revision.juger(longue, Revision.FACILE, t0).intervalle === 730);
const espacees = Revision.espacer([
  { ref: 'a', id: 'a#def' }, { ref: 'a', id: 'a#mot' }, { ref: 'b', id: 'b#def' }, { ref: 'b', id: 'b#mot' },
]);
cas('les deux fiches d’un mot ne se suivent pas', espacees.every((f, i) => i === 0 || f.ref !== espacees[i - 1].ref),
  espacees.map((f) => f.id));

console.log(`\n${total - fautes}/${total} cas conformes`);
process.exit(fautes ? 1 : 0);
