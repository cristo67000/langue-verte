#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Construit le dictionnaire d'argot de l'application.

── Ce qui entre ─────────────────────────────────────────────────────────────

  sources/sections.jsonl    le Wiktionnaire, sections d'argot (extraire.py)
  sources/formes.tsv        formes fléchies → lemmes (extraire.py)
  sources/anciens.jsonl     Delvau, Larchey, Virmaître, article par article
                            (anciens.py)
  sources/Lexique383.tsv    Lexique 3.83, fréquences d'usage

── Ce qui sort, dans data/ ──────────────────────────────────────────────────

  dico/mots.idx         une ligne par vedette, triée par clé :
                        clé ⇥ vedette ⇥ tranche ⇥ bande ⇥ nature ⇥ aperçu ⇥ genre
                        (genre : « a » argot ancien, « c » mot courant qui a
                        aussi un sens d'argot, rien pour un mot d'argot)
  dico/formes.idx       forme ⇥ n,reste|n,reste → clé du lemme = forme[:n] + reste
                        (formes fléchies, et variantes des dictionnaires anciens)
  dico/expressions.idx  mot ⇥ vedette|vedette|… les expressions qui le contiennent
  dico/equivalents.idx  clé ⇥ mot français ⇥ vedette|vedette|… — « argent » →
                        fric, pognon, thune… : la recherche du français vers
                        l'argot
  dico/themes.json      les thèmes (verlan, armée, pègre…) et leurs mots
  dico/t-000.json…      les entrées, par tranches
  manifeste.json        la description du tout

── Une vedette, trois cas ───────────────────────────────────────────────────

  1. un mot d'argot du Wiktionnaire, avec ou sans article ancien : on garde
     **ses sens d'argot et de familier**, pas les autres — « cheval » n'est ici
     que l'héroïne ; une ligne rappelle son sens courant ;
  2. un mot que seuls les dictionnaires anciens donnent (« abadie », la
     foule) : la fiche est faite de leurs articles, et une « lecture » cachée
     (`"o": 1`) en tire une définition courte pour la recherche et les
     fiches de révision ;
  3. un mot à soi, que l'application ajoute elle-même.

Les bandes de fréquence viennent de Lexique : 0 très courant … 3 rare, et 4
pour « argot ancien » — un mot que seuls les dictionnaires du XIXᵉ siècle
attestent, dont Lexique ne dirait rien de juste.

Usage :
    python build/construire.py
"""

import collections
import csv
import datetime
import hashlib
import json
import re
import shutil
import sys
import time
from pathlib import Path

import commun
from commun import cle
import etiquettes

RACINE = Path(__file__).resolve().parent
SOURCES = RACINE / "sources"
DONNEES = RACINE.parent / "data"
DOSSIER = DONNEES / "dico"
RAPPORT = RACINE / "rapport.txt"

# Le format des entrées : à changer quand il change, l'application refuse
# alors les tranches d'un autre format plutôt que de les mal lire.
FORMAT = 1

# Le budget du socle, pré-chargé à l'installation. Tout le dictionnaire y
# tient : une trentaine de mégaoctets, rien à télécharger ensuite.
SOCLE_OCTETS = 48 * 1024 * 1024
TRANCHE = 500          # entrées par fichier

MOTS = {
    "sens_max": 30,
    "exemples": [2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    "exemple_mots_max": 36,
    "etymologie_max": 900,
}
EXPRESSIONS = {
    "sens_max": 12,
    "exemples": [2, 1, 1, 1],
    "exemple_mots_max": 36,
    "etymologie_max": 500,
}
REFERENCE_MAX = 80
APERCU_MAX = 44
SENS_COURANT_MAX = 140

PLAFONDS = {"syn": 30, "ant": 20, "par": 8, "hyper": 8, "hypo": 16,
            "loc": 60, "der": 40, "prov": 20, "rel": 24}

BANDES = [(100.0, 0), (10.0, 1), (1.0, 2)]   # au-delà : 3
ANCIEN = 4
LIBELLES_BANDES = ["très courant", "courant", "moins courant", "rare", "argot ancien"]

SOURCES_ANCIENNES = {
    "delvau": {"auteur": "Alfred Delvau", "titre": "Dictionnaire de la langue verte",
               "annee": "1883", "supplement": "Supplément de Gustave Fustier"},
    "larchey": {"auteur": "Lorédan Larchey", "titre": "Dictionnaire historique d’argot",
                "annee": "1881", "supplement": "Supplément"},
    "virmaitre": {"auteur": "Charles Virmaître", "titre": "Dictionnaire d’argot fin-de-siècle",
                  "annee": "1894", "supplement": "Petit supplément"},
}
ORDRE_ANCIENS = ["delvau", "larchey", "virmaitre"]

MOTS_OUTILS = set("""
a au aux avec ce ces cet cette d de des du elle en est et il ils je l la le les
leur leurs lui ma me mes mon n ne nous on ou par pas pour qu que qui s sa se ses
son sur t ta te tes ton tu un une vos votre vous y c j m ni plus
""".split())

# Ce qui ne doit jamais s'afficher de soi-même à l'accueil — mot du jour,
# suggestions : un dictionnaire d'argot en est plein, et c'est normal, mais on
# ne les met pas sous les yeux de qui n'a rien demandé.
MARQUES_ECARTEES_DE_L_ACCUEIL = {"vulgaire", "injurieux", "péjoratif", "sexualité", "très familier",
                                 "blasphématoire", "Blasphématoire", "raciste", "homophobe",
                                 "misogyne", "Transphobe", "Injurieux", "Vulgaire", "LGBTQ",
                                 "Argot des incels", "Drogue"}


def bande_de(frequence):
    for seuil, bande in BANDES:
        if frequence >= seuil:
            return bande
    return 3


# --- Lexique 3.83 ------------------------------------------------------------

def lire_lexique():
    """Fréquences par lemme et par forme (occurrences par million, moyenne des
    films et des livres), et le lemme le plus courant de chaque forme."""
    par_lemme = collections.defaultdict(float)
    par_forme = collections.defaultdict(float)
    lemme_de = {}
    poids_lemme_de = {}
    vus = set()
    with open(SOURCES / "Lexique383.tsv", encoding="utf-8") as f:
        lecteur = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        entete = next(lecteur)
        i = {nom: n for n, nom in enumerate(entete)}
        for ligne in lecteur:
            lemme, categorie, forme = ligne[i["lemme"]], ligne[i["cgram"]], ligne[i["ortho"]]
            f_forme = (float(ligne[i["freqfilms2"]] or 0) + float(ligne[i["freqlivres"]] or 0)) / 2
            par_forme[forme] += f_forme
            if f_forme > poids_lemme_de.get(forme, -1):
                poids_lemme_de[forme] = f_forme
                lemme_de[forme] = lemme
            if (lemme, categorie) in vus:
                continue
            vus.add((lemme, categorie))
            par_lemme[lemme] += (float(ligne[i["freqlemfilms2"]] or 0)
                                 + float(ligne[i["freqlemlivres"]] or 0)) / 2
    return par_lemme, par_forme, lemme_de


def normal(mot):
    """La graphie de Lexique : apostrophe droite et ligatures défaites."""
    return (mot.replace("’", "'").replace("œ", "oe").replace("Œ", "Oe")
            .replace("æ", "ae").replace("Æ", "Ae"))


def jetons(texte):
    """Les mots d'une expression : « casser sa pipe » → 3 mots."""
    return [j for j in re.split(r"[\s'’\-,.;:!?«»()…]+", texte) if j]


