'use strict';
/*
 * Installer l'application, et la partager.
 *
 * Une application web installable l'est déjà techniquement — le navigateur
 * propose « Ajouter à l'écran d'accueil » quelque part dans son menu. Encore
 * faut-il le savoir. D'où un bouton explicite, dans trois cas :
 *
 *   Android, Chrome, Edge   `beforeinstallprompt` est émis ; on le retient et
 *                           on le déclenche au clic.
 *   iOS, Safari             rien ne se déclenche par programme ; on explique
 *                           le geste : Partager, puis « Sur l'écran d'accueil ».
 *   déjà installée          on n'affiche rien.
 */
(function (racine) {

  const { element, bouton } = Outils;
  const ADRESSE = 'https://cristo67000.github.io/langue-verte/';

  let invite = null;
  let elements = {};

  function estInstallee() {
    return racine.matchMedia('(display-mode: standalone)').matches
      || racine.navigator.standalone === true;
  }

  function estApple() {
    const ua = racine.navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua)
      || (/Macintosh/.test(ua) && racine.navigator.maxTouchPoints > 1);
  }

  racine.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    invite = e;
    dessiner();
  });

  racine.addEventListener('appinstalled', () => {
    invite = null;
    dessiner();
  });

  function dessinerInstallation() {
    const bloc = elements.blocInstaller;
    const zone = elements.zoneInstaller;
    if (!bloc || !zone) return;
    zone.textContent = '';
    if (estInstallee()) { bloc.hidden = true; return; }

    if (invite) {
      bloc.hidden = false;
      zone.appendChild(element('p', 'discret',
        'Sur l’écran d’accueil, comme une application : elle s’ouvre d’un geste et marche sans réseau.'));
      const b = bouton('bouton-principal', 'Installer', async () => {
        b.disabled = true;
        try {
          invite.prompt();
          const choix = await invite.userChoice;
          if (choix && choix.outcome === 'accepted') invite = null;
        } catch (erreur) {
          invite = null;
        }
        dessiner();
      });
      zone.appendChild(b);
      return;
    }

    if (estApple()) {
      bloc.hidden = false;
      const marche = element('ol', 'marche-a-suivre');
      for (const etape of ['Touchez le bouton Partager de Safari (le carré avec une flèche).',
        'Choisissez « Sur l’écran d’accueil ».', 'Confirmez avec « Ajouter ».']) {
        marche.appendChild(element('li', null, etape));
      }
      zone.appendChild(marche);
      return;
    }
    bloc.hidden = true;
  }

  function dessinerPartage() {
    const zone = elements.zonePartager;
    if (!zone) return;
    zone.textContent = '';
    const retour = element('p', 'discret retour-partage', '');
    retour.hidden = true;
    zone.appendChild(bouton('bouton-discret', 'Partager l’application', async () => {
      const contenu = {
        title: 'La Langue verte',
        text: 'Un dictionnaire d’argot hors ligne, du verlan à la langue verte du XIXᵉ siècle, avec fiches de révision et notes.',
        url: ADRESSE,
      };
      if (racine.navigator.share) {
        try { await racine.navigator.share(contenu); return; } catch (erreur) {
          if (erreur && erreur.name === 'AbortError') return;
        }
      }
      try {
        await racine.navigator.clipboard.writeText(ADRESSE);
        retour.textContent = 'Adresse copiée.';
      } catch (erreur) {
        retour.textContent = ADRESSE;
      }
      retour.hidden = false;
    }));
    zone.appendChild(element('p', 'adresse-partage', ADRESSE));
    zone.appendChild(retour);
  }

  function dessiner() {
    dessinerInstallation();
    dessinerPartage();
  }

  function brancher() {
    elements = {
      blocInstaller: document.getElementById('bloc-installer'),
      zoneInstaller: document.getElementById('zone-installer'),
      zonePartager: document.getElementById('zone-partager'),
    };
    dessiner();
  }

  racine.Installer = { brancher, dessiner, estInstallee, estApple, ADRESSE };

})(window);
