'use strict';
/*
 * Prononciation, par la synthèse vocale du système.
 *
 * Aucun fichier son n'est embarqué : `speechSynthesis` emploie les voix
 * installées sur l'appareil et fonctionne donc hors ligne. Aucune requête
 * réseau n'est émise — la politique de sécurité de la page n'autorise de
 * toute façon que sa propre origine.
 *
 * Un texte français n'est lu que par une voix française. S'il n'y en a
 * aucune, rien n'est lu, et les Réglages le disent : une voix anglaise qui
 * lirait « feu » comme « few » ferait plus de tort que le silence.
 *
 * Le français de France passe devant. Le système donne ses voix dans son
 * ordre à lui, et la première venue est souvent canadienne : « fr-CA » avant
 * « fr-FR » sur Android, Amélie avant Thomas sur iPhone — un accent québécois
 * que personne n'a demandé. Les voix sont donc rangées : France, français
 * sans région, Belgique, Suisse et voisins, les autres, le Canada en dernier.
 * À région égale, une voix de l'appareil avant une voix en ligne ; puis la
 * meilleure, « premium » ou « améliorée » avant la voix compacte, et les voix
 * Eloquence d'Apple (Eddy, Flo, Grand-mère…), robotiques, en queue.
 *
 * Les voix arrivent en retard : `getVoices()` rend souvent une liste vide au
 * premier appel et la remplit ensuite, par `voiceschanged`. Les boutons ▸
 * dessinés avant cela sont repeints à l'arrivée de la liste.
 */