# --- Les sections du Wiktionnaire ---------------------------------------------

def lire_sections():
    par_mot = collections.defaultdict(list)
    with open(SOURCES / "sections.jsonl", encoding="utf-8") as f:
        for ligne in f:
            s = json.loads(ligne)
            par_mot[s["m"]].append(s)
    return par_mot


def lire_courants():
    """mot → (nombre de sens courants, premier sens courant, rang de sa
    section dans la page) : les sections du Wiktionnaire qui n'ont rien
    d'argotique (extraire.py)."""
    courants = {}
    with open(SOURCES / "courants.tsv", encoding="utf-8") as f:
        for ligne in f:
            morceaux = ligne.rstrip("\n").split("\t")
            if len(morceaux) == 4:
                courants[morceaux[0]] = (int(morceaux[1]), morceaux[2], int(morceaux[3]))
    return courants


GENRES = {"m": "masculin", "f": "féminin", "mf": "masculin et féminin"}


def nature_de(section):
    """« Nom commun » + masculin → « nom masculin »."""
    titre = section["t"]
    genre = section.get("g", "")
    base = "nom" if titre == "Nom commun" else titre[0].lower() + titre[1:]
    if genre and titre in ("Nom commun", "Locution nominale"):
        base += " " + GENRES[genre]
    if "invariable" in section.get("gt", ()) and titre in ("Adjectif", "Nom commun"):
        base += " invariable"
    return base


ABREGES = [
    ("locution nominale", "loc. nom."), ("locution verbale", "loc. verb."),
    ("locution adverbiale", "loc. adv."), ("locution adjectivale", "loc. adj."),
    ("locution-phrase", "loc.-phrase"), ("locution interjective", "loc. interj."),
    ("locution prépositive", "loc. prép."), ("locution conjonctive", "loc. conj."),
    ("locution pronominale", "loc. pron."),
    ("nom masculin et féminin", "n. m. et f."), ("nom masculin", "n. m."),
    ("nom féminin", "n. f."), ("nom", "n."), ("adjectif", "adj."), ("verbe", "v."),
    ("adverbe", "adv."), ("interjection", "interj."), ("préposition", "prép."),
    ("conjonction", "conj."), ("pronom", "pron."), ("onomatopée", "onomat."),
    ("préfixe", "préf."), ("suffixe", "suff."), ("article", "art."),
    ("proverbe", "prov."),
]


def abrege(nature):
    for long_, court_ in ABREGES:
        if nature.startswith(long_):
            return court_
    return nature.split(" ")[0][:10]


# Les natures abrégées des dictionnaires anciens, en toutes lettres.
NATURES_ANCIENNES = [
    (r"^s\. m\. pl\.", "nom masculin pluriel"), (r"^s\. f\. pl\.", "nom féminin pluriel"),
    (r"^s\. m\.", "nom masculin"), (r"^s\. f\.", "nom féminin"), (r"^s\.", "nom"),
    (r"^v\. réfl\.", "verbe pronominal"), (r"^v\.", "verbe"),
    (r"^adj\.", "adjectif"), (r"^adv\.", "adverbe"), (r"^interj\.", "interjection"),
    (r"^(?:exp|expr)\.", "expression"),
]


def nature_ancienne(abreviation):
    a = abreviation.lower()
    for motif, nature in NATURES_ANCIENNES:
        if re.match(motif, a):
            return nature
    return ""


def etymologie(paragraphes, plafond):
    """Le premier paragraphe entier, les suivants tant qu'il reste de la place."""
    sortie = []
    total = 0
    for rang, texte in enumerate(paragraphes):
        if rang and total + len(texte) > plafond:
            break
        if len(texte) > plafond:
            coupe = texte[:plafond].rsplit(". ", 1)[0]
            if len(coupe) < plafond // 3:
                coupe = texte[:plafond].rsplit(" ", 1)[0]
            texte = coupe.rstrip(" ,;:") + " […]"
        sortie.append(texte)
        total += len(texte)
    return sortie


RE_NUMERO_DE_SENS = re.compile(r"^(?:#|\(|sens\s*)?(\d{1,2})\)?$", re.I)
TITRES_DE_RUBRIQUE = {"ou", "et", "locutions", "locutions nominales", "locutions verbales",
                      "mots", "divers", "plante", "autres", "composés", "dérivés"}


def precision_de(precision, champ):
    """Ce qui accompagne un mot lié, quand cela renseigne (voir Le Mot juste)."""
    if not precision:
        return ""
    numero = RE_NUMERO_DE_SENS.match(precision.strip())
    if numero:
        return "sens " + str(int(numero.group(1)))
    if precision.lower() in ("ou", "et", "d’où", "d'où"):
        return ""
    if champ in ("syn", "ant", "par"):
        return precision
    if not precision[0].islower() or precision.lower() in TITRES_DE_RUBRIQUE or len(precision) > 70:
        return ""
    return precision


def liens(liste, champ, inconnues):
    """`[mot, précision?, étiquettes?]`, sans champ vide en queue."""
    sortie = []
    for lien in liste:
        mot = lien[0]
        precision = precision_de(lien[1] if len(lien) > 1 else "", champ)
        marques = etiquettes.traduire_liste(lien[2] if len(lien) > 2 else (), inconnues)
        element = [mot]
        if precision or marques:
            element.append(precision)
        if marques:
            element.append(marques)
        sortie.append(element)
    return sortie[:PLAFONDS[champ]]


def reference_courte(reference):
    if len(reference) <= REFERENCE_MAX:
        return reference
    return reference[:REFERENCE_MAX].rsplit(" ", 1)[0].rstrip(",;:(") + "…"


RE_CODE_ARGOT = re.compile(r"\b(verlan|largonji|louch[eé]r?bem)\b", re.I)


def sens_gardes(section):
    """Les sens d'argot d'une section, sa table de renumérotation, et les sens
    courants qu'on laisse de côté.

    Quand le **premier** sens est d'argot, la section entière l'est : c'est le
    sens premier du mot, et les suivants en sont des extensions que le
    Wiktionnaire n'a pas toujours pris la peine de marquer (« flic » :
    « policier » est marqué, « représentant des forces de l'ordre » ne l'est
    pas). Quand le premier sens est courant (« cheval », l'animal), on ne
    garde que les sens marqués.

    Un sous-sens gardé dont le sens parent ne l'est pas remonte au premier
    rang : sa définition se lit seule."""
    if section["s"] and section["s"][0].get("a"):
        section = dict(section, s=[dict(s, a=1) for s in section["s"]])
    gardes = []
    table = {}              # numéro d'origine d'un sens principal → numéro affiché
    parent_garde = False
    courants = []
    numero_principal = 0
    nouveau_principal = 0
    for s in section["s"]:
        if not s.get("p"):
            numero_principal += 1
        if s.get("a"):
            nouveau = dict(s)
            if s.get("p") and not parent_garde:
                nouveau.pop("p", None)
            if not nouveau.get("p"):
                nouveau_principal += 1
                table.setdefault(numero_principal, nouveau_principal)
            gardes.append(nouveau)
        else:
            courants.append(s)
        if not s.get("p"):
            parent_garde = bool(s.get("a"))
    return gardes, table, courants


