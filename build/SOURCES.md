# Sources des données

L’application ne rédige aucune définition. Tout ce qu’elle affiche vient de
ressources libres, mises en forme par `build/` vers `data/`. Le choix des
sources a été fait par l’utilisateur le 25 septembre 2026, après une recherche
comparative des dictionnaires d’argot disponibles (voir la fin de ce fichier).

## 1. Le Wiktionnaire francophone

- **Quoi** : l’extraction intégrale du Wiktionnaire francophone par
  [wiktextract](https://github.com/tatuylonen/wiktextract) (Tatu Ylonen),
  publiée sur [kaikki.org](https://kaikki.org/frwiktionary/) :
  `raw-wiktextract-data.jsonl.gz`, mouture du 12 septembre 2026 (le même
  fichier que celui du Mot juste et de Wortschatz, lié et non recopié).
- **Licence** : CC BY-SA 4.0. Les données de l’application sont diffusées
  sous la même licence ; chaque fiche renvoie à l’article d’origine.
- **Ce qu’on en prend** (`extraire.py`) : les sections de mots français qui
  ont au moins un sens marqué *argot*, *familier*, *très familier*,
  *populaire*, *vulgaire*, ou d’un argot particulier (catégories « Argot
  militaire », « Argot scolaire », « Argot policier », « Argot Internet »…),
  et celles dont l’étymologie dit verlan, louchébem ou largonji.
- **Ce qu’on en garde** (`construire.py`) : quand le premier sens d’une
  section est argotique, tous ses sens (le Wiktionnaire ne marque pas toujours
  les extensions) ; sinon, seulement les sens marqués. Le premier sens courant
  est rappelé en une ligne, et l’ordre des sections dit s’il vient d’abord
  (*cheval*, *lance*) ou après l’argot (*taule*).
- **Ce qu’on en rogne** : deux citations pour les deux premiers sens, une
  ensuite ; étymologies coupées à 900 signes (500 pour une expression),
  marquées « […] ».
- **Ce qu’on en déduit** : l’index du **français vers l’argot**, tiré des
  définitions courtes (« Argent. » → *fric*) — voir `concepts()` ; et les
  **thèmes**, tirés des catégories et des marques (`THEMES`).

## 2. Trois dictionnaires d’argot du XIXᵉ siècle (domaine public)

| Ouvrage | Texte | Articles |
|---|---|---|
| Alfred Delvau, *Dictionnaire de la langue verte*, éd. 1883 augmentée par Gustave Fustier | [Project Gutenberg n° 54482](https://www.gutenberg.org/ebooks/54482), relu par les Distributed Proofreaders | 9 255 (dont 1 036 au supplément) |
| Lorédan Larchey, *Dictionnaire historique d’argot*, 9ᵉ éd., 1881 | [Wikisource](https://fr.wikisource.org/wiki/Livre:Larchey_-_Dictionnaire_historique_d%E2%80%99argot_-_9e_%C3%A9dition.djvu), 558 pages toutes corrigées | 8 397 (dont 2 435 au supplément) |
| Charles Virmaître, *Dictionnaire d’argot fin-de-siècle*, 1894 | [Project Gutenberg n° 57656](https://www.gutenberg.org/ebooks/57656) | 3 167 (dont 122 au petit supplément) |

`anciens.py` découpe les articles (vedette en capitales, complément entre
parenthèses remis devant — « ABATTRE (En) » → *en abattre* —, nature,
paragraphes, italique noté `_…_`), relève les milieux cités (« argot des
voleurs ») et les renvois (« V. *Trèpe* »), et tire de chaque article une
définition courte pour la recherche et les révisions. Les pages de Wikisource
sont recollées en tenant compte des modèles `{{tiret}}`, `{{corr}}`, `{{s}}`…

Les articles sont reproduits tels quels. Ce sont des textes d’époque : la
fiche le dit.

Deux accidents de transcription de Virmaître sont réparés au découpage : une
vedette coupée en deux paragraphes (« =JOUER À LA MAIN= » / « =CHAUDE= ») et
un gras en minuscules qui cite une enseigne (« =Au Juge de Paix= »).

## 3. Lexique 3.83

[Lexique](http://www.lexique.org/) (Boris New, Christophe Pallier et coll.),
CC BY-SA 4.0 : fréquences d’usage mesurées sur des sous-titres de films et des
livres. Elles donnent la bande (« très courant » … « rare ») et l’ordre des
résultats. Pour un mot courant qui a aussi un sens d’argot, la fréquence
n’est pas affichée : elle mesurerait le blé qu’on moissonne, pas celui qu’on
dépense.

## Ce qui n’a pas été repris

Relevé lors de la recherche du 25 septembre 2026 :

- **Bob** (languefrancaise.net), ≈ 65 000 entrées et 100 000 citations : aucune
  licence libre, pas d’export, site protégé contre les robots ;
- **Dictionnaire de la Zone** (argot des cités), plus de 2 700 entrées :
  licence CC BY-NC-ND 2.0 FR, qui interdit de le remanier ;
- **Dictionnaire des francophones** : licence libre, mais aucun fichier
  téléchargeable, et son argot vient surtout du Wiktionnaire ;
- Rigaud (1888) et Bruant (1901-1905) : domaine public, mais texte scanné non
  relu — non retenus pour cette version ;
- les dictionnaires imprimés modernes (Larousse, Robert, Esnault…) et le TLFi :
  droits réservés.
