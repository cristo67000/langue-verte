#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Les trois dictionnaires d'argot du XIXᵉ siècle, article par article.

── Les sources ─────────────────────────────────────────────────────────────

  Delvau      Dictionnaire de la langue verte, éd. de 1883 « augmentée d'un
              supplément par Gustave Fustier » — Project Gutenberg n° 54482,
              texte relu par les Distributed Proofreaders.
  Larchey     Dictionnaire historique d'argot, 9ᵉ éd., 1881 — Wikisource,
              558 pages toutes corrigées.
  Virmaître   Dictionnaire d'argot fin-de-siècle, 1894 — Project Gutenberg
              n° 57656.

Tous trois sont dans le domaine public (Delvau † 1867, Fustier † 1916,
Larchey † 1902, Virmaître † 1903).

── Ce que ce fichier produit ──────────────────────────────────────────────

`sources/anciens.jsonl`, un article par ligne :

  s     la source : "delvau", "larchey", "virmaitre"
  sup   1 si l'article vient du supplément (Fustier pour Delvau)
  v     la vedette telle qu'imprimée, en minuscules : « abattre (en) »
  m     la vedette remise dans l'ordre et l'orthographe d'aujourd'hui :
        « en abattre », « abbaye de monte-à-regret »
  var   ses variantes : « abattis » pour « abatis »
  nat   la nature telle qu'abrégée par l'auteur : « s. m. », « v. a. »
  p     les paragraphes de l'article ; l'italique est entre `_…_`
  d     une définition courte, tirée du début de l'article
  mil   les milieux dont l'article dit que le mot vient : « argot des voleurs »
  vr    les renvois « V. … » vers d'autres articles
  n     Virmaître : 1 si l'auteur donne l'expression pour nouvelle

Rien n'est réécrit : on défait les conventions de saisie (« -- » pour le
tiret, les modèles de Wikisource), on recolle les pages, on découpe.

Usage :
    python build/anciens.py