def sens(liste, regles, inconnues, code):
    sortie = []
    for rang, s in enumerate(liste[:regles["sens_max"]]):
        nouveau = {"d": s["d"]}
        if s.get("p"):
            nouveau["p"] = s["p"]
        brutes = list(s.get("r") or ())
        if code and not any(code in e.lower() for e in brutes):
            brutes.append("r:" + code)
        marques = etiquettes.traduire_liste(brutes, inconnues)
        if marques:
            nouveau["r"] = marques
        combien = regles["exemples"][rang] if rang < len(regles["exemples"]) else 0
        exemples = []
        candidats = s.get("x", ())
        for texte, marque, reference in candidats:
            if len(exemples) >= combien:
                break
            if len(re.findall(r"\w+", texte)) > regles["exemple_mots_max"] \
                    and (exemples or rang > 0 or len(candidats) > 1):
                continue
            exemple = [texte, marque]
            if reference:
                exemple.append(reference_courte(reference))
            exemples.append(exemple)
        if exemples:
            nouveau["x"] = exemples
        if s.get("n"):
            nouveau["n"] = s["n"]
        if s.get("v"):
            nouveau["v"] = s["v"]
        sortie.append(nouveau)
    return sortie


def formes_de(section, mot):
    """Les formes d'une lecture — la logique du Mot juste."""
    formes = []
    present = []
    for graphie, marques in section.get("f", ()):
        if section["n"] == "verb":
            ensemble = set(marques)
            if {"participle", "past"} <= ensemble and " " not in graphie:
                element = [graphie, "participe passé"]
            elif {"participle", "present"} <= ensemble and " " not in graphie:
                element = [graphie, "participe présent"]
            elif ensemble == {"indicative", "present"}:
                present.append(graphie)
                continue
            elif {"indicative", "past", "multiword-construction"} <= ensemble:
                auxiliaire = ("être" if re.match(r"^(je|j’|j')\s*suis\b", graphie)
                              else "avoir" if re.match(r"^(j’|j')ai\b", graphie) else "")
                if not auxiliaire:
                    continue
                element = [auxiliaire, "auxiliaire"]
            else:
                continue
            if element not in formes:
                formes.append(element)
            continue
        libelle = etiquettes.etiquette_de_forme(marques)
        element = [graphie, libelle] if libelle else [graphie]
        if graphie == mot or element in formes:
            continue
        formes.append(element)
    if len(present) == 6:
        formes.append([", ".join(present), "présent"])
    return formes[:8]


def court(texte, maximum):
    texte = re.sub(r"\s+", " ", texte).strip()
    if len(texte) <= maximum:
        return texte
    return texte[:maximum].rsplit(" ", 1)[0].rstrip(",;:(") + "…"


def entree_wiktionnaire(mot, sections, expression, inconnues):
    """L'entrée d'un mot d'argot du Wiktionnaire, ses liens encore bruts :
    `filtrer_liens()` les trie une fois toutes les vedettes connues."""
    regles = EXPRESSIONS if expression else MOTS
    entree = {"m": mot}
    etymologies = []
    lectures = []
    bruts = {"loc": [], "der": [], "prov": [], "rel": [], "hyper": [], "hypo": []}
    sens_courants = []
    categories = []
    premier_argot = None      # (rang de la section, rang du sens) du premier sens d'argot
    premier_courant = None    # … et du premier sens courant
    for section in sections:
        gardes, table, courants = sens_gardes(section)
        rang_section = section.get("o", 0)
        drapeaux = [bool(s.get("a")) for s in section["s"]]
        if drapeaux and drapeaux[0]:
            drapeaux = [True] * len(drapeaux)
        if True in drapeaux:
            position = (rang_section, drapeaux.index(True))
            premier_argot = position if premier_argot is None else min(premier_argot, position)
        if False in drapeaux:
            position = (rang_section, drapeaux.index(False))
            premier_courant = position if premier_courant is None else min(premier_courant, position)
        sens_courants.extend(courants)
        if not gardes:
            continue
        lecture = {"n": section["n"], "nat": nature_de(section)}
        if section.get("g"):
            lecture["g"] = section["g"]
        if section.get("api"):
            lecture["api"] = section["api"]
        code = ""
        if section.get("et"):
            texte = etymologie(section["et"], regles["etymologie_max"])
            if texte:
                if texte not in etymologies:
                    etymologies.append(texte)
                lecture["e"] = etymologies.index(texte)
            if section.get("ety"):
                m = RE_CODE_ARGOT.search(" ".join(section["et"]))
                if m:
                    code = m.group(1).lower().replace("loucherbem", "louchébem").replace("louchebem", "louchébem")
        if section.get("at"):
            lecture["at"] = section["at"]
        formes = formes_de(section, mot)
        if formes:
            lecture["f"] = formes
        lecture["s"] = sens(gardes, regles, inconnues, code)
        pure = not courants
        # Synonymes, contraires, paronymes. Dans une section toute d'argot, on
        # garde tout, en renumérotant les renvois aux sens. Dans une section
        # mixte (« cheval » : l'animal, et l'héroïne en argot), seulement ce
        # qui vise un sens gardé : « canasson » est un synonyme du cheval
        # animal, pas de l'héroïne.
        for champ in ("syn", "ant", "par"):
            if not section.get(champ):
                continue
            retenus = []
            for lien in liens(section[champ], champ, inconnues):
                precision = lien[1] if len(lien) > 1 else ""
                numero = re.match(r"^sens (\d+)$", precision or "")
                if numero:
                    n = int(numero.group(1))
                    if n not in table:
                        continue
                    lien = [lien[0], "sens " + str(table[n])] + lien[2:]
                elif not pure:
                    if not precision or not any(
                            g["d"].lower().startswith(precision.lower()[:24]) for g in gardes):
                        continue
                retenus.append(lien)
            if retenus:
                lecture[champ] = retenus
        if section.get("no"):
            lecture["no"] = section["no"]
        for c in section.get("cat", ()):
            if c not in categories:
                categories.append(c)
        lecture["_c"] = sorted({c for g in gardes for c in g.get("c", ())} | set(section.get("cat", ())))
        lecture["_r"] = sorted({e for g in gardes for e in g.get("r", ())})
        if code:
            lecture["_r"].append("r:" + code)
        lectures.append(lecture)
        for lien in section.get("der", ()):
            (bruts["loc"] if " " in lien[0] else bruts["der"]).append(lien)
        for champ in ("prov", "rel", "hyper", "hypo"):
            bruts[champ].extend(section.get(champ, ()))
    if not lectures:
        return None, None
    entree["l"] = lectures
    if etymologies:
        entree["et"] = etymologies
    if sens_courants:
        premier = next((s for s in sens_courants if not s.get("p")), sens_courants[0])
        entree["sc"] = court(premier["d"], SENS_COURANT_MAX)
        entree["nc"] = len(sens_courants)
        entree["_mx"] = 1
        if premier_courant is not None and premier_argot is not None and premier_courant < premier_argot:
            entree["sp"] = 1
    entree["_pa"] = premier_argot
    return entree, bruts


def filtrer_liens(entree, bruts, vedettes, inconnues):
    """Locutions, dérivés, apparentés : tous pour un mot tout d'argot. Quand les
    sens d'argot partagent leur section avec des sens courants (« cheval » :
    l'animal, puis l'héroïne), ces listes parlent surtout du sens courant —
    poulain, jument, galop. On n'en garde alors que les expressions qui sont
    elles-mêmes au dictionnaire (« cheval de retour », le récidiviste), et rien
    des dérivés ni du vocabulaire apparenté."""
    pur = not entree.pop("_mx", None)
    mot = entree["m"]
    for champ, liste in bruts.items():
        if not pur and champ not in ("loc", "prov"):
            continue
        vus = set()
        unique = []
        for lien in liste:
            if lien[0] in vus or lien[0] == mot:
                continue
            if not pur and lien[0] not in vedettes:
                continue
            vus.add(lien[0])
            unique.append(lien)
        # Ce qui a sa fiche d'abord : on veut pouvoir y aller.
        unique.sort(key=lambda l: 0 if l[0] in vedettes else 1)
        if unique:
            entree[champ] = liens(unique, champ, inconnues)


