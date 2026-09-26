'use strict';
/*
 * Service worker.
 *
 * Deux sortes de fichiers, deux caches, deux traitements :
 *
 *   la coquille   HTML, CSS, JavaScript, icônes, manifeste des données —
 *                 cache d'abord, depuis le cache de **cette** version et de
 *                 lui seul, installé tout ou rien. Une version suivante se
 *                 prépare dans un autre cache et ne prend la main qu'au feu
 *                 vert de `js/miseajour.js`, quand la personne a accepté le
 *                 bandeau. Une page ne reçoit ainsi jamais qu'un jeu complet
 *                 d'une seule version.
 *
 *   les données   data/dico/… — cache d'abord, dans un cache nommé d'après la
 *                 construction des données (`langue-verte-donnees-<format>-<mouture>`,
 *                 la mouture étant la date et une empreinte du contenu)
 *                 et non d'après la version de l'application : une correction
 *                 du code ne fait pas retélécharger le dictionnaire.
 *
 * À l'installation, les index et le socle — aujourd'hui tout le dictionnaire —
 * sont rangés dans le cache des données, s'ils n'y sont pas déjà ; ce qui
 * aurait manqué arrive ensuite, par la page (js/paquets.js) ou à l'usage.
 *
 * ⚠ Ce service worker ne supprime **que** les coquilles périmées. Le cache des
 * données ne lui appartient pas : seul js/paquets.js y touche.
 */

const VERSION = 'v1.0.1';
const COQUILLE = 'langue-verte-coquille-' + VERSION;
const PREFIXE_DONNEES = 'langue-verte-donnees-';

const FICHIERS = [
  './',
  'index.html',
  'confidentialite.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/page.css',
  'js/outils.js',
  'js/lexique.js',
  'js/store.js',
  'js/voix.js',
  'js/revision.js',
  'js/notes.js',
  'js/perso.js',
  'js/motsvifs.js',
  'js/fiche.js',
  'js/exercices.js',
  'js/seance.js',
  'js/carnet.js',
  'js/explorer.js',
  'js/sauvegarde.js',
  'js/paquets.js',
  'js/installer.js',
  'js/miseajour.js',
  'js/app.js',
  'js/demarrage.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'data/manifeste.json',
];

/* La marque des requêtes d'installation : `cache: 'reload'` court-circuite le
 * cache du navigateur, pas celui du relais de GitHub Pages, qui garde un
 * fichier dix minutes. Une adresse que personne n'a demandée est fraîche. */
const MARQUE = '?coquille=' + encodeURIComponent(VERSION);

async function installerLaCoquille(cache) {
  const manques = [];
  await Promise.all(FICHIERS.map(async (url) => {
    try {
      const reponse = await fetch(new Request(url + MARQUE, { cache: 'reload' }));
      if (!reponse.ok) { manques.push(url + ' : ' + reponse.status); return; }
      await cache.put(url, reponse);
    } catch (erreur) {
      manques.push(url + ' : ' + (erreur && erreur.message ? erreur.message : erreur));
    }
  }));
  if (manques.length) throw new Error('coquille incomplète — ' + manques.join(', '));
  const page = await cache.match('index.html');
  const html = page ? await page.text() : '';
  if (html.indexOf('name="application-version" content="' + VERSION + '"') === -1) {
    throw new Error('index.html n’est pas de la version ' + VERSION);
  }
}

function nomDesDonnees(manifeste) {
  return PREFIXE_DONNEES + manifeste.format + '-' + (manifeste.mouture || manifeste.construit);
}

/* Range une liste de fichiers de données, un par un, en tolérant les échecs :
 * ce qui manque sera rattrapé à l'usage, ou par le téléchargement de la page.
 * Un fichier déjà là n'est pas redemandé. */
async function cacherTolerant(cache, urls, marque) {
  let manques = 0;
  let curseur = 0;
  async function ouvrier() {
    while (curseur < urls.length) {
      const url = urls[curseur];
      curseur += 1;
      try {
        if (await cache.match(url)) continue;
        const reponse = await fetch(new Request(url + marque, { cache: 'no-store' }));
        if (reponse.ok) await cache.put(url, reponse);
        else manques += 1;
      } catch (erreur) {
        manques += 1;
      }
    }
  }
  const ouvriers = [];
  for (let i = 0; i < 4; i += 1) ouvriers.push(ouvrier());
  await Promise.all(ouvriers);
  return manques;
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(COQUILLE);
    try {
      await installerLaCoquille(cache);
    } catch (erreur) {
      await caches.delete(COQUILLE);
      throw erreur;
    }
    /* Le manifeste vient d'être rangé ; on le relit depuis le cache. Lire le
     * corps d'une réponse la consomme : on ne clone jamais après. */
    const manifeste = await (await cache.match('data/manifeste.json')).json();
    const donnees = await caches.open(nomDesDonnees(manifeste));
    const f = manifeste.dico.fichiers;
    const manques = await cacherTolerant(donnees,
      f.index.concat(f.socle).map((x) => 'data/' + x),
      '?mouture=' + encodeURIComponent(manifeste.mouture || manifeste.construit));
    if (manques) console.warn('La Langue verte : ' + manques + ' fichiers du socle non pré-chargés, rattrapés à l’usage.');
    /* Pas de `skipWaiting()` ici : la nouvelle version attend le feu vert du
     * bandeau, pour ne pas changer l'application sous les doigts. */
  })());
});

self.addEventListener('message', (e) => {
  const message = e.data || {};
  if (message.type === 'passer-devant') self.skipWaiting();
  if (message.type === 'version' && e.ports && e.ports[0]) {
    e.ports[0].postMessage({ version: VERSION });
  }
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const nom of await caches.keys()) {
      if (nom.startsWith('langue-verte-coquille-') && nom !== COQUILLE) await caches.delete(nom);
    }
    await self.clients.claim();
  })());
});

/* Le nom du cache des données de cette version, lu une fois dans le
 * manifeste de la coquille. */
let promesseDonnees = null;
function cacheDesDonnees() {
  if (!promesseDonnees) {
    promesseDonnees = (async () => {
      try {
        const coquille = await caches.open(COQUILLE);
        const reponse = await coquille.match('data/manifeste.json');
        if (!reponse) return null;
        return caches.open(nomDesDonnees(await reponse.json()));
      } catch (erreur) {
        return null;
      }
    })();
  }
  return promesseDonnees;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.includes('/data/dico/')) {
    /* Une requête marquée vient du téléchargement de la page, qui range
     * elle-même la réponse : on la laisse passer au réseau. */
    if (url.search) return;
    e.respondWith((async () => {
      const donnees = await cacheDesDonnees();
      if (donnees) {
        const trouve = await donnees.match(e.request, { ignoreVary: true });
        if (trouve) return trouve;
      }
      const reponse = await fetch(e.request);
      if (reponse.ok && donnees) donnees.put(e.request, reponse.clone()).catch(() => {});
      return reponse;
    })());
    return;
  }

  /* La coquille : le cache de cette version, et lui seul. Ce qui n'y est pas
   * n'est pas de la version — l'image d'aperçu, une adresse inconnue — et va
   * au réseau sans rien laisser dans le cache. */
  e.respondWith((async () => {
    const coquille = await caches.open(COQUILLE);
    const enCache = await coquille.match(e.request, { ignoreSearch: true, ignoreVary: true });
    if (enCache) return enCache;
    return fetch(e.request);
  })());
});