(function (racine) {

  const disponible = typeof speechSynthesis !== 'undefined'
    && typeof SpeechSynthesisUtterance !== 'undefined';

  const PHRASE_D_ESSAI = 'Ce mec a une sacrée tchatche : il te vendrait une bagnole sans moteur.';

  /* Rang de chaque région (le plus petit passe devant), son nom, et ce qui la
   * trahit dans le nom d'une voix — « Microsoft Sylvie - French (Canada) ». */
  const REGIONS = {
    FR: { rang: 0, nom: 'France', motif: /france/i },
    '': { rang: 1, nom: '', motif: null },
    BE: { rang: 2, nom: 'Belgique', motif: /belgi/i },
    CH: { rang: 2, nom: 'Suisse', motif: /suisse|switzerland|schweiz/i },
    LU: { rang: 2, nom: 'Luxembourg', motif: /luxemb/i },
    MC: { rang: 2, nom: 'Monaco', motif: /monaco/i },
    CA: { rang: 9, nom: 'Canada', motif: /canad|qu[ée]bec/i },
  };
  const AUTRE_REGION = 5;
  const ELOQUENCE = /^(eddy|flo|grandma|grandpa|grand-m[èe]re|grand-p[èe]re|reed|rocko|sandy|shelley)\b/i;

  let voix = [];                 // les voix françaises, les meilleures d'abord
  let pret = false;
  let actif = true;
  let choisie = null;            // { uri, nom } préférée, ou null : automatique
  const boutons = new Set();
  let enCours = null;            // référencé : Chrome ramasse sinon l'énoncé

  /* « fr-FR », « fr_FR », « FR » : la balise varie d'un moteur à l'autre. Un
   * énoncé porteur d'une balise mal formée peut être lu par la voix par défaut. */
  function balise(v) {
    return String(v.lang || '').replace(/_/g, '-');
  }

  function francaise(v) {
    return balise(v).toLowerCase().split('-')[0] === 'fr';
  }

  function regionDe(v) {
    // Le nom fait foi quand la balise se tait ou ment : « Français Canada ».
    if (REGIONS.CA.motif.test(v.name || '')) return 'CA';
    const sousBalise = balise(v).split('-').slice(1).find((s) => /^([a-z]{2}|\d{3})$/i.test(s));
    return sousBalise ? sousBalise.toUpperCase() : '';
  }

  function rangDe(v) {
    const r = REGIONS[regionDe(v)];
    return r ? r.rang : AUTRE_REGION;
  }

  function qualite(v) {
    const signes = (v.voiceURI || '') + ' ' + (v.name || '');
    if (/eloquence/i.test(signes) || ELOQUENCE.test(v.name || '')) return 0;
    if (/premium/i.test(signes)) return 3;
    if (/enhanced|am[ée]lior|natural|neural/i.test(signes)) return 2;
    return 1;
  }

  function classer(liste) {
    const cles = new Map(liste.map((v, i) => [v, [
      rangDe(v), v.localService ? 0 : 1, -qualite(v), v.default ? 0 : 1, i,
    ]]));
    return liste.slice().sort((a, b) => {
      const x = cles.get(a);
      const y = cles.get(b);
      for (let k = 0; k < x.length; k += 1) if (x[k] !== y[k]) return x[k] - y[k];
      return 0;
    });
  }

  function nomDeRegion(code) {
    if (REGIONS[code]) return REGIONS[code].nom;
    try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) || code; } catch (e) { return code; }
  }

  /* Le nom de la voix, avec sa région quand le nom ne la dit pas déjà. */
  function libelle(v) {
    const code = regionDe(v);
    const region = nomDeRegion(code);
    const dite = REGIONS[code] && REGIONS[code].motif && REGIONS[code].motif.test(v.name || '');
    return region && !dite ? v.name + ' — ' + region : v.name;
  }

  function recenser() {
    if (!disponible) return;
    try { voix = classer((speechSynthesis.getVoices() || []).filter(francaise)); } catch (e) { voix = []; }
    if (voix.length) pret = true;
  }

  function repeindre() {
    for (const b of boutons) {
      if (!b.isConnected) { boutons.delete(b); continue; }
      peindre(b);
    }
    document.dispatchEvent(new CustomEvent('voix-changees'));
  }

  if (disponible) {
    recenser();
    speechSynthesis.addEventListener('voiceschanged', () => { recenser(); repeindre(); });
    setTimeout(() => { if (!pret) { recenser(); pret = true; repeindre(); } }, 4000);
  }

  /* Hors réseau, une voix en ligne resterait muette : on la saute. */
  function utilisable(v) {
    return v.localService || typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  function automatique() {
    if (!voix.length) recenser();
    return voix.find(utilisable) || voix[0] || null;
  }

  function retenue() {
    if (!voix.length) recenser();
    if (choisie) {
      const trouvee = voix.find((v) => v.voiceURI === choisie.uri)
        || voix.find((v) => v.name === choisie.nom);
      if (trouvee && utilisable(trouvee)) return trouvee;
    }
    return automatique();
  }

  function possible() {
    return actif && !!retenue();
  }

  function dire(texte) {
    if (!disponible || !actif || !texte) return false;
    const v = retenue();
    if (!v) return false;
    try {
      speechSynthesis.cancel();
      const enonce = new SpeechSynthesisUtterance(texte);
      enonce.voice = v;
      enonce.lang = balise(v) || 'fr-FR';
      enonce.rate = 0.95;
      enonce.onend = () => { if (enCours === enonce) enCours = null; };
      enCours = enonce;
      speechSynthesis.speak(enonce);
      return true;
    } catch (e) {
      return false;
    }
  }

  function taire() {
    if (disponible) try { speechSynthesis.cancel(); } catch (e) { /* rien */ }
    enCours = null;
  }

  function peindre(b) {
    const ok = possible();
    b.hidden = !actif;
    b.disabled = !ok;
    b.title = ok ? 'Écouter' : 'Aucune voix française sur cet appareil';
  }

  /* Un bouton ▸ qui lit `texte` — ou ce que rend `texte()` au moment du clic. */
  function bouton(texte, classe) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classe || 'ecouter';
    b.textContent = '▸';
    b.setAttribute('aria-label', 'Écouter');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      dire(typeof texte === 'function' ? texte() : texte);
    });
    boutons.add(b);
    peindre(b);
    return b;
  }

  function regler(reglages) {
    actif = reglages.voix !== false;
    choisie = reglages.voixFr || null;
    repeindre();
  }

  function decrire(v) {
    return v ? { uri: v.voiceURI, nom: v.name, libelle: libelle(v), lang: balise(v), locale: !!v.localService } : null;
  }

  /* Les voix françaises de l'appareil, dans l'ordre où le choix automatique
   * les prendrait. */
  function lister() {
    recenser();
    return voix.map(decrire);
  }

  racine.Voix = {
    disponible, PHRASE_D_ESSAI, dire, taire, bouton, regler, lister, possible,
    get retenue() { return decrire(retenue()); },
    get automatique() { return decrire(automatique()); },
    get pret() { return pret; },
    get choisie() { return choisie; },
  };

})(window);