# --- Les dictionnaires anciens ---------------------------------------------------

def lire_anciens():
    articles = []
    with open(SOURCES / "anciens.jsonl", encoding="utf-8") as f:
        for ligne in f:
            articles.append(json.loads(ligne))
    return articles


def article_compact(a):
    """Ce que la fiche montre d'un article ancien."""
    sortie = {"v": a["v"], "p": a["p"]}
    if a.get("nat"):
        sortie["nat"] = a["nat"]
    if a.get("sup"):
        sortie["sup"] = 1
    if a.get("mil"):
        sortie["mil"] = a["mil"]
    if a.get("n"):
        sortie["n"] = 1
    if a.get("cr"):
        sortie["cr"] = a["cr"]
    return sortie


def blocs_anciens(articles):
    """Les articles d'une vedette, rangés par dictionnaire, dans l'ordre
    Delvau, Larchey, Virmaître."""
    par_source = collections.defaultdict(list)
    for a in articles:
        par_source[a["s"]].append(article_compact(a))
    return [{"s": s, "a": par_source[s]} for s in ORDRE_ANCIENS if s in par_source]


def lecture_ancienne(articles):
    """La lecture cachée d'un mot que seuls les anciens donnent : de quoi
    montrer une définition dans la liste des résultats et poser une question
    de révision. La fiche, elle, montre les articles."""
    vues = set()
    liste = []
    for source in ORDRE_ANCIENS:
        for a in articles:
            if a["s"] != source or not a.get("d"):
                continue
            k = cle(a["d"])[:28]
            if k in vues:
                continue
            vues.add(k)
            s = {"d": a["d"], "r": [SOURCES_ANCIENNES[source]["auteur"].split()[-1] + ", "
                                    + SOURCES_ANCIENNES[source]["annee"]]}
            if a.get("vr") and not a["d"]:
                s["v"] = a["vr"][:3]
            liste.append(s)
    if not liste:
        for a in articles:
            if a.get("vr"):
                liste.append({"d": "", "v": a["vr"][:3]})
                break
    if not liste:
        # Un article sans définition qu'on sache isoler : son début fera l'affaire.
        for a in articles:
            debut = court(re.sub(r"_", "", " ".join(a["p"])), 120)
            if debut:
                liste.append({"d": debut, "r": [SOURCES_ANCIENNES[a["s"]]["auteur"].split()[-1] + ", "
                                               + SOURCES_ANCIENNES[a["s"]]["annee"]]})
                break
    nature = ""
    for a in articles:
        if a.get("nat"):
            nature = nature_ancienne(a["nat"])
            if nature:
                break
    return {"n": "", "nat": nature, "s": liste[:4], "o": 1}


# --- Les thèmes -------------------------------------------------------------------

THEMES = [
    ("verlan", "Verlan et codes",
     "Les mots à l’envers et les argots à clef : verlan, louchébem, javanais, largonji."),
    ("internet", "Internet et SMS", "L’argot des écrans : forums, textos, réseaux, jeux vidéo."),
    ("armee", "Armée et troupiers", "L’argot des casernes, des tranchées et des marins."),
    ("ecoles", "Écoles et étudiants",
     "Lycées, facultés, Polytechnique, Arts et Métiers, Saint-Cyr, Normale sup."),
    ("pegre", "Pègre, police et prison",
     "L’argot des voleurs, des souteneurs, des tricheurs, des flics et des taulards."),
    ("spectacle", "Arts, lettres et spectacle",
     "Coulisses, ateliers d’artistes, salles de rédaction, bohème."),
    ("typo", "Typographes et imprimeurs", "L’argot, très riche, des ateliers d’imprimerie."),
    ("sport", "Sport, jeu et turf", "Stades, tapis verts, champs de courses."),
    ("sexe", "Amour et sexualité", "Tout ce qui se dit sous le manteau."),
    ("drogue", "Drogue", "Le vocabulaire des produits et de ceux qui en usent."),
    ("quebec", "Québec et Amérique du Nord", "Joual, sacres et parlers d’Acadie ou de Louisiane."),
    ("belgique", "Belgique et Suisse", "Le familier de Bruxelles, de Liège, de Genève ou de Lausanne."),
    ("afrique", "Afrique et outre-mer", "Nouchi, camfranglais, parlers du Maghreb et des îles."),
    ("regions", "Régions de France", "Marseille, Lyon, Lorraine, Bretagne, le Nord…"),
    ("europe", "Jargon européen", "Le jargon des institutions de l’Union européenne."),
    ("ancien", "Argot du XIXᵉ siècle",
     "Les mots de Delvau, Larchey et Virmaître : la langue verte de Paris."),
]

QUEBEC = {"Québec", "Canada", "Acadie", "Louisiane", "Missouri", "Montréal", "Joual",
          "Amérique du Nord", "Terre-Neuve", "Nouvelle-Angleterre", "Manitoba", "Ontario",
          "Saint-Pierre-et-Miquelon", "Nouveau-Brunswick"}
BELGIQUE = {"Belgique", "Bruxelles", "Suisse", "Vallée d’Aoste", "Wallonie", "Liège", "Genève",
            "Vaud", "Fribourg", "Valais", "Luxembourg", "Neuchâtel", "Jura"}
AFRIQUE = {"Afrique", "Côte d’Ivoire", "Cameroun", "Sénégal", "Algérie", "Maroc", "Tunisie",
           "Nouvelle-Calédonie", "La Réunion", "Réunion", "Antilles", "Guadeloupe", "Martinique",
           "Guyane", "Congo", "Congo-Kinshasa", "Congo-Brazzaville", "République démocratique du Congo",
           "Gabon", "Burkina Faso", "Mali", "Bénin", "Togo", "Niger", "Rwanda", "Burundi",
           "Madagascar", "Maurice", "Haïti", "Polynésie française", "Tahiti", "Djibouti", "Tchad",
           "Centrafrique", "Guinée", "Liban", "Mayotte", "Maghreb", "Afrique du Nord",
           "Afrique centrale", "Afrique de l’Ouest", "Pieds-noirs", "Seychelles", "Comores"}
REGIONS = {"Marseille", "Provence", "Lyonnais", "Lyon", "Lorraine", "Occitanie", "Normandie",
           "Bretagne", "Vosges", "Alsace", "Nord-Pas-de-Calais", "Picardie", "Nord de la France",
           "Savoie", "Auvergne", "Bourgogne", "Franche-Comté", "Languedoc", "Gascogne",
           "Pays basque", "Corse", "Champagne", "Berry", "Anjou", "Poitou", "Saintonge",
           "Touraine", "Limousin", "Dauphiné", "Midi", "Midi de la France", "Sud de la France",
           "Île-de-France", "Paris", "Nice", "Toulouse", "Bordeaux", "Lille", "Nantes",
           "Argot Marseille", "Argot lyonnais", "Argot parisien", "Ch’ti", "Rouergue", "Béarn",
           "Ardennes", "Morvan", "Vendée", "Charentes", "Aveyron", "Cévennes", "Gers", "Landes",
           "Lot", "Pays de Caux", "Tarn", "Var", "Bresse", "Lorraine romane", "Metz", "Nancy",
           "Grenoble", "Saint-Étienne", "Montpellier", "Toulon", "Perpignan", "Roussillon"}


