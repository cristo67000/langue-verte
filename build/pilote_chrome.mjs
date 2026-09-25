/*
 * Un pilote Chrome minimal, par le protocole DevTools.
 *
 * Node 24 porte un WebSocket natif : aucune dépendance n'est nécessaire pour
 * lancer un vrai Chrome, y exécuter du JavaScript et l'observer. C'est ce qu'il
 * faut ici, parce que le navigateur intégré à l'atelier refuse d'enregistrer un
 * service worker — et qu'un mode hors ligne qu'on n'a pas vu marcher n'est pas
 * un mode hors ligne.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* Où trouver un Chrome. La variable d'environnement `CHROME` l'emporte, pour
 * qui l'a installé ailleurs ou veut essayer avec un autre Chromium. */
const CHEMINS = [
  process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function trouverChrome() {
  for (const chemin of CHEMINS) {
    if (existsSync(chemin)) return chemin;
  }
  throw new Error('Chrome introuvable. Indiquez-le par la variable CHROME.');
}

export async function lancerChrome({ port = 9222, profil = null, telechargements = null, options = [] } = {}) {
  /* Si quelque chose répond déjà sur ce port, le Chrome qu'on va lancer ne
   * pourra pas s'y installer, et l'on parlerait sans le savoir à un autre —
   * un navigateur laissé par une épreuve précédente, avec ses cartes et ses
   * mots, qui fausserait tout. On refuse avant de lancer quoi que ce soit. */
  const occupant = await fetch(`http://127.0.0.1:${port}/json/version`)
    .then((r) => r.json()).catch(() => null);
  if (occupant) {
    throw new Error('Le port ' + port + ' est déjà tenu par ' + (occupant.Browser || '?')
      + ' — fermez-le, ou choisissez un autre port.');
  }
  const dossier = profil || mkdtempSync(path.join(tmpdir(), 'langue-verte-profil-'));
  const arguments_ = [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + dossier,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    // Chrome refuse le stockage persistant dans un profil neuf sans cela.
    '--enable-features=NetworkService',
    'about:blank',
  ];
  if (telechargements) arguments_.push('--disable-features=DownloadBubble');
  /* Des options de plus, pour une épreuve qui en a besoin : par exemple
   * `--host-resolver-rules="MAP … ~NOTFOUND"`, qui coupe un site sans
   * toucher au profil — la seule façon d'éprouver le hors-ligne sur le site
   * publié, les émulations de réseau du protocole ne coupant pas ce que le
   * service worker répond. */
  arguments_.push(...options);
  const processus = spawn(trouverChrome(), arguments_, { stdio: 'ignore', detached: false });

  // On attend que le point d'entrée réponde.
  let version = null;
  for (let essai = 0; essai < 60; essai += 1) {
    try {
      version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
      break;
    } catch (erreur) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!version) throw new Error('Chrome n’a pas répondu sur le port ' + port);
  /* Un autre navigateur peut déjà écouter ce port — l'atelier en ouvre un pour
   * son propre aperçu. S'y attacher par mégarde donnerait une épreuve qui ne
   * prouve rien : on vérifie donc qu'on parle bien à celui qu'on vient de
   * lancer. */
  if (!/^Chrome\//.test(version.Browser || '')) {
    throw new Error('Le port ' + port + ' est tenu par ' + version.Browser
      + ' — choisissez-en un autre.');
  }
  return { processus, port, dossier, version, ephemere: !profil };
}

export async function fermerChrome(chrome) {
  const processus = chrome.processus;
  const parti = new Promise((resoudre) => {
    if (processus.exitCode !== null || processus.signalCode) { resoudre(); return; }
    processus.once('exit', resoudre);
    setTimeout(resoudre, 10000).unref();
  });
  /* Sous Windows, tuer le processus principal laisse vivre ses rendus et son
   * processus graphique, qui tiennent le profil : on abat tout l'arbre. */
  if (process.platform === 'win32' && processus.pid) {
    spawnSync('taskkill', ['/PID', String(processus.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  try { processus.kill(); } catch (e) { /* déjà parti */ }
  await parti;
  if (!chrome.ephemere) return;
  /* Chrome lâche ses fichiers un peu après sa mort : on insiste quelques
   * secondes, sans quoi le dossier temporaire resterait — 70 Mo par épreuve. */
  for (let essai = 0; essai < 40; essai += 1) {
    try {
      rmSync(chrome.dossier, { recursive: true, force: true });
      if (!existsSync(chrome.dossier)) return;
    } catch (e) { /* encore tenu */ }
    await new Promise((r) => setTimeout(r, 250));
  }
}

/* Une session attachée à un onglet. `evaluer()` rend la valeur JSON du dernier
 * calcul, en attendant les promesses — c'est tout ce dont les épreuves ont
 * besoin. */
export async function ouvrirOnglet(chrome, url) {
  const cible = await fetch(
    `http://127.0.0.1:${chrome.port}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' }).then((r) => r.json());
  const prise = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((resoudre, rejeter) => {
    prise.onopen = resoudre;
    prise.onerror = () => rejeter(new Error('WebSocket refusé'));
  });

  let numero = 0;
  const attentes = new Map();
  /* Les erreurs de la page — exceptions et console.error — sont recueillies :
   * une épreuve qui passe avec une exception dans la console ne prouve rien. */
  const erreurs = [];
  prise.onmessage = (message) => {
    const donnees = JSON.parse(message.data);
    if (donnees.method === 'Runtime.exceptionThrown') {
      const d = donnees.params.exceptionDetails;
      erreurs.push('exception : ' + ((d.exception && d.exception.description) || d.text));
    }
    if (donnees.method === 'Runtime.consoleAPICalled' && donnees.params.type === 'error') {
      erreurs.push('console : ' + donnees.params.args.map((a) => a.value || a.description).join(' '));
    }
    if (donnees.id && attentes.has(donnees.id)) {
      const { resoudre, rejeter } = attentes.get(donnees.id);
      attentes.delete(donnees.id);
      if (donnees.error) rejeter(new Error(JSON.stringify(donnees.error)));
      else resoudre(donnees.result);
    }
  };

  function envoyer(methode, parametres) {
    numero += 1;
    const id = numero;
    return new Promise((resoudre, rejeter) => {
      attentes.set(id, { resoudre, rejeter });
      prise.send(JSON.stringify({ id, method: methode, params: parametres || {} }));
      setTimeout(() => {
        if (attentes.has(id)) {
          attentes.delete(id);
          rejeter(new Error('délai dépassé : ' + methode));
        }
      }, 120000);
    });
  }

  async function evaluer(source) {
    const resultat = await envoyer('Runtime.evaluate', {
      expression: `(async () => { ${source} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (resultat.exceptionDetails) {
      throw new Error('JS : ' + JSON.stringify(resultat.exceptionDetails.exception
        && resultat.exceptionDetails.exception.description || resultat.exceptionDetails));
    }
    return resultat.result.value;
  }

  async function naviguer(vers) {
    await envoyer('Page.enable');
    await envoyer('Page.navigate', { url: vers });
    // On attend que le document soit prêt, puis que l'application se branche.
    for (let essai = 0; essai < 120; essai += 1) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const pret = await evaluer('return document.readyState');
        if (pret === 'complete') return true;
      } catch (erreur) { /* la page change sous nos pieds */ }
    }
    return false;
  }

  await envoyer('Runtime.enable');
  await envoyer('Page.enable');
  return { envoyer, evaluer, naviguer, erreurs, fermer: () => prise.close() };
}
