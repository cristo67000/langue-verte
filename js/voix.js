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
 * Les voix arrivent en retard : `getVoices()` rend souvent une liste vide au
 * premier appel et la remplit ensuite, par `voiceschanged`. Les boutons ▸
 * dessinés avant cela sont repeints à l'arrivée de la liste.
 */
(function (racine) {

  const disponible = typeof speechSynthesis !== 'undefined'
    && typeof SpeechSynthesisUtterance !== 'undefined';

  const PHRASE_D_ESSAI = 'Ce mec a une sacrée tchatche : il te vendrait une bagnole sans moteur.';

  let voix = [];
  let pret = false;
  let actif = true;
  let choisie = null;            // { uri, nom } préférée, ou null : automatique
  const boutons = new Set();
  let enCours = null;            // référencé : Chrome ramasse sinon l'énoncé

  function francaise(v) {
    return String(v.lang || '').replace(/_/g, '-').toLowerCase().split('-')[0] === 'fr';
  }

  function recenser() {
    if (!disponible) return;
    try { voix = (speechSynthesis.getVoices() || []).filter(francaise); } catch (e) { voix = []; }
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

  function retenue() {
    if (!voix.length) recenser();
    if (choisie) {
      const trouvee = voix.find((v) => v.voiceURI === choisie.uri)
        || voix.find((v) => v.name === choisie.nom);
      if (trouvee) return trouvee;
    }
    // Une voix locale d'abord : elle marche sans réseau.
    return voix.find((v) => v.localService) || voix[0] || null;
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
      enonce.lang = String(v.lang || 'fr-FR').replace(/_/g, '-');
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

  function lister() {
    recenser();
    return voix.map((v) => ({ uri: v.voiceURI, nom: v.name, lang: v.lang, locale: !!v.localService }));
  }

  racine.Voix = {
    disponible, PHRASE_D_ESSAI, dire, taire, bouton, regler, lister, possible,
    get retenue() { const v = retenue(); return v ? { uri: v.voiceURI, nom: v.name } : null; },
    get pret() { return pret; },
    get choisie() { return choisie; },
  };

})(window);