def themes_du_sens(categories, brutes):
    """Les thèmes d'un sens du Wiktionnaire, d'après ses catégories d'argot et
    ses étiquettes brutes (`t:…`, `d:…`, `r:…`)."""
    t = set()
    c = " | ".join(categories)
    d = {e[2:] for e in brutes if e.startswith("d:")}
    r = {e[2:] for e in brutes if e.startswith("r:")}
    r_bas = " | ".join(x.lower() for x in r)
    if re.search(r"verlan|louch|javanais|largonji", c + " " + r_bas, re.I):
        t.add("verlan")
    if "Argot Internet" in c or "Argot des incels" in c or d & {"Internet", "SMS", "video-games"} \
            or r & {"Internet", "Jeux vidéo"}:
        t.add("internet")
    if "Argot militaire" in c or "Argot poilu" in c or d & {"military", "poilu", "army", "navy"} \
            or re.search(r"arm[ée]e|militaire|tranchées|marine de guerre|saint-cyrien|marins", r_bas):
        t.add("armee")
    if re.search(r"Argot scolaire|Argot polytechnicien|Arts et Métiers|université|école", c) \
            or d & {"school", "education", "polytechnicien", "Gadz'Arts"} \
            or re.search(r"école|estudiantin|grandes écoles|gadzarts|polytechnicien|normale", r_bas):
        t.add("ecoles")
    if re.search(r"Argot policier|Argot des voleurs", c) or d & {"police", "thieves"} \
            or re.search(r"carcéral|prison|pénitentiaire|gendarmerie|police|bagne|pègre|voleurs", r_bas):
        t.add("pegre")
    if d & {"theater", "film", "cinema", "music", "literature", "journalism", "performing-arts"}:
        t.add("spectacle")
    if "Argot des typographes" in c or d & {"typography", "printing"} or re.search(r"imprimerie|typograph", r_bas):
        t.add("typo")
    if d & {"sports", "soccer", "rugby", "cycling", "games", "horse-racing", "boxing", "gambling",
            "card-games", "poker"} or re.search(r"turf|sport", r_bas):
        t.add("sport")
    if "sexuality" in d:
        t.add("sexe")
    if re.search(r"drogue", r_bas):
        t.add("drogue")
    if r & QUEBEC:
        t.add("quebec")
    if r & BELGIQUE:
        t.add("belgique")
    if r & AFRIQUE:
        t.add("afrique")
    if r & REGIONS:
        t.add("regions")
    if "Union européenne" in c:
        t.add("europe")
    return t


def themes_de_l_article(article):
    """Les thèmes d'un article ancien, d'après les milieux qu'il nomme."""
    t = {"ancien"}
    for m in article.get("mil", ()):
        if re.search(r"voleurs|prisons?|bagne|escarpes|souteneurs|grecs|filles|breda|petites dames"
                     r"|classes dangereuses|pègre|police|agents|mouchards|recéleurs", m):
            t.add("pegre")
        if re.search(r"troupiers|soldats|militaires|caserne|armée|marins|zouaves|saint-cyriens"
                     r"|régiment|sous-officiers|cavaliers|artilleurs", m):
            t.add("armee")
        if re.search(r"écoles?|étudiants|collégiens|écoliers|polytechniciens|saint-cyriens|lycéens"
                     r"|normaliens|séminaires|élèves", m):
            t.add("ecoles")
        if re.search(r"coulisses|comédiens|cabotins|gens de lettres|journalistes|artistes|peintres"
                     r"|rapins|bohèmes|musiciens|théâtres?|académiciens|petits journalistes", m):
            t.add("spectacle")
        if re.search(r"typographes|imprimerie|imprimeurs", m):
            t.add("typo")
        if re.search(r"joueurs|turf|sportsmen|sport|courses|maquignons|jockeys", m):
            t.add("sport")
    return t


# --- Du français vers l'argot ------------------------------------------------------

RE_DETERMINANT = re.compile(r"^(?:le |la |les |l’|l'|un |une |des |du |de la |de l’|de l'|sa |son |ses )",
                            re.I)
TETES_GENERIQUES = {"personne", "homme", "femme", "individu", "fille", "garçon", "type", "enfant",
                    "chose", "objet", "gens", "état", "manière", "action", "fait"}
CONCEPTS_ECARTES = {"voir", "celui", "celle", "ceux", "chose", "fait", "action", "quelqu’un",
                    "quelqu'un", "quelque chose", "argot", "familier", "populaire", "id", "idem"}


def singulier(mot, lemme_de):
    """« jambes » → « jambe », « chevaux » → « cheval », « yeux » → « œil ».
    Seulement le pluriel : Lexique range « héroïne » sous « héros » et « folle »
    sous « fou », ce qui ferait de la drogue un personnage de roman."""
    if not mot.endswith(("s", "x")):
        return mot
    lemme = lemme_de.get(mot) or lemme_de.get(normal(mot))
    if not lemme:
        return mot
    candidats = {mot[:-1]}
    if mot.endswith("aux"):
        candidats |= {mot[:-3] + "al", mot[:-3] + "ail"}
    if mot == "yeux":
        candidats.add("œil")
    for candidat in candidats:
        if normal(candidat) == normal(lemme):
            return candidat
    return mot


def concepts(definition, par_forme, lemme_de):
    """Les mots français qu'une définition courte donne pour équivalents :
    « Policier, agent de police. » → policier, agent de police ; « Personne
    stupide. » → personne stupide, stupide. Une définition longue ne se prête
    pas à ce jeu : on n'en tire rien."""
    d = re.sub(r"\([^)]*\)|\[[^\]]*\]", "", definition or "").strip()
    d = d.replace("_", "")
    premiere = re.split(r"[.;:!?]|\s[—–]\s", d, maxsplit=1)[0].strip()
    if not premiere or len(premiere.split()) > 6:
        return []
    sortie = []
    for morceau in re.split(r",|\bou\b|\bet\b", premiere):
        m = RE_DETERMINANT.sub("", morceau.strip().lower()).strip(" ’'")
        mots = [x for x in re.split(r"\s+", m) if x]
        if not 1 <= len(mots) <= 3:
            continue
        pleins = [x for x in re.split(r"[\s’'\-]+", m) if x and x not in MOTS_OUTILS]
        if not pleins:
            continue
        if not all((par_forme.get(x) or par_forme.get(normal(x)) or 0) >= 0.3 for x in pleins):
            continue
        if len(mots) == 1:
            sortie.append(singulier(m, lemme_de))
        else:
            sortie.append(m)
            if len(mots) == 2 and mots[0] in TETES_GENERIQUES:
                sortie.append(singulier(mots[1], lemme_de))
    return [c for c in sortie if c not in CONCEPTS_ECARTES and len(c) > 1]


# --- Écriture ----------------------------------------------------------------------

def prefixe_commun(a, b):
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]:
        n += 1
    return n


def ecrire(chemin, texte):
    # LF seulement : un « \r » traînant rendrait des milliers de mots
    # introuvables, sans le moindre signal (vécu sur Wortschatz).
    with open(chemin, "w", encoding="utf-8", newline="") as f:
        f.write(texte)


def json_compact(objet):
    return json.dumps(objet, ensure_ascii=False, separators=(",", ":"))


