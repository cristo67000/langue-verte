#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vérifie les données construites, puis lance les épreuves JavaScript.

  - les clés de Python et de JavaScript sont identiques (commun.cle et
    Lexique.cle, sur les cas de contrôle et sur 5 000 vedettes) ;
  - mots.idx est trié, sans retour chariot, et chaque ligne mène à une
    entrée qui existe dans la tranche annoncée ;
  - formes.idx est trié et chacun de ses lemmes est une clé de mots.idx ;
  - expressions.idx, equivalents.idx et themes.json ne citent que des
    vedettes existantes ;
  - le manifeste décrit exactement les fichiers présents, à l'octet près, et
    ses mots du jour et suggestions existent ;
  - les citations marquées le sont sur un mot ; les articles anciens ont une
    source connue et du texte ;
  - aucun signe de commande ne traîne dans les textes (les vers des anciens
    gardent leurs retours à la ligne, rien d'autre).

    python build/verifier.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import commun
from commun import cle

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "data"
SOURCES_ANCIENNES = {"delvau", "larchey", "virmaitre"}
RE_COMMANDE = re.compile(r"[\x00-\x09\x0b-\x1f\x7f]")

anomalies = []


def signaler(message):
    anomalies.append(message)
    print("  ✗", message)


def lire_idx(nom):
    texte = (DONNEES / "dico" / nom).read_bytes()
    if b"\r" in texte:
        signaler(f"{nom} contient des retours chariot")
    return texte.decode("utf-8").rstrip("\n").split("\n")


def verifier_cles(vedettes):
    cas = [c for c, _ in commun.CAS_DE_CONTROLE] + vedettes[:5000]
    sortie = subprocess.run(["node", str(RACINE / "build" / "essais.mjs"), "--cles"],
                            input=json.dumps(cas), capture_output=True, text=True, encoding="utf-8")
    if sortie.returncode:
        signaler("essais.mjs --cles a échoué : " + sortie.stderr[:300])
        return
    cles_js = json.loads(sortie.stdout)
    ecarts = [(c, cle(c), j) for c, j in zip(cas, cles_js) if cle(c) != j]
    for entree, attendu in commun.CAS_DE_CONTROLE:
        if cle(entree) != attendu:
            signaler(f"cle({entree!r}) = {cle(entree)!r}, attendu {attendu!r}")
    if ecarts:
        signaler(f"{len(ecarts)} clés diffèrent entre Python et JavaScript, ex. {ecarts[:3]}")
    else:
        print(f"  ✓ clés identiques en Python et en JavaScript ({len(cas)} cas)")


def textes_de(entree):
    """Tous les textes d'une entrée, pour y chercher des signes parasites."""
    for l in entree["l"]:
        for s in l["s"]:
            yield s.get("d", "")
            for x in s.get("x", ()):
                yield x[0]
    for bloc in entree.get("et", ()):
        yield from bloc
    if entree.get("sc"):
        yield entree["sc"]


def main():
    manifeste = json.loads((DONNEES / "manifeste.json").read_text(encoding="utf-8"))
    d = manifeste["dico"]

    # Les fichiers annoncés sont là, et pèsent ce qu'on dit.
    for groupe, liste in d["fichiers"].items():
        total = 0
        for f in liste:
            chemin = DONNEES / f
            if not chemin.exists():
                signaler(f"fichier annoncé absent : {f}")
                continue
            total += chemin.stat().st_size
        if total != d["octets"][groupe]:
            signaler(f"{groupe} : {total} octets sur le disque, {d['octets'][groupe]} au manifeste")
    presents = {p.name for p in (DONNEES / "dico").iterdir()}
    annonces = {Path(f).name for liste in d["fichiers"].values() for f in liste}
    if presents - annonces:
        signaler(f"fichiers non annoncés : {sorted(presents - annonces)[:5]}")

    # mots.idx
    lignes = lire_idx("mots.idx")
    if len(lignes) != d["entrees"]:
        signaler(f"mots.idx : {len(lignes)} lignes, {d['entrees']} entrées au manifeste")
    cles_idx = [l.split("\t")[0] for l in lignes]
    if cles_idx != sorted(cles_idx):
        signaler("mots.idx n'est pas trié")
    tranches = {}
    vedettes = []
    for ligne in lignes:
        champs_ = ligne.split("\t")
        if len(champs_) != 7:
            signaler(f"ligne d'index mal formée : {ligne[:80]!r}")
            continue
        k, mot, tranche, bande, nature, apercu, genre = champs_
        if genre not in ("", "a", "c", "ac") or ("a" in genre) != (bande == "4"):
            signaler(f"genre inattendu {genre!r} pour {mot!r} (bande {bande})")
        vedettes.append(mot)
        if k != cle(mot):
            signaler(f"clé {k!r} ≠ cle({mot!r})")
        if bande not in ("0", "1", "2", "3", "4"):
            signaler(f"bande inattendue {bande!r} pour {mot!r}")
        tranches.setdefault(int(tranche), set()).add(mot)
    marques_fausses = 0
    parasites = []
    anciens_faux = 0
    sans_sens = 0
    for numero, attendus in sorted(tranches.items()):
        contenu = json.loads((DONNEES / "dico" / f"t-{numero:03d}.json").read_text(encoding="utf-8"))
        if contenu.get("format") != manifeste["format"]:
            signaler(f"t-{numero:03d}.json : format {contenu.get('format')}")
        dedans = {e["m"] for e in contenu["e"]}
        if attendus - dedans:
            signaler(f"t-{numero:03d}.json : {len(attendus - dedans)} vedettes manquantes")
        for e in contenu["e"]:
            if not e["l"] or not any(s.get("d") or s.get("v") for l in e["l"] for s in l["s"]):
                sans_sens += 1
            for l in e["l"]:
                for s in l["s"]:
                    for x in s.get("x", ()):
                        texte, marque = x[0], x[1]
                        if marque and not (0 <= marque[0] < marque[1] <= len(texte)
                                           and texte[marque[0]:marque[1]].strip()):
                            marques_fausses += 1
            for texte in textes_de(e):
                if RE_COMMANDE.search(texte or ""):
                    parasites.append((e["m"], texte[:40]))
            for bloc in e.get("anc", ()):
                if bloc["s"] not in SOURCES_ANCIENNES or not bloc["a"]:
                    anciens_faux += 1
                for a in bloc["a"]:
                    if not a.get("v") or not a.get("p") or not any(p.strip() for p in a["p"]):
                        anciens_faux += 1
                    for p in a["p"]:
                        if RE_COMMANDE.search(p):
                            parasites.append((e["m"], p[:40]))
    if marques_fausses:
        signaler(f"{marques_fausses} marques de citation hors du texte")
    if parasites:
        signaler(f"{len(parasites)} textes avec des signes de commande, ex. {parasites[:3]}")
    if anciens_faux:
        signaler(f"{anciens_faux} articles anciens mal formés")
    if sans_sens:
        signaler(f"{sans_sens} entrées sans aucun sens ni renvoi")
    print(f"  ✓ mots.idx : {len(lignes)} vedettes, {len(tranches)} tranches relues")

    # formes.idx
    connues = set(cles_idx)
    formes = lire_idx("formes.idx")
    cles_formes = [l.split("\t")[0] for l in formes]
    if cles_formes != sorted(cles_formes):
        signaler("formes.idx n'est pas trié")
    orphelines = 0
    for ligne in formes:
        k, codes = ligne.split("\t")
        for code in codes.split("|"):
            n, reste = code.split(",", 1)
            if k[:int(n)] + reste not in connues:
                orphelines += 1
    if orphelines:
        signaler(f"formes.idx : {orphelines} lemmes introuvables")
    print(f"  ✓ formes.idx : {len(formes)} formes")

    # expressions.idx et equivalents.idx
    toutes = set(vedettes)
    for nom in ("expressions.idx", "equivalents.idx"):
        inconnues = 0
        lignes_x = lire_idx(nom)
        cles_x = [l.split("\t")[0] for l in lignes_x]
        if cles_x != sorted(cles_x):
            signaler(f"{nom} n'est pas trié")
        for ligne in lignes_x:
            champs_x = ligne.split("\t")
            if len(champs_x) != (3 if nom == "equivalents.idx" else 2):
                signaler(f"{nom} : ligne mal formée {ligne[:60]!r}")
                continue
            mot, liste = champs_x[0], champs_x[-1]
            if not mot:
                signaler(f"{nom} : clé vide")
            inconnues += sum(1 for v in liste.split("|") if v not in toutes)
        if inconnues:
            signaler(f"{nom} : {inconnues} vedettes inconnues")
        print(f"  ✓ {nom} : {len(lignes_x)} mots")

    # themes.json
    themes = json.loads((DONNEES / "dico" / "themes.json").read_text(encoding="utf-8"))["themes"]
    ids = [t["id"] for t in themes]
    if len(ids) != len(set(ids)):
        signaler("themes.json : identifiants en double")
    for t in themes:
        absents = [m for m in t["mots"] if m not in toutes]
        if absents:
            signaler(f"thème {t['id']} : {len(absents)} mots absents, ex. {absents[:3]}")
    annonces_themes = {t["id"]: t["n"] for t in manifeste["themes"]}
    reels = {t["id"]: len(t["mots"]) for t in themes}
    if annonces_themes != reels:
        signaler("les effectifs des thèmes du manifeste ne sont pas ceux de themes.json")
    print(f"  ✓ themes.json : {len(themes)} thèmes")

    # Le manifeste ne cite que des vedettes.
    cites = manifeste["du_jour"] + manifeste["suggestions"]["mots"] + manifeste["suggestions"]["expressions"]
    hors = [m for m in cites if m not in toutes]
    if hors:
        signaler(f"{len(hors)} mots du jour ou suggestions absents du dictionnaire")
    socle = set()
    for f in d["fichiers"]["socle"]:
        socle |= {e["m"] for e in json.loads((DONNEES / f).read_text(encoding="utf-8"))["e"]}
    if [m for m in manifeste["du_jour"] if m not in socle]:
        signaler("des mots du jour sont hors du socle")

    verifier_cles(vedettes)

    print("Épreuves JavaScript :")
    epreuve = subprocess.run(["node", str(RACINE / "build" / "essais.mjs")],
                             capture_output=True, text=True, encoding="utf-8")
    print("  " + epreuve.stdout.strip().split("\n")[-1])
    if epreuve.returncode:
        signaler("build/essais.mjs a échoué")
        print(epreuve.stdout)

    print(f"\n{'Aucune anomalie.' if not anomalies else str(len(anomalies)) + ' anomalie(s).'}")
    sys.exit(1 if anomalies else 0)


if __name__ == "__main__":
    main()
