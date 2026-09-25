'use strict';
/*
 * Le dictionnaire sur l'appareil : socle, suite, et téléchargement.
 *
 * Les données vivent dans un cache à part, nommé d'après leur construction —
 * `langue-verte-donnees-<format>-<mouture>`, date et empreinte du contenu —,
 * et non d'après la version de l'application : corriger une faute dans le
 * code ne doit pas faire retélécharger 22 Mo sur un forfait mobile. La date
 * seule ne suffirait pas : deux constructions du même jour porteraient le
 * même nom.
 *
 *   à l'installation   le service worker y range les index et le socle —
 *                      aujourd'hui tout le dictionnaire, ~22 Mo ;
 *   ensuite            ce qui aurait manqué (réseau coupé pendant
 *                      l'installation), et la suite s'il y en a une un jour,
 *                      que la page range tranche par tranche en arrière-plan ;
 *   à l'usage          toute tranche ouverte en ligne y est rangée au passage.
 *
 * Le téléchargement reprend là où il s'est arrêté : un fichier déjà en cache
 * n'est pas redemandé. Chaque requête porte la date de construction en
 * paramètre, ce qui déjoue le cache du navigateur et celui du relais de
 * GitHub Pages : on ne range jamais l'ancien contenu sous un nouveau nom.
 *
 * Seule suppression automatique : les données d'une construction antérieure,
 * une fois celle-ci entièrement sur l'appareil.
 */
(function (racine) {

  const PREFIXE = 'langue-verte-donnees-';
  const PARALLELE = 3;

  let enCours = null;          // { promesse, controle }
  let dernierEtat = null;      // pour qui s'abonne en cours de route

  function nomDuCache(m) {
    return PREFIXE + m.format + '-' + (m.mouture || m.construit);
  }

  function fichiers(m, groupes) {
    const f = m.dico.fichiers;
    return (groupes || ['index', 'socle', 'suite']).flatMap((g) => f[g].map((x) => 'data/' + x));
  }

  async function presents(m, liste) {
    if (!('caches' in racine)) return new Set();
    const cache = await caches.open(nomDuCache(m));
    const cles = await cache.keys();
    const ici = new Set(cles.map((r) => new URL(r.url).pathname));
    return new Set(liste.filter((f) => {
      for (const chemin of ici) if (chemin.endsWith('/' + f)) return true;
      return false;
    }));
  }

  /* Ce qui est là : `{ socle, suite, complet, octetsManquants }`. */
  async function etat(m) {
    const socle = fichiers(m, ['index', 'socle']);
    const suite = fichiers(m, ['suite']);
    const ici = await presents(m, socle.concat(suite));
    const nSocle = socle.filter((f) => ici.has(f)).length;
    const nSuite = suite.filter((f) => ici.has(f)).length;
    const o = m.dico.octets;
    const partSuite = suite.length ? nSuite / suite.length : 1;
    return {
      socle: nSocle, socleTotal: socle.length,
      suite: nSuite, suiteTotal: suite.length,
      complet: nSocle === socle.length && nSuite === suite.length,
      octetsTotal: o.index + o.socle + o.suite,
      octetsManquants: Math.round((1 - partSuite) * o.suite)
        + Math.round((1 - nSocle / Math.max(1, socle.length)) * (o.index + o.socle)),
    };
  }

  function signaler(detail) {
    dernierEtat = detail;
    document.dispatchEvent(new CustomEvent('telechargement', { detail }));
  }

  /* Télécharge tout ce qui manque. Une seule fois à la fois. */
  function telecharger(m) {
    if (enCours) return enCours.promesse;
    const controle = new AbortController();
    const promesse = (async () => {
      const cache = await caches.open(nomDuCache(m));
      const tous = fichiers(m);
      const ici = await presents(m, tous);
      const aFaire = tous.filter((f) => !ici.has(f));
      const total = tous.length;
      let faits = total - aFaire.length;
      let octets = 0;
      const marque = '?mouture=' + encodeURIComponent(m.mouture || m.construit);
      signaler({ faits, total, octets, enCours: true });
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      let curseur = 0;
      async function ouvrier() {
        while (curseur < aFaire.length) {
          if (controle.signal.aborted) return;
          const chemin = aFaire[curseur];
          curseur += 1;
          const reponse = await fetch(chemin + marque, { cache: 'no-store', signal: controle.signal });
          if (!reponse.ok) throw new Error(chemin + ' : ' + reponse.status);
          const corps = await reponse.blob();
          await cache.put(chemin, new Response(corps, {
            headers: { 'Content-Type': reponse.headers.get('Content-Type') || 'application/json' },
          }));
          octets += corps.size;
          faits += 1;
          signaler({ faits, total, octets, enCours: true });
        }
      }
      try {
        const ouvriers = [];
        for (let i = 0; i < PARALLELE; i += 1) ouvriers.push(ouvrier());
        await Promise.all(ouvriers);
      } catch (erreur) {
        controle.abort();
        const arret = erreur && erreur.name === 'AbortError';
        signaler({ faits, total, octets, enCours: false, erreur: arret ? null : String(erreur.message || erreur),
          arrete: arret });
        return false;
      }
      if (controle.signal.aborted) {
        signaler({ faits, total, octets, enCours: false, arrete: true });
        return false;
      }
      await menage(m);
      signaler({ faits: total, total, octets, enCours: false, fini: true });
      return true;
    })().finally(() => { enCours = null; });
    enCours = { promesse, controle };
    return promesse;
  }

  function arreter() {
    if (enCours) enCours.controle.abort();
  }

  /* Au démarrage : si le réglage le veut, qu'on est en ligne et qu'on n'a
   * pas demandé d'économiser les données, on complète en arrière-plan — une
   * fois le service worker en place, pour ne pas disputer la bande passante à
   * l'installation du socle. */
  async function auto(m, reglages) {
    if (!reglages.toutHorsLigne || !('caches' in racine)) return;
    if (navigator.onLine === false) return;
    const connexion = navigator.connection;
    if (connexion && connexion.saveData) return;
    if ('serviceWorker' in navigator) {
      try {
        await Promise.race([navigator.serviceWorker.ready,
          new Promise((r) => setTimeout(r, 20000))]);
      } catch (e) { /* on continue sans */ }
    }
    await new Promise((r) => setTimeout(r, 4000));
    const e = await etat(m).catch(() => null);
    if (e && !e.complet) telecharger(m).catch(() => {});
  }

  /* Les données d'une construction antérieure partent quand la courante est
   * entière — jamais avant : ce sont elles qui servent en attendant. */
  async function menage(m) {
    if (!('caches' in racine)) return 0;
    const courant = nomDuCache(m);
    const e = await etat(m);
    if (!e.complet) return 0;
    let n = 0;
    for (const nom of await caches.keys()) {
      if (nom.startsWith(PREFIXE) && nom !== courant) { await caches.delete(nom); n += 1; }
    }
    return n;
  }

  async function supprimerLaSuite(m) {
    arreter();
    const cache = await caches.open(nomDuCache(m));
    for (const f of fichiers(m, ['suite'])) await cache.delete(f);
    signaler({ faits: 0, total: 0, octets: 0, enCours: false, supprime: true });
  }

  racine.Paquets = {
    nomDuCache, etat, telecharger, arreter, auto, menage, supprimerLaSuite,
    get enCours() { return !!enCours; },
    get dernierEtat() { return dernierEtat; },
  };

})(window);