"""

import collections
import json
import re
import sys
from pathlib import Path

import commun
from commun import cle

RACINE = Path(__file__).resolve().parent
SOURCES = RACINE / "sources"
SORTIE = SOURCES / "anciens.jsonl"

MAJ = "A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇŒÆ"
ESPACE_INSECABLE = chr(0xA0)

# --- Nettoyages communs -------------------------------------------------------

LIGATURES = {
    "coeur": "cœur", "soeur": "sœur", "oeil": "œil", "oeuf": "œuf", "oeufs": "œufs",
    "oeuvre": "œuvre", "oeuvres": "œuvres", "boeuf": "bœuf", "boeufs": "bœufs",
    "noeud": "nœud", "noeuds": "nœuds", "voeu": "vœu", "voeux": "vœux", "moeurs": "mœurs",
    "choeur": "chœur", "manoeuvre": "manœuvre", "manoeuvres": "manœuvres",
    "oeillet": "œillet", "oeillade": "œillade", "rancoeur": "rancœur", "coeurs": "cœurs",
    "soeurs": "sœurs", "oesophage": "œsophage", "oedème": "œdème",
}
RE_LIGATURES = re.compile(r"\b(" + "|".join(LIGATURES) + r")\b", re.I)


def ligatures(texte):
    """« OEil », « coeur » → « Œil », « cœur », en gardant la casse."""
    def remplacer(m):
        mot = m.group(1)
        juste = LIGATURES[mot.lower()]
        if mot.isupper():
            return juste.upper()
        if mot[0].isupper():
            return juste[0].upper() + juste[1:]
        return juste
    return RE_LIGATURES.sub(remplacer, texte)


def typographie(texte):
    """Les conventions de saisie du Project Gutenberg défaites : « -- » est un
    tiret cadratin, les guillemets prennent leurs espaces, l'apostrophe devient
    typographique."""
    texte = texte.replace("--", " — ")
    texte = re.sub(r"(?<=\w)'(?=\w)", "’", texte)
    texte = re.sub(r"«\s*", "«" + ESPACE_INSECABLE, texte)
    texte = re.sub(r"\s*»", ESPACE_INSECABLE + "»", texte)
    texte = re.sub(r"[ \t]+", " ", texte)
    texte = re.sub(r" *\n *", "\n", texte)
    texte = re.sub(r" ([,.])", r"\1", texte)
    texte = re.sub(r"— ?— ?", "— ", texte)
    return ligatures(texte.strip())


def paragraphe(lignes):
    """Des lignes de texte en un paragraphe. Les vers — lignes indentées —
    gardent leurs retours à la ligne ; la prose est recollée."""
    sortie = []
    for ligne in lignes:
        if not ligne.strip():
            continue
        vers = ligne.startswith("    ")
        if sortie and not vers and not sortie[-1].endswith("\n"):
            sortie[-1] += " " + ligne.strip()
        elif vers:
            if sortie and not sortie[-1].endswith("\n"):
                sortie[-1] += "\n"
            sortie.append(ligne.strip() + "\n")
        else:
            sortie.append(ligne.strip())
    return "".join(sortie).strip()


# --- La vedette remise en ordre ----------------------------------------------

# « A » capitale sans accent : « MONTE-A-REGRET » est « monte-à-regret »,
# mais « IL Y A » reste « il y a ».
AVANT_LE_VERBE = {"il", "elle", "on", "y", "qui", "ça", "ca", "cela", "ce", "n", "l", "m", "t", "s",
                  "n’", "l’", "m’", "t’", "s’", "n'", "l'", "m'", "t'", "s'"}


def minuscules(vedette):
    """La vedette imprimée en capitales, remise en minuscules : « ABBAYE DE
    MONTE-A-REGRET » → « abbaye de monte-à-regret »."""
    texte = ligatures(vedette.lower().replace("'", "’"))
    morceaux = re.split(r"([ \-]+)", texte)
    for i, m in enumerate(morceaux):
        if m == "a":
            precedent = ""
            for j in range(i - 1, -1, -1):
                if morceaux[j].strip(" -"):
                    precedent = morceaux[j]
                    break
            if precedent.rstrip("’'") + ("’" if precedent.endswith(("’", "'")) else "") not in AVANT_LE_VERBE \
                    and precedent not in AVANT_LE_VERBE:
                morceaux[i] = "à"
    return "".join(morceaux).strip()


def en_ordre(vedette, complement):
    """La vedette et ce que l'auteur a mis entre parenthèses, dans l'ordre où
    on les dit : « ABATTRE (En) » → « en abattre », « ZINC (sur le) » → « sur
    le zinc », « ABRUTIR SUR (S') » → « s’abrutir sur »."""
    base = minuscules(vedette)
    if not complement:
        return base
    devant = complement.strip().lower().replace("'", "’")
    devant = re.sub(r"\s+", " ", devant)
    # « (page 119) », « (Idem) », « (1ʳᵉ, 2ᵉ…) » : des renvois, pas des mots.
    if devant.startswith(("argot", "page", "id")) or re.search(r"\d", devant) or len(devant) > 40:
        return base
    if devant.endswith("’"):
        return devant + base
    return devant + " " + base


def vedette_propre(m):
    """La forme qu'on range : sans « ! » ni « ? » final, points de suspension
    typographiques."""
    m = m.replace("...", "…").strip()
    m = re.sub(r"\s*[!?]+$", "", m)
    m = re.sub(r"\s+", " ", m).strip(" ,.;:")
    return m


# --- Milieux, renvois, définition courte ---------------------------------------

RE_MILIEU = re.compile(
    r"\bargot\s+(du|des|de la|de l’|de l'|d’|de)\s*"
    r"([A-Za-zÀ-ÿŒœ’'\-]+(?:\s+(?:de|des|du|d’)\s*[A-Za-zÀ-ÿŒœ’'\-]+)?)", re.I)

MOTS_VIDES_MILIEU = {"même", "meme", "ce", "cet", "cette", "son", "leur", "tout", "un", "une"}
# « argot des petites dames » : l'adjectif appelle son nom.
RE_ADJECTIF_MILIEU = re.compile(r"\b(petites|petits|vieux|vieilles|jeunes|gros|grands|bons|mauvais)\s+(\w+)",
                                re.I)


def milieux(texte):
    sortie = []
    texte = texte.replace("\n", " ")
    texte = RE_ADJECTIF_MILIEU.sub(lambda m: m.group(1) + "-" + m.group(2), texte)
    for article, qui in RE_MILIEU.findall(texte):
        qui = qui.strip("’'- ").lower().replace("-", " ") if re.match(
            r"(petites|petits|vieux|vieilles|jeunes|gros|grands|bons|mauvais)-", qui, re.I) \
            else qui.strip("’'- ").lower()
        if not qui or qui in MOTS_VIDES_MILIEU or qui.split()[0] in MOTS_VIDES_MILIEU:
            continue
        article = article.lower().replace("'", "’")
        libelle = "argot " + (article + qui if article.endswith("’") else article + " " + qui)
        if libelle not in sortie:
            sortie.append(libelle)
    return sortie[:4]


def sans_italique(texte):
    return texte.replace("_", "")


def court(texte, maximum=160):
    texte = re.sub(r"\s+", " ", sans_italique(texte)).strip()
    if len(texte) <= maximum:
        return texte
    return texte[:maximum].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def premiere_phrase(texte):
    """Jusqu'au premier point qui termine une phrase (pas celui de « M. »)."""
    m = re.search(r"(?<![A-ZÀ-Ý])(?<!\bM)(?<!\bMme)(?<!\bV)\.(\s|$)", texte)
    return texte[:m.start()] if m else texte


RE_SIGNIFIER = re.compile(r"(?:pour signifier|qui signifie|pour dire|qui veut dire|signifiant)\s*:\s*", re.I)
RE_IDEM = re.compile(r"^\(?\s*(?:idem|id)\s*\.?\s*\)?\.?$", re.I)


def resumer(premier, source):
    """La définition courte d'un article, d'après sa première phrase — la
    manière de chaque auteur diffère."""
    if source == "larchey" and premier.startswith("«"):
        fin = premier.find("»")
        return court(premier[1:fin if fin > 0 else None].strip(), 160)
    if source == "virmaitre" and re.match(r"^V\.\s*_", premier):
        return ""
    if source == "larchey":
        tranche = re.split(r"\s—\s|\s«", premier, maxsplit=1)[0]
        tranche = re.sub(r"\s*\((?:[^()]|\([^)]*\))*\)\s*\.?\s*$", "", tranche)
    elif source == "virmaitre":
        tranche = re.split(r"\s—|\(Argot", premier, maxsplit=1)[0]
    else:
        tranche = re.split(r"\s—\s", premier, maxsplit=1)[0]
    m = RE_SIGNIFIER.search(tranche)
    if m:
        tranche = tranche[m.end():]
    return court(premiere_phrase(tranche).rstrip(" ,;:"))


def completer(articles, source):
    """Les définitions courtes, avec leurs deux cas particuliers : l'article qui
    renvoie au précédent (« (Idem.) ») et celui dont la définition commence au
    paragraphe suivant."""
    precedent = ""
    for a in articles:
        d = resumer(a["p"][0], source)
        if RE_IDEM.match(d) or RE_IDEM.match(a["p"][0].strip()):
            d = precedent
        if not d and len(a["p"]) > 1 and not a.get("vr"):
            d = resumer(a["p"][1], source)
        a["d"] = d
        if d:
            precedent = d


# --- Delvau ----------------------------------------------------------------------

RE_CAT = re.compile(
    r"^((?:s|v|adj|Adj|adv|Adv|interj|Interj|prép|pron|conj|exp|Exp|expr|Expr|loc|part|art|subst)\."
    r"(?:\s+(?:et\s+)?(?:m|f|pl|a|n|réfl|pr|s|adj|v|pron|adv|subst|interj)\.)*)\s*")
RE_MOT_MAJ = re.compile(r"[" + MAJ + r"0-9][" + MAJ + r"0-9'’\-]*(?:\.\.\.)?")


def tete_capitales(texte):
    """Lit en tête de paragraphe une vedette en capitales, ses variantes, son
    complément et sa nature. Rend None si le paragraphe n'ouvre pas un article.

    Formes rencontrées : « ABADIE, s. f. Foule », « ABATTRE (En). Travailler »,
    « ABLOQUER ou ABLOQUIR, v. n. », « BANCO! Exclamation », « FIGURE s. f. »,
    « FORT POUR... (Être). », « DIABLE EN PRENDRAIT LES ARMES! (Le) Expression ».
    """
    position = 0
    mots = []
    variantes = []
    courant = mots
    while True:
        m = RE_MOT_MAJ.match(texte, position)
        if not m:
            break
        mot = m.group(0)
        courant.append(mot)
        position = m.end()
        suite = re.match(r"\s+ou\s+(?=[" + MAJ + r"])", texte[position:])
        if suite:
            courant = []
            variantes.append(courant)
            position += suite.end()
            continue
        espace = re.match(r" (?=[" + MAJ + r"0-9])", texte[position:])
        if espace:
            position += 1
            continue
        break
    lettres = sum(len(re.sub(r"[^" + MAJ + r"]", "", x)) for x in mots)
    if not mots or lettres < 2:
        return None
    if len(mots) == 1 and len(mots[0]) == 1:
        return None
    vedette = " ".join(mots)
    reste = texte[position:]
    complement = ""
    m = re.match(r"\s*\(([^)]{1,60})\)", reste)
    if m:
        complement = m.group(1)
        reste = reste[m.end():]
    exclamation = ""
    m = re.match(r"\s*([!?])", reste)
    if m:
        exclamation = m.group(1)
        reste = reste[m.end():]
        m = re.match(r"\s*\(([^)]{1,30})\)", reste)
        if m and not complement:
            complement = m.group(1)
            reste = reste[m.end():]
    m = re.match(r"\s*([,.])\s+", reste)
    if m:
        reste = reste[m.end():]
    elif not exclamation:
        # Sans ponctuation, il faut au moins une nature : « FIGURE s. f. ».
        if not RE_CAT.match(reste.lstrip()):
            return None
    reste = reste.lstrip()
    nature = ""
    m = RE_CAT.match(reste)
    if m:
        nature = m.group(1)
        reste = reste[m.end():]
    return {
        "imprime": vedette + (" (" + complement + ")" if complement else "") + exclamation,
        "vedette": vedette,
        "complement": complement,
        "variantes": [" ".join(v) for v in variantes if v],
        "nature": nature,
        "texte": reste,
    }


def delvau():
    texte = (SOURCES / "delvau-1883.txt").read_text(encoding="utf-8").replace("\r", "")
    debut = texte.find("\nA\n\n\nABADIE")
    fin = texte.find("*** END")
    corps = texte[debut:fin]
    corps = re.sub(r"</?sc>", "", corps)
    articles = []
    courant = None
    supplement = 0
    for bloc in re.split(r"\n[ \t]*\n", corps):
        lignes = bloc.split("\n")
        brut = paragraphe(lignes)
        if not brut:
            continue
        if brut == "SUPPLÉMENT":
            supplement = 1
            courant = None
            continue
        if re.fullmatch(r"[" + MAJ + r"]", brut):
            continue                       # lettrine
        if brut.startswith("ÉVREUX") or "IMPRIMERIE" in brut[:80]:
            break                          # l'achevé d'imprimer
        tete = tete_capitales(brut)
        if tete:
            courant = {
                "s": "delvau", "sup": supplement,
                "v": minuscules(tete["imprime"]),
                "m": vedette_propre(en_ordre(tete["vedette"], tete["complement"])),
                "var": [vedette_propre(minuscules(v)) for v in tete["variantes"]],
                "nat": tete["nature"],
                "p": [typographie(tete["texte"])],
            }
            articles.append(courant)
        elif courant is not None:
            courant["p"].append(typographie(brut))
    for a in articles:
        a["mil"] = milieux(" ".join(a["p"]))
        a["vr"] = renvois(" ".join(a["p"]))
    completer(articles, "delvau")
    return articles


def renvois(texte):
    """« V. _Revers_ », « (V. _Revers_.) » : les articles vers lesquels
    l'auteur renvoie."""
    sortie = []
    for m in re.finditer(r"\bV\.\s*_([^_]{2,60})_", texte):
        cible = m.group(1).strip(" .,;:")
        cible = re.sub(r"\s*\(.*$", "", cible)
        if cible and cible.lower() not in (x.lower() for x in sortie):
            sortie.append(cible.lower())
    return sortie[:6]


# --- Virmaître -------------------------------------------------------------------

RE_GRAS = re.compile(r"=([^=\n]{1,120})=")


def virmaitre():
    texte = (SOURCES / "virmaitre-1894.txt").read_text(encoding="utf-8").replace("\r", "")
    debut = texte.find("\nA\n\n\n=ABATTRE=")
    fin = texte.find("\nFIN\n", debut)
    corps = texte[debut:fin]
    articles = []
    courant = None
    supplement = 0
    sauter = False
    blocs = [paragraphe(b.split("\n")) for b in re.split(r"\n[ \t]*\n", corps)]
    blocs = [b for b in blocs if b]
    # Deux accidents de transcription : une vedette coupée en deux paragraphes
    # (« =JOUER À LA MAIN= » puis « =CHAUDE=: Être guillotiné ») ; et un gras
    # en minuscules, qui n'est pas une vedette mais une enseigne citée dans
    # l'article précédent (« =Au Juge de Paix= »).
    recolles = []
    for b in blocs:
        if recolles and re.fullmatch(r"=[^=\na-zà-ÿ]+=", recolles[-1]) and b.startswith("="):
            recolles[-1] = "=" + recolles[-1].strip("=") + " " + b[1:]
        else:
            recolles.append(b)
    for brut in recolles:
        if brut.startswith("=") and re.match(r"=[^=]*[a-zà-ÿ][^=]*=", brut) \
                and not brut.startswith("=V.="):
            brut = RE_GRAS.sub(lambda m: m.group(1), brut, count=1)
        if brut == "PETIT SUPPLÉMENT":
            supplement = 1
            courant = None
            sauter = True
            continue
        if re.fullmatch(r"[" + MAJ + r"]", brut):
            sauter = False
            continue
        if sauter:
            continue
        if brut.startswith("="):
            m = RE_GRAS.match(brut)
            if m and m.group(1).strip() != "V.":
                vedette = m.group(1).strip()
                reste = brut[m.end():]
                variantes = []
                while True:
                    v = re.match(r"\s*(?:,\s*ou|,|ou|pour)\s+=([^=\n]{1,80})=", reste)
                    if not v:
                        break
                    variantes.append(v.group(1).strip(" :."))
                    reste = reste[v.end():]
                reste = re.sub(r"^\s*et non _[^_]+_", "", reste)
                reste = re.sub(r"^\s*pour _[^_]+_", "", reste)
                complement = ""
                dedans = re.match(r"^(.*?)\s*\(([^)]{1,40})\)\s*[:.]?$", vedette)
                if dedans:
                    # « =FAIRE LA PAIRE (SE)= » : le complément est dans le gras.
                    vedette, complement = dedans.group(1), dedans.group(2)
                c = re.match(r"\s*\(([^)]{1,60})\)", reste)
                if c and not complement and not c.group(1).lower().startswith("argot"):
                    complement = c.group(1)
                    reste = reste[c.end():]
                reste = re.sub(r"^\s*[:.]\s*", "", reste)
                vedette = vedette.rstrip(" :.")
                courant = {
                    "s": "virmaitre", "sup": supplement,
                    "v": minuscules(vedette + (" (" + complement + ")" if complement else "")),
                    "m": vedette_propre(en_ordre(vedette, complement)),
                    "var": [vedette_propre(minuscules(v)) for v in variantes],
                    "nat": "",
                    "p": [reste.strip()],
                }
                articles.append(courant)
                continue
        if courant is not None:
            courant["p"].append(brut)
    for a in articles:
        tout = " ".join(a["p"])
        a["n"] = 1 if re.search(r"_N\._", tout) else 0
        credits = []
        if re.search(r"_L\.\s?L\._", tout):
            credits.append("Larchey")
        if re.search(r"_A\.\s?D\._", tout):
            credits.append("Delvau")
        if credits:
            a["cr"] = credits
        propres = []
        for p in a["p"]:
            p = re.sub(r"\s*_(?:N|L\.\s?L|A\.\s?D)\._\s*", " ", p)
            p = p.replace("=V.=", "V.")
            p = RE_GRAS.sub(lambda m: m.group(1), p)
            p = typographie(p)
            if p:
                propres.append(p)
        a["p"] = propres or [""]
        a["mil"] = milieux(tout)
        a["vr"] = renvois(" ".join(a["p"]))
    completer(articles, "virmaitre")
    return articles


# --- Larchey (Wikisource) ----------------------------------------------------------

SIECLES = {"i": "Iᵉʳ"}


def siecle(romain):
    romain = romain.strip()
    return (romain.upper() + ("ᵉʳ" if romain.lower() == "i" else "ᵉ")) + " siècle"


def modele(m):
    """Un modèle de Wikisource rendu en texte."""
    nom = m.group(1).strip()
    arguments = [a for a in m.group(2).split("|")[1:]] if m.group(2) else []
    positionnels = [a for a in arguments if "=" not in a]
    if nom in ("tiret",):
        return "".join(positionnels[:2])
    if nom in ("tiret2", "PetitTitre", "séparateur", "em", "pg", "pom", "nop", "Nop", "ancre"):
        return ""
    if nom == "corr":
        return positionnels[1] if len(positionnels) > 1 else (positionnels[0] if positionnels else "")
    if nom == "s":
        return siecle(positionnels[0]) if positionnels else ""
    if nom in ("e",):
        return "ᵉ" if not positionnels else positionnels[0] + "ᵉ"
    if nom == "er":
        return "ᵉʳ"
    if nom == "re":
        return "ʳᵉ"
    if nom == "roi":
        return " ".join(p.strip() for p in positionnels[:2])
    if nom == "lang":
        return positionnels[1] if len(positionnels) > 1 else ""
    if nom in ("sc", "t", "t2", "c", "d", "g", "centré", "droite", "gauche", "taille", "petit"):
        return positionnels[0] if positionnels else ""
    if nom in ("Mme", "Mlle", "M.", "Mgr", "MM."):
        return nom
    if nom == "n°":
        return "nº"
    if re.fullmatch(r"\do", nom):
        return nom[0] + "º"
    if nom in ("—", "-"):
        return "—"
    if nom.startswith("in-"):
        return nom
    return positionnels[0] if positionnels else ""


def wikitexte(page):
    """Le texte d'une page, sans le balisage."""
    t = re.sub(r"<noinclude>.*?</noinclude>", "", page, flags=re.S)
    t = re.sub(r"<section[^>]*/>", "", t)
    t = re.sub(r"<nowiki\s*/>", "", t)
    t = re.sub(r"<ref[^>/]*>(.*?)</ref>", lambda m: " [" + m.group(1).strip() + "]", t, flags=re.S)
    t = re.sub(r"<ref[^>]*/>", "", t)
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"</?(?:sup|sub|center|span|div|small|big|references)[^>]*>", "", t)
    t = re.sub(r"<poem[^>]*>(.*?)</poem>", lambda m: "\n" + "\n".join(
        "    " + x.lstrip(": ").strip() for x in m.group(1).strip().split("\n") if x.strip()) + "\n",
        t, flags=re.S | re.I)
    t = re.sub(r"\[\[(?:File|Fichier|Image):[^\]]*\]\]", "", t)
    t = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", t)
    # Les modèles, de l'intérieur vers l'extérieur.
    precedent = None
    while precedent != t:
        precedent = t
        t = re.sub(r"\{\{\s*([^|{}]+?)\s*(\|[^{}]*)?\}\}", modele, t)
    t = t.replace("&nbsp;", " ").replace("&#160;", " ")
    t = re.sub(r"'''(.*?)'''", r"\1", t)
    t = re.sub(r"''(.*?)''", r"_\1_", t)
    t = re.sub(r"_\s*_", "", t)
    t = re.sub(r"\(\s*\)", "", t)
    t = re.sub(r"^:+\s*", "", t, flags=re.M)
    t = re.sub(r"^-{4,}\s*$", "", t, flags=re.M)
    return t


