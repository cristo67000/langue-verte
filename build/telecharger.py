#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Récupération des sources de La Langue verte.

Rien de ce qui est téléchargé ici n'est publié tel quel : ce sont les matières
premières, `extraire.py`, `anciens.py` puis `construire.py` en tirent le
dictionnaire de l'application. Le dossier `build/sources/` pèse près d'un
gigaoctet et n'a pas sa place dans le dépôt (voir .gitignore).

  wiktionnaire-fr.jsonl.gz   le Wiktionnaire francophone intégral, extrait par
                             wiktextract et publié sur kaikki.org (≈ 700 Mo)
  Lexique383.tsv             Lexique 3.83, fréquences d'usage (≈ 25 Mo)
  delvau-1883.txt            Alfred Delvau, Dictionnaire de la langue verte,
                             éd. de 1883 augmentée par Gustave Fustier —
                             Project Gutenberg n° 54482 (≈ 1,4 Mo)
  virmaitre-1894.txt         Charles Virmaître, Dictionnaire d'argot
                             fin-de-siècle — Project Gutenberg n° 57656 (0,6 Mo)
  larchey-1881.json          Lorédan Larchey, Dictionnaire historique d'argot,
                             9e éd. — les 558 pages transcrites et corrigées
                             sur Wikisource (≈ 1,4 Mo)

Le Wiktionnaire et Lexique sont les mêmes fichiers que ceux du Mot juste : s'ils
sont déjà sur le disque, à côté, on les **lie** au lieu de les retélécharger
(un lien physique ne prend pas de place). Provenance et licences : SOURCES.md.

Usage :
    python build/telecharger.py            # ne retélécharge pas ce qui est là
    python build/telecharger.py --forcer
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import commun  # noqa: F401 — règle l'encodage de la console

RACINE = Path(__file__).resolve().parent
SOURCES = RACINE / "sources"
AGENT = "La-Langue-verte-build/1.0 (dictionnaire d'argot hors ligne ; lecture ponctuelle)"

FICHIERS = {
    "wiktionnaire-fr.jsonl.gz": "https://kaikki.org/frwiktionary/raw-wiktextract-data.jsonl.gz",
    "Lexique383.tsv": "http://www.lexique.org/databases/Lexique383/Lexique383.tsv",
    "delvau-1883.txt": "https://www.gutenberg.org/cache/epub/54482/pg54482.txt",
    "virmaitre-1894.txt": "https://www.gutenberg.org/cache/epub/57656/pg57656.txt",
}

# Là où les deux gros fichiers se trouvent peut-être déjà.
VOISINS = [RACINE.parent.parent / "mot-juste" / "build" / "sources",
           RACINE.parent.parent / "wortschatz" / "build" / "sources"]

WIKISOURCE = "https://fr.wikisource.org/w/api.php"
LARCHEY = "Larchey - Dictionnaire historique d’argot - 9e édition.djvu/"


def telecharger(nom, url):
    destination = SOURCES / nom
    provisoire = destination.with_suffix(destination.suffix + ".partiel")
    requete = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(requete, timeout=120) as reponse, open(provisoire, "wb") as f:
        total = int(reponse.headers.get("Content-Length") or 0)
        recu = 0
        while True:
            bloc = reponse.read(1 << 20)
            if not bloc:
                break
            f.write(bloc)
            recu += len(bloc)
            if total:
                print(f"\r  {nom} : {commun.humain(recu)} / {commun.humain(total)}", end="", flush=True)
        date = reponse.headers.get("Last-Modified", "")
    provisoire.replace(destination)
    print(f"\r  {nom} : {commun.humain(recu)} — mouture annoncée : {date or 'inconnue'}")


def lier(nom):
    """Un lien physique vers la copie voisine, s'il y en a une."""
    for dossier in VOISINS:
        voisin = dossier / nom
        if voisin.exists():
            try:
                os.link(voisin, SOURCES / nom)
                print(f"  {nom} : lié à {voisin} ({commun.humain(voisin.stat().st_size)})")
                return True
            except OSError as erreur:
                print(f"  {nom} : lien impossible ({erreur}), on télécharge")
                return False
    return False


def api(parametres):
    """Une requête à l'API de Wikisource, patiente : Wikimedia répond 429 à qui
    enchaîne les appels sans souffler."""
    parametres = dict(parametres, format="json", formatversion="2")
    url = WIKISOURCE + "?" + urllib.parse.urlencode(parametres)
    requete = urllib.request.Request(url, headers={"User-Agent": AGENT})
    for essai in range(6):
        time.sleep(2 + 6 * essai)
        try:
            with urllib.request.urlopen(requete, timeout=120) as reponse:
                return json.load(reponse)
        except urllib.error.HTTPError as erreur:
            if erreur.code not in (429, 503):
                raise
            print(f"    (Wikisource demande d'attendre : {erreur.code})", flush=True)
    raise SystemExit("Wikisource refuse toujours de répondre — réessayer plus tard.")


def larchey():
    """Les pages du Larchey, par lots de cinquante, dans un seul fichier JSON :
    `{"pages": {"1": wikitexte, …}, "qualite": {"1": 3, …}}`."""
    titres = []
    suite = {}
    while True:
        d = api(dict({"action": "query", "list": "allpages", "apnamespace": "104",
                      "apprefix": LARCHEY, "aplimit": "500"}, **suite))
        titres += [p["title"] for p in d["query"]["allpages"]]
        if "continue" not in d:
            break
        suite = {"apcontinue": d["continue"]["apcontinue"]}
    pages, qualite = {}, {}
    for debut in range(0, len(titres), 50):
        lot = titres[debut:debut + 50]
        d = api({"action": "query", "prop": "revisions|proofread", "rvprop": "content",
                 "rvslots": "main", "titles": "|".join(lot)})
        for p in d["query"]["pages"]:
            numero = p["title"].rsplit("/", 1)[1]
            revisions = p.get("revisions") or []
            if revisions:
                pages[numero] = revisions[0]["slots"]["main"]["content"]
            if p.get("proofread"):
                qualite[numero] = p["proofread"].get("quality")
        print(f"\r  larchey-1881.json : {len(pages)} pages sur {len(titres)}", end="", flush=True)
    sortie = SOURCES / "larchey-1881.json"
    with open(sortie, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"source": "https://fr.wikisource.org/wiki/Livre:" + LARCHEY.rstrip("/"),
                   "recupere": time.strftime("%Y-%m-%d"), "pages": pages, "qualite": qualite},
                  f, ensure_ascii=False, indent=0)
    print(f"\r  larchey-1881.json : {len(pages)} pages, {commun.humain(sortie.stat().st_size)}")


def main():
    analyseur = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    analyseur.add_argument("--forcer", action="store_true")
    options = analyseur.parse_args()
    SOURCES.mkdir(parents=True, exist_ok=True)
    for nom, url in FICHIERS.items():
        if (SOURCES / nom).exists() and not options.forcer:
            print(f"  {nom} : déjà là")
            continue
        if options.forcer and (SOURCES / nom).exists():
            (SOURCES / nom).unlink()
        if nom.endswith((".gz", ".tsv")) and lier(nom):
            continue
        telecharger(nom, url)
    if (SOURCES / "larchey-1881.json").exists() and not options.forcer:
        print("  larchey-1881.json : déjà là")
    else:
        larchey()


if __name__ == "__main__":
    sys.exit(main())