def apercu(entree):
    """La première définition, courte, pour la liste des résultats."""
    for lecture in entree["l"]:
        for s in lecture["s"]:
            texte = re.sub(r"\s+", " ", s["d"] or "")
            if not texte and s.get("v"):
                texte = "→ " + ", ".join(s["v"])
            if len(texte) > APERCU_MAX:
                texte = texte[:APERCU_MAX].rsplit(" ", 1)[0].rstrip(",;:(") + "…"
            return texte.replace("\t", " ")
    return ""


def frequence_de(mot, expression, par_lemme, par_forme):
    if expression:
        morceaux = jetons(mot)
        if not morceaux:
            return 0.0
        valeurs = [par_forme.get(j.lower()) or par_forme.get(normal(j).lower()) or 0.0 for j in morceaux]
        return min(valeurs) / 15.0
    return par_lemme.get(mot) or par_lemme.get(normal(mot)) or par_lemme.get(mot.lower()) or 0.0


def marques_de(entree):
    return {m for l in entree["l"] for s in l["s"] for m in s.get("r", ())}


def construire(rapport):
    debut = time.time()
    par_lemme, par_forme, lemme_de = lire_lexique()
    print("Wiktionnaire…", flush=True)
    sections = lire_sections()
    courants = lire_courants()
    inconnues = collections.Counter()

    def rappeler_le_sens_courant(entree, premier_argot):
        """« lance » : l'arme, d'ordinaire ; en argot, la pluie. Le sens courant
        vient d'une autre section du même mot, que l'extraction n'a pas gardée.

        `sp` (« sens premier ») dit que ce sens courant vient avant l'argot dans
        la page : « lance » est un mot courant, qui a aussi un sens d'argot.
        « taule », non : c'est d'abord de l'argot, et la table de l'enclume
        n'est qu'un autre sens."""
        courant = courants.get(entree["m"])
        if not courant:
            return
        nombre, definition, rang = courant
        if "sc" not in entree and definition:
            entree["sc"] = court(definition, SENS_COURANT_MAX)
            entree["nc"] = nombre
            if premier_argot is None or (rang, 0) < premier_argot:
                entree["sp"] = 1
        elif "sc" in entree:
            entree["nc"] = entree.get("nc", 0) + nombre
            if premier_argot is not None and (rang, 0) < premier_argot:
                entree["sp"] = 1

    # 1. Les mots d'argot du Wiktionnaire.
    entrees = {}
    bruts_de = {}
    for mot, liste in sections.items():
        expression = " " in mot or any(s["t"].startswith(("Locution", "Proverbe")) for s in liste)
        entree, bruts = entree_wiktionnaire(mot, liste, expression, inconnues)
        if not entree:
            continue
        if expression:
            entree["x"] = 1
        rappeler_le_sens_courant(entree, entree.pop("_pa", None))
        entrees[mot] = entree
        bruts_de[mot] = bruts
    n_wiktionnaire = len(entrees)

    # 2. Les dictionnaires anciens : rattachés à la vedette du Wiktionnaire de
    #    même clé, ou à celle d'une de leurs variantes ; sinon, vedette à part.
    print("Dictionnaires anciens…", flush=True)
    articles = lire_anciens()
    par_cle_wikt = collections.defaultdict(list)
    for mot in entrees:
        par_cle_wikt[cle(mot)].append(mot)

    def cible_wiktionnaire(article):
        for forme in [article["m"]] + article.get("var", []):
            candidats = par_cle_wikt.get(cle(forme))
            if candidats:
                exact = [c for c in candidats if c.replace("'", "’") == forme]
                return exact[0] if exact else sorted(candidats, key=len)[0]
        return None

    rattaches = collections.defaultdict(list)
    orphelins = collections.defaultdict(list)
    variantes = collections.defaultdict(set)
    for a in articles:
        if not a["m"] or len(cle(a["m"])) < 1:
            continue
        cible = cible_wiktionnaire(a)
        if cible:
            rattaches[cible].append(a)
            for v in a.get("var", []):
                if cle(v) != cle(cible):
                    variantes[cible].add(v)
        else:
            orphelins[cle(a["m"])].append(a)
    for mot, liste in rattaches.items():
        entrees[mot]["anc"] = blocs_anciens(liste)
    n_rattaches = len(rattaches)

    # Une vedette par clé orpheline, sous la graphie la plus sûre : Larchey
    # imprime ses capitales accentuées, Delvau pas toujours.
    preference = {"larchey": 0, "virmaitre": 1, "delvau": 2}
    for k, liste in orphelins.items():
        liste.sort(key=lambda a: preference[a["s"]])
        mot = liste[0]["m"]
        if mot in entrees:
            mot = mot + " "     # garde-fou, ne devrait pas arriver
        entree = {"m": mot.strip(), "l": [lecture_ancienne(liste)], "anc": blocs_anciens(liste)}
        if " " in mot.strip():
            entree["x"] = 1
        rappeler_le_sens_courant(entree, None)
        entrees[entree["m"]] = entree
        for a in liste:
            for v in a.get("var", []):
                if cle(v) != k:
                    variantes[entree["m"]].add(v)
    n_anciens = len(orphelins)

    vedettes = set(entrees)
    for mot, bruts in bruts_de.items():
        filtrer_liens(entrees[mot], bruts, vedettes, inconnues)

    # 3. Bandes de fréquence et thèmes.
    themes = collections.defaultdict(set)
    for mot, e in entrees.items():
        ancien_seul = all(l.get("o") for l in e["l"])
        if ancien_seul:
            e["b"] = ANCIEN
        else:
            e["b"] = bande_de(frequence_de(mot, bool(e.get("x")), par_lemme, par_forme))
        ids = set()
        for l in e["l"]:
            if l.get("o"):
                continue
            ids |= themes_du_sens(l.get("_c", ()), l.get("_r", ()))
        for bloc in e.get("anc", ()):
            for a in bloc["a"]:
                ids |= themes_de_l_article(a)
        for i in ids:
            themes[i].add(mot)
        if ids:
            e["th"] = sorted(ids)
        for l in e["l"]:
            l.pop("_c", None)
            l.pop("_r", None)
            for s in l["s"]:
                if not s.get("r"):
                    s.pop("r", None)

    # 4. Du français vers l'argot. Chaque mot français garde la graphie sous
    #    laquelle les définitions l'écrivent le plus souvent : la clé est
    #    « tete », l'affichage « tête ».
    equivalents = collections.defaultdict(set)
    graphies = collections.defaultdict(collections.Counter)
    for mot, e in entrees.items():
        for l in e["l"]:
            for s in l["s"][:6]:
                for c in concepts(s.get("d", ""), par_forme, lemme_de):
                    if cle(c) != cle(mot):
                        equivalents[cle(c)].add(mot)
                        graphies[cle(c)][c] += 1

    # 5. Le socle : tout, s'il tient dans le budget ; sinon les plus courants.
    liste = list(entrees.values())
    liste.sort(key=lambda e: (e["b"], cle(e["m"])))
    socle, suite = [], []
    octets = 0
    for e in liste:
        taille = len(json_compact(e).encode("utf-8")) + 1
        if octets + taille <= SOCLE_OCTETS:
            socle.append(e)
            octets += taille
        else:
            suite.append(e)

    if DOSSIER.exists():
        shutil.rmtree(DOSSIER)
    DOSSIER.mkdir(parents=True)

    lignes_index = []
    fichiers = {"index": [], "socle": [], "suite": []}
    formes_du_lemme = set()
    for e in liste:
        for lecture in e["l"]:
            for forme in lecture.get("f", ()):
                formes_du_lemme.add((e["m"], forme[0]))
    numero = 0
    for groupe, lot_groupe in (("socle", socle), ("suite", suite)):
        lot_groupe.sort(key=lambda e: (cle(e["m"]), e["b"], e["m"]))
        for debut_lot in range(0, len(lot_groupe), TRANCHE):
            lot = lot_groupe[debut_lot:debut_lot + TRANCHE]
            nom_fichier = f"t-{numero:03d}.json"
            ecrire(DOSSIER / nom_fichier, json_compact({"format": FORMAT, "e": lot}))
            fichiers[groupe].append(f"dico/{nom_fichier}")
            for e in lot:
                nature = abrege(e["l"][0]["nat"]) if e["l"] and e["l"][0].get("nat") else ""
                # Le genre de la vedette : « a » argot ancien, « c » mot courant
                # qui a aussi un sens d'argot — les deux pour « femme », que
                # Delvau donne pour « femme de mauvaise vie » —, rien pour un
                # mot d'argot.
                genre = ("a" if e["b"] == ANCIEN else "") + ("c" if e.get("sp") else "")
                lignes_index.append((cle(e["m"]), e["b"], "\t".join(
                    [cle(e["m"]), e["m"], str(numero), str(e["b"]), nature, apercu(e), genre])))
            numero += 1
    lignes_index.sort(key=lambda l: (l[0], l[1]))
    ecrire(DOSSIER / "mots.idx", "\n".join(l[2] for l in lignes_index) + "\n")
    fichiers["index"].append("dico/mots.idx")

    # Les formes fléchies des vedettes, et les variantes des anciens.
    formes = collections.defaultdict(set)
    with open(SOURCES / "formes.tsv", encoding="utf-8") as f:
        for ligne in f:
            morceaux = ligne.rstrip("\n").split("\t")
            if len(morceaux) < 2:
                continue
            forme, lemme = morceaux[0], morceaux[1]
            if lemme not in vedettes or " " in forme or entrees[lemme].get("x"):
                continue
            if not (par_forme.get(forme) or par_forme.get(normal(forme))) \
                    and (lemme, forme) not in formes_du_lemme:
                continue
            k_forme, k_lemme = cle(forme), cle(lemme)
            if k_forme and k_forme != k_lemme:
                formes[k_forme].add(k_lemme)
    n_variantes = 0
    cles_vedettes = {cle(v) for v in vedettes}
    for mot, liste_v in variantes.items():
        for v in liste_v:
            k = cle(v)
            if k and k != cle(mot) and k not in cles_vedettes:
                formes[k].add(cle(mot))
                n_variantes += 1
    lignes_formes = []
    for k_forme in sorted(formes):
        codes = []
        for k_lemme in sorted(formes[k_forme]):
            n = prefixe_commun(k_forme, k_lemme)
            codes.append(f"{n},{k_lemme[n:]}")
        lignes_formes.append(k_forme + "\t" + "|".join(codes))
    ecrire(DOSSIER / "formes.idx", "\n".join(lignes_formes) + "\n")
    fichiers["index"].append("dico/formes.idx")

    # Les expressions par mot plein, et par le lemme de chacun.
    par_mot = collections.defaultdict(list)
    liste_expressions = [e for e in liste if e.get("x")]
    liste_expressions.sort(key=lambda e: (e["b"], len(e["m"]), e["m"]))
    for e in liste_expressions:
        cles = set()
        for jeton in jetons(e["m"]):
            k = cle(jeton)
            if len(k) < 2 or k in MOTS_OUTILS:
                continue
            cles.add(k)
            cles.update(formes.get(k, ()))
        for k in cles:
            if k not in MOTS_OUTILS:
                par_mot[k].append(e["m"])
    lignes_expr = [k + "\t" + "|".join(par_mot[k]) for k in sorted(par_mot)]
    ecrire(DOSSIER / "expressions.idx", "\n".join(lignes_expr) + "\n")
    fichiers["index"].append("dico/expressions.idx")

    # Du français vers l'argot : les plus courants en tête, les mots du XIXᵉ
    # siècle à la fin. Un mot courant qui a aussi un sens d'argot (« blé »,
    # « oseille ») recule d'une bande : Lexique mesure le blé qu'on moissonne,
    # pas celui qu'on dépense — mais « blé » ne doit pas passer derrière
    # « biffeton ».
    rang = {e["m"]: (2 if e["b"] == ANCIEN else 0, e["b"] + (1 if e.get("sp") else 0), len(e["m"]), e["m"])
            for e in liste}
    lignes_eq = []
    for k in sorted(equivalents):
        if not k or "\t" in k:
            continue
        mots = sorted(equivalents[k], key=lambda m: rang[m])[:80]
        affichage = graphies[k].most_common(1)[0][0]
        lignes_eq.append(k + "\t" + affichage + "\t" + "|".join(mots))
    ecrire(DOSSIER / "equivalents.idx", "\n".join(lignes_eq) + "\n")
    fichiers["index"].append("dico/equivalents.idx")

    # Les thèmes.
    sortie_themes = []
    for ident, nom, description in THEMES:
        # Les mots avant les expressions : « meuf », « keuf », « chelou » en
        # tête du verlan, plutôt que « ça comme ».
        mots = sorted(themes.get(ident, ()), key=lambda m: (rang[m][0] == 2, bool(entrees[m].get("x")),
                                                            rang[m][1], cle(m)))
        if len(mots) < 12:
            continue
        sortie_themes.append({"id": ident, "nom": nom, "desc": description, "mots": mots})
    ecrire(DOSSIER / "themes.json", json_compact({"format": FORMAT, "themes": sortie_themes}))
    fichiers["index"].append("dico/themes.json")

    def poids(liste_f):
        return sum((DONNEES / f).stat().st_size for f in liste_f)

    resume = {
        "entrees": len(liste),
        "mots": len(liste) - len(liste_expressions),
        "expressions": len(liste_expressions),
        "wiktionnaire": n_wiktionnaire,
        "anciens_seuls": n_anciens,
        "avec_anciens": n_rattaches + n_anciens,
        "formes": len(lignes_formes),
        "equivalents": len(lignes_eq),
        "socle_entrees": len(socle),
        "tranches": numero,
        "fichiers": fichiers,
        "octets": {g: poids(l) for g, l in fichiers.items()},
    }
    themes_manifeste = [{"id": t["id"], "nom": t["nom"], "desc": t["desc"], "n": len(t["mots"])}
                        for t in sortie_themes]

    rapport.append("── Dictionnaire ──")
    rapport.append(f"  {resume['entrees']} vedettes : {resume['mots']} mots, {resume['expressions']} expressions")
    rapport.append(f"  Wiktionnaire : {n_wiktionnaire} vedettes, dont {n_rattaches} avec un article ancien")
    rapport.append(f"  dictionnaires anciens seuls : {n_anciens} vedettes "
                   f"({len(articles)} articles en tout, {n_variantes} variantes indexées)")
    rapport.append(f"  socle : {len(socle)} vedettes, {len(fichiers['socle'])} tranches, "
                   f"{commun.humain(resume['octets']['socle'])} ; suite : {len(suite)} vedettes, "
                   f"{commun.humain(resume['octets']['suite'])}")
    rapport.append(f"  index : {commun.humain(resume['octets']['index'])} — {len(lignes_formes)} formes, "
                   f"{len(lignes_expr)} mots d'expressions, {len(lignes_eq)} mots français → argot")
    bandes = collections.Counter(e["b"] for e in liste)
    rapport.append("  bandes : " + ", ".join(f"{LIBELLES_BANDES[b]}={bandes[b]}" for b in sorted(bandes)))
    rapport.append("  thèmes : " + ", ".join(f"{t['nom']} {len(t['mots'])}" for t in sortie_themes))
    if inconnues:
        rapport.append("  étiquettes non traduites (les plus fréquentes) : " + ", ".join(
            f"{k}×{n}" for k, n in inconnues.most_common(25)))
    rapport.append(f"  construit en {time.time() - debut:.0f} s")
    print("\n".join(rapport[-9:]), flush=True)
    return resume, liste, themes_manifeste


