# La Langue verte — dictionnaire d’argot

Une application pour téléphone **et** ordinateur qui réunit trois choses :
**chercher** un mot d’argot et tout savoir de lui, **retenir** les mots qu’on
veut garder grâce à des fiches de révision, et **annoter** : ses propres notes
et ses propres mots. C’est la sœur argotique du
[Mot juste](https://github.com/cristo67000/mot-juste), sur le même modèle.

Tout fonctionne **hors ligne**. Pas de compte, pas de serveur, pas de mesure
d’audience, pas de publicité. La politique de sécurité de la page
(`connect-src 'self'`) lui interdit techniquement de contacter quoi que ce soit
d’autre que le site d’où elle vient.

---

## Ce qu’elle fait

**Chercher, dans les deux sens.** Un seul champ. Les résultats tombent à la
frappe ; les accents sont facultatifs, les formes fléchies mènent à leur lemme
(*flics* → *flic*, *chelous* → *chelou*), les expressions se trouvent par
n’importe lequel de leurs mots (*pipe* → *casser sa pipe*). Et l’on peut taper
un mot de **français courant** : *argent* donne fric, pognon, blé, thune,
oseille… ; *tête* donne bol, citron, tronche, cafetière… ; *prison* donne taule,
placard, cabane, zonzon… (12 500 mots français, tirés des définitions).

**Comprendre.** Chaque fiche donne :

- la prononciation, un bouton pour l’écouter, la fréquence d’usage
  (Lexique 3.83, films et livres) ;
- les **sens d’argot et de familier**, numérotés, avec leurs marques en clair —
  *argot*, *verlan*, *populaire*, *vulgaire*, *argot militaire*… — et des
  **citations** d’auteurs avec leur référence, les cas d’usage ;
- pour un mot courant qui a aussi un sens d’argot (*cheval* : l’héroïne), une
  ligne qui rappelle son sens ordinaire, sans le détailler ;
- les **synonymes** et les **contraires** du Wiktionnaire, et les **autres
  mots d’argot pour le même sens** (*fric* : pognon, thune, oseille…) ;
- l’**étymologie** et la date de première attestation ;
- **ce qu’en disaient les dictionnaires du XIXᵉ siècle** : les articles de
  Delvau (1883), Larchey (1881) et Virmaître (1894), avec le milieu d’où vient
  le mot — « argot des voleurs », « argot des typographes » ;
- les **expressions**, proverbes, dérivés, et **mes notes**.

Tout mot d’argot affiché mène à sa fiche ; « ← flic » ramène d’où l’on vient.
Les mots de la langue courante restent du texte : « des forces de l’ordre » ne
mène pas aux sens argotiques de *force*.

**Explorer.** Seize thèmes : verlan et codes, Internet et SMS, armée et
troupiers, écoles et étudiants, pègre, police et prison, arts et spectacle,
typographes, sport, jeu et turf, amour, drogue, Québec, Belgique et Suisse,
Afrique et outre-mer, régions de France, jargon européen, et l’argot du
XIXᵉ siècle.

**Le mot d’argot du jour**, choisi parmi un millier de mots qui ont une
étymologie et une citation — jamais un mot grossier : l’accueil ne met rien
de tel sous les yeux de qui n’a rien demandé.

**Retenir : les fiches de révision.** Répétition espacée (SM-2 simplifié,
celui de Wortschatz), deux fiches par mot — *le sens* (voir le mot d’argot,
retrouver ce qu’il veut dire) et *le mot* (lire la définition, retrouver le mot
d’argot) —, en recto-verso ou en questions variées : choix multiples, écriture
du mot, phrase à trou. **Deux synonymes ne se leurrent jamais** : une question
dont la réponse est *fric* ne propose pas *pognon* comme leurre.

**Annoter, entrer ses mots, sauvegarder** : comme dans Le Mot juste (notes
enregistrées d’elles-mêmes et rappelées après la réponse, mots à soi,
sauvegarde dans un fichier qui se recharge ailleurs en fusionnant).

**Sur un ordinateur**, les onglets passent dans une colonne à gauche et la
fiche s’ouvre à droite de la liste, qui reste lisible. « / » place le curseur
dans la recherche, les flèches parcourent les résultats, Entrée ouvre, Échap
referme.

---

## Le dictionnaire

**28 383 vedettes** : 17 590 mots et 10 793 expressions.

- **17 903** viennent du **Wiktionnaire** (extraction wiktextract, CC BY-SA 4.0) :
  tous les sens marqués argot, familier, très familier, populaire, vulgaire,
  ou d’un argot particulier, et les mots formés en verlan, louchébem ou
  largonji — le périmètre des dictionnaires d’argot classiques ;
- **10 480** ne sont donnés que par les **trois dictionnaires du XIXᵉ siècle**
  (domaine public) ; 2 908 mots du Wiktionnaire ont aussi leurs articles.

Voir [build/SOURCES.md](build/SOURCES.md).

### Sur l’appareil : ≈ 22 Mo, tout hors ligne dès l’installation

Le service worker range d’un coup les index (3,8 Mo) et les 57 tranches du
dictionnaire (18 Mo). Les données ont leur propre cache, nommé d’après leur
date de construction : corriger le code ne fait pas retélécharger le
dictionnaire. Une nouvelle version s’installe en arrière-plan et attend un
toucher sur le bandeau « Mettre à jour ».

---

## Construire les données

```
python build/telecharger.py   # Wiktionnaire et Lexique (liés à ceux du Mot juste), Delvau, Virmaître, Larchey
python build/extraire.py      # ≈ 2 min : les sections d’argot du Wiktionnaire
python build/anciens.py       # les trois dictionnaires anciens, article par article
python build/construire.py    # ≈ 10 s : data/dico/ et data/manifeste.json
python build/verifier.py      # intégrité des données + épreuves JavaScript
python build/generer-icones.py
```

`build/rapport.txt` résume chaque construction.

## Épreuves

```
node build/essais.mjs            # recherche, français → argot, entrées, correction, calendrier (55 cas)
python build/verifier.py         # données : tri, tranches, index, thèmes, clés Python = JS
node build/essais_hors_ligne.mjs # serveur arrêté : l’application tient (14 cas)
node build/captures.mjs          # parcours complet, téléphone puis ordinateur, captures
```

`captures.mjs` et `essais_hors_ligne.mjs` pilotent un vrai Chrome sans
affichage (`build/pilote_chrome.mjs`, repris du Mot juste).

## Organisation du code

| Fichier | Rôle |
|---|---|
| `js/lexique.js` | index en mémoire, recherche, formes, français → argot, thèmes |
| `js/fiche.js` | la fiche d’un mot, les articles anciens, sa pile de navigation |
| `js/explorer.js` | l’onglet Explorer |
| `js/motsvifs.js` | les mots d’argot cliquables dans les textes, l’italique des anciens |
| `js/revision.js` | le calendrier (SM-2), les séances |
| `js/exercices.js` | les questions, les leurres, la correction |
| `js/seance.js` | l’onglet Réviser |
| `js/notes.js`, `js/perso.js`, `js/carnet.js` | notes, mots à soi, carnet |
| `js/paquets.js`, `sw.js` | le dictionnaire sur l’appareil, la coquille |
| `js/store.js`, `js/sauvegarde.js` | IndexedDB, export et import |

Servir en local : `python -m http.server 8146` à la racine (configuration
`langue-verte` du `.claude/launch.json`).