RE_TETE_LARCHEY = re.compile(
    r"^(?P<v>[" + MAJ + r"0-9][" + MAJ + r"0-9'’ ,\-.!?]*?)\s*(?:\((?P<c>[^)]{1,60})\))?\s*:\s+(?P<t>.*)$",
    re.S)
RE_SOUS_LARCHEY = re.compile(r"^_(?P<v>[^_]{2,80})_\s*(?:\((?P<c>[^)]{1,60})\))?\s*:\s+(?P<t>.*)$", re.S)

# « Tous les mots suivis des noms de Grandval, Halbert, Vidocq, Colombey,
# Moreau-Christophe, Rabasse, appartiennent à l'argot ancien ou nouveau des
# classes dangereuses. » — Larchey, en tête de son dictionnaire.
RE_CLASSES_DANGEREUSES = re.compile(r"\((?:Grandval|Halbert|Vidocq|Colombey|Moreau[- ]Christophe"
                                    r"|Rabasse)\b")
RE_GRECS = re.compile(r"\((?:Alyge|Cavaillé)\b")


def larchey():
    donnees = json.loads((SOURCES / "larchey-1881.json").read_text(encoding="utf-8"))
    pages = donnees["pages"]
    corps = []
    for numero in range(47, 559):
        brut = pages.get(str(numero))
        if brut is None:
            continue
        propre = wikitexte(brut)
        if 412 <= numero <= 424:
            continue                      # l'« Avis nécessaire » du supplément
        if numero == 425:
            propre = propre[propre.find("_A_") if "_A_" in propre else 0:]
            i = propre.find("ABAT-JOUR")
            propre = "\n\n@SUPPLEMENT@\n\n" + (propre[i:] if i >= 0 else propre)
        if numero == 47:
            i = propre.find("ABADIS")
            propre = propre[i:]
        propre = propre.strip("\n ")
        if not propre:
            continue
        premiere_ligne = propre.split("\n", 1)[0]
        nouveau = (not corps or RE_TETE_LARCHEY.match(premiere_ligne) or RE_SOUS_LARCHEY.match(premiere_ligne)
                   or propre.startswith("@") or premiere_ligne.startswith("    ")
                   or re.fullmatch(r"[" + MAJ + r"]", premiere_ligne.strip()))
        if nouveau:
            corps.append("\n\n" + propre)
        else:
            corps.append(" " + propre)
    texte = "".join(corps)
    texte = re.sub(r"\n\s*FIN\s*\n", "\n\n", texte)
    articles = []
    courant = None
    supplement = 0
    for bloc in re.split(r"\n[ \t]*\n", texte):
        brut = paragraphe(bloc.split("\n"))
        if not brut:
            continue
        if brut == "@SUPPLEMENT@":
            supplement = 1
            courant = None
            continue
        if re.fullmatch(r"[" + MAJ + r"]", brut):
            continue
        m = RE_TETE_LARCHEY.match(brut) or RE_SOUS_LARCHEY.match(brut)
        if m:
            vedette = m.group("v").strip(" ,")
            variantes = []
            if m.re is RE_TETE_LARCHEY and ", " in vedette:
                morceaux = [x.strip() for x in vedette.split(",") if x.strip()]
                if all(re.fullmatch(r"[" + MAJ + r"0-9'’ \-.!?]+", x) for x in morceaux):
                    vedette, variantes = morceaux[0], morceaux[1:]
            complement = m.group("c") or ""
            if m.re is RE_SOUS_LARCHEY:
                imprime = vedette.lower() + (" (" + complement + ")" if complement else "")
                forme = en_ordre(vedette.upper(), complement) if complement else vedette
                forme = forme[0].lower() + forme[1:] if forme[:2] != forme[:2].upper() else forme
            else:
                imprime = minuscules(vedette + (" (" + complement + ")" if complement else ""))
                forme = en_ordre(vedette, complement)
            courant = {
                "s": "larchey", "sup": supplement,
                "v": imprime.replace("'", "’"),
                "m": vedette_propre(forme.replace("'", "’")),
                "var": [vedette_propre(minuscules(v)) for v in variantes],
                "nat": "",
                "p": [typographie(m.group("t"))],
            }
            articles.append(courant)
        elif courant is not None:
            courant["p"].append(typographie(brut))
    for a in articles:
        tout = " ".join(a["p"])
        mil = milieux(tout)
        if RE_CLASSES_DANGEREUSES.search(tout) and "argot des voleurs" not in mil:
            mil.append("argot des voleurs")
        if RE_GRECS.search(tout) and "argot des grecs" not in mil:
            mil.append("argot des grecs")
        a["mil"] = mil
        a["vr"] = renvois(tout)
    completer(articles, "larchey")
    return articles


# --- Tout ensemble --------------------------------------------------------------

def main():
    tous = []
    for nom, lire in (("delvau", delvau), ("larchey", larchey), ("virmaitre", virmaitre)):
        articles = lire()
        vides = sum(1 for a in articles if not a["d"] and not a["vr"])
        vedettes = len({cle(a["m"]) for a in articles})
        print(f"  {nom:10} {len(articles):6d} articles, {vedettes} vedettes, "
              f"{sum(a['sup'] for a in articles)} au supplément, {vides} sans définition courte")
        tous.extend(articles)
    with open(SORTIE, "w", encoding="utf-8", newline="\n") as f:
        for a in tous:
            f.write(json.dumps(a, ensure_ascii=False, separators=(",", ":")) + "\n")
    milieux_vus = collections.Counter(m for a in tous for m in a["mil"])
    print("  milieux les plus cités :", ", ".join(f"{m} ×{n}" for m, n in milieux_vus.most_common(25)))
    print(f"  → {SORTIE.name} : {commun.humain(SORTIE.stat().st_size)}")


if __name__ == "__main__":
    sys.exit(main())