# Des racines crues que les marques d'usage ne signalent pas toujours
# (« donner le feu au cul » n'est pas marqué vulgaire) : l'accueil s'en passe.
RE_CRU = re.compile(r"\b(cul|culs|bite|bites|couille|couilles|chier|chie|merde|baiser|baise|pute|putes"
                    r"|enculé|enculer|con|conne|cons|foutre|nichon|nichons|zob|queue|chatte|branler"
                    r"|pisser|pisse|gerber|bordel|salope|pédé|nègre|youpin|bougnoule)\b", re.I)


# Et ce dont parlent les définitions : ce qui est sexuel, ce qui vise une
# origine, une religion, une orientation ou un handicap, la drogue.
RE_SENSIBLE = re.compile(r"pénis|vagin|sexe|sexuel|verge\b|chibre|sperme|anus|emmerd|testicul|burnes"
                         r"|seins?\b|fesses?\b|masturb|coït|copul|sodom|prostitu|proxénète"
                         r"|excrément|étron|homosexu|lesbienne|juif|juive|arabe|\bnoire?s?\b|nègre|immigr"
                         r"|handicap|attardé|putain|drogue|héroïne|cocaïne|cannabis|haschich|incel"
                         r"|femme facile|de mauvaise vie", re.I)


# Et leurs dérivés, où la racine est prise dans le mot : « démerde »,
# « emmerdeur », « couillon ».
RE_RACINES_CRUES = re.compile(r"merd|couill|encul|branl|foutr|chiass|niqu", re.I)


def ecarte_de_l_accueil(e):
    textes = [e["m"]] + [s.get("d", "") for l in e["l"] for s in l["s"][:3]]
    return RE_RACINES_CRUES.search(e["m"]) or any(RE_CRU.search(t) or RE_SENSIBLE.search(t) for t in textes)


def pour_l_accueil(e):
    """Un mot qu'on peut montrer sans qu'on l'ait demandé."""
    if e.get("sp") or e["b"] == ANCIEN or e.get("x"):
        return False
    if marques_de(e) & MARQUES_ECARTEES_DE_L_ACCUEIL or ecarte_de_l_accueil(e):
        return False
    if "sexe" in e.get("th", ()) or "drogue" in e.get("th", ()):
        return False
    return e["m"].islower() and len(e["m"]) >= 4


def mots_du_jour(entrees):
    """Des mots d'argot qui valent d'être découverts : une étymologie, un
    exemple, rien de grossier, et au moins un sens marqué « argot »."""
    retenus = []
    renvoi = re.compile(r"^(Variante|Autre (?:forme|orthographe)|Forme|Pluriel|Féminin|Masculin|Graphie"
                        r"|Abréviation|Apocope|Aphérèse|Diminutif|Synonyme)\b|^Voir\b", re.I)
    for e in entrees:
        if not pour_l_accueil(e) or e["b"] not in (1, 2, 3) or "et" not in e:
            continue
        # Pas une simple variante (« flousse : variante de flouze ») : le mot
        # du jour doit se suffire à lui-même.
        if renvoi.search(e["l"][0]["s"][0].get("d", "")) or renvoi.search(e["et"][0][0]):
            continue
        tous_sens = [s for l in e["l"] for s in l["s"]]
        if not any("x" in s for s in tous_sens):
            continue
        if not any("argot" in s.get("r", ()) for s in tous_sens):
            continue
        retenus.append(e["m"])
    retenus.sort(key=cle)
    return retenus


MARQUES_FRANCHES = {"argot", "verlan", "populaire", "louchébem", "largonji"}


def franc(e):
    """Un mot d'argot franc : son premier sens porte l'argot, le verlan ou le
    populaire — pas seulement le familier, qui ferait suggérer « cheminot »."""
    premier = e["l"][0]["s"][0] if e["l"] and e["l"][0]["s"] else {}
    marques = set(premier.get("r", ()))
    return bool(marques & MARQUES_FRANCHES) or any(m.startswith("argot ") for m in marques)


def suggestions(entrees):
    """Ce que l'accueil propose d'essayer : courant, franc, sans rien de grossier."""
    mots = [e["m"] for e in entrees if pour_l_accueil(e) and e["b"] in (0, 1, 2) and franc(e)]
    # Une expression « populaire » est souvent banale (« tout ça », « il y a
    # de ça ») : on n'en suggère que d'argotiques.
    expressions = [e["m"] for e in entrees if e.get("x") and e["b"] in (0, 1, 2) and not e.get("sp")
                   and "argot" in marques_de(e) and len(e["m"].split()) >= 2
                   and not ecarte_de_l_accueil(e) and not (marques_de(e) & MARQUES_ECARTEES_DE_L_ACCUEIL)
                   and "sexe" not in e.get("th", ()) and len(e["m"]) <= 30]
    return sorted(mots, key=cle), sorted(expressions, key=cle)


def main():
    debut = time.time()
    rapport = [f"Construction du {datetime.date.today().isoformat()}"]
    resume, entrees, themes = construire(rapport)
    du_jour = mots_du_jour(entrees)
    mots, expressions = suggestions(entrees)
    rapport.append(f"  {len(du_jour)} mots du jour possibles, {len(mots)} mots et "
                   f"{len(expressions)} expressions à suggérer")
    # La mouture nomme le cache des données sur l'appareil. La date seule ne
    # suffit pas : deux constructions le même jour porteraient le même nom, et
    # un téléphone garderait des tranches d'avant sous un index d'après. Une
    # empreinte du contenu les distingue.
    empreinte = hashlib.sha1()
    for groupe in ("index", "socle", "suite"):
        for f in resume["fichiers"][groupe]:
            empreinte.update(f.encode("utf-8"))
            empreinte.update((DONNEES / f).read_bytes())
    aujourd_hui = datetime.date.today().isoformat()
    manifeste = {
        "format": FORMAT,
        "construit": aujourd_hui,
        "mouture": aujourd_hui + "-" + empreinte.hexdigest()[:8],
        "sources": {
            "wiktionnaire": "Wiktionnaire, extraction wiktextract publiée par kaikki.org",
            "lexique": "Lexique 3.83",
            "anciens": SOURCES_ANCIENNES,
        },
        "bandes": LIBELLES_BANDES,
        "dico": resume,
        "themes": themes,
        "du_jour": du_jour,
        "suggestions": {"mots": mots, "expressions": expressions},
    }
    ecrire(DONNEES / "manifeste.json", json.dumps(manifeste, ensure_ascii=False, indent=1))
    rapport.append(f"Total {time.time() - debut:.0f} s")
    ecrire(RAPPORT, "\n".join(rapport) + "\n")
    print(rapport[-2])
    print(rapport[-1])


if __name__ == "__main__":
    sys.exit(main())
