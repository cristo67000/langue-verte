#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Le Wiktionnaire français, côté argot : ce qui ne se dit pas à l'Académie.

── La source ───────────────────────────────────────────────────────────────

Le dump intégral du Wiktionnaire français préparé par wiktextract et publié
sur kaikki.org (`raw-wiktextract-data.jsonl.gz`, CC BY-SA). Il décrit en
français des mots de toutes les langues ; on n'en garde que les mots
français, et parmi eux ceux qui ont **au moins un sens hors du bon usage**.

── Ce qui compte comme argot ici ──────────────────────────────────────────

Le choix de l'utilisateur, le 25 septembre 2026 : l'argot **et tout le
familier**, le périmètre des dictionnaires d'argot classiques (la « langue
verte » de Delvau, le Bob d'aujourd'hui). Un sens entre s'il porte l'une de
ces marques :

  - un registre : argot, familier, très familier, populaire, vulgaire ;
  - une marque ou une catégorie d'argot particulier : argot militaire,
    scolaire, policier, des voleurs, poilu, polytechnicien, Internet… ;
  - ou si toute la section est du verlan, du louchébem, du javanais ou du
    largonji — ce que dit son étymologie (« chelou » n'a aucune marque de
    registre, mais « verlan de louche »).

Le Wiktionnaire range beaucoup de mots d'argot sous « familier » : bagnole,
clope, toubib. Un filtre sur la seule marque « argot » les aurait perdus.

── Ce que ce fichier produit ──────────────────────────────────────────────

Deux extraits compacts, relus ensuite par `construire.py` autant de fois
qu'il le faut sans repasser par les 2,5 Go du dump :

  sources/sections.jsonl   une ligne par section de lemme qui a au moins un
                           sens d'argot — la section entière, chaque sens
                           d'argot marqué `"a": 1`, avec ses catégories
                           d'argot (`"c"`) ; sens, exemples, étymologie,
                           synonymes, contraires, locutions, formes…
  sources/formes.tsv       forme fléchie ⇥ lemme ⇥ nature — pour tous les mots
                           français : « keufs » mène à « keuf », « bouffé » à
                           « bouffer » (on trie dans construire.py)
  sources/etiquettes.tsv   l'inventaire des étiquettes rencontrées (registre,
                           domaine), pour vérifier que `etiquettes.py` les
                           traduit toutes
  sources/categories.tsv   les catégories d'argot rencontrées, et combien de
                           sens chacune — de quoi dresser les thèmes
  sources/courants.tsv     mot ⇥ nombre de sens ⇥ premier sens ⇥ rang de sa
                           section, pour les sections de la langue courante :
                           la fiche de « lance » (la pluie, en argot) rappelle
                           l'arme, qui vient en premier dans la page

Rien n'est encore choisi ni rogné ici, sinon le plus évident : les exemples
sans intérêt et les signes parasites du rendu wiki. Choisir quels sens entrent
dans l'application, c'est le travail de `construire.py`.

Usage :
    python build/extraire.py            # n'extrait pas ce qui est déjà là
    python build/extraire.py --forcer
"""

import argparse
import collections
import gzip
import json
import re
import sys
import time
from pathlib import Path

import commun  # noqa: F401 — règle l'encodage de la console

RACINE = Path(__file__).resolve().parent
SOURCES = RACINE / "sources"
DUMP = SOURCES / "wiktionnaire-fr.jsonl.gz"
SORTIE_SECTIONS = SOURCES / "sections.jsonl"
SORTIE_FORMES = SOURCES / "formes.tsv"
SORTIE_ETIQUETTES = SOURCES / "etiquettes.tsv"
SORTIE_CATEGORIES = SOURCES / "categories.tsv"
SORTIE_COURANTS = SOURCES / "courants.tsv"

# mot → [nombre de sens courants, premier sens courant, rang de sa section],
# rempli par section_de()
COURANTS = {}
# mot → nombre de sections de lemme déjà lues : le rang d'une section dans sa
# page. Il dit lequel vient d'abord, du sens courant ou du sens d'argot —
# « lance » est d'abord une arme, « taule » d'abord une chambre (en argot),
# puis la table de l'enclume.
RANGS = collections.Counter()

# --- Ce qui compte comme argot -----------------------------------------------

# Les registres, en codes normalisés par wiktextract (« Familier » → familiar).
REGISTRES_ARGOT = {"slang", "familiar", "very-familiar", "colloquial", "vulgar", "informal"}

# Les argots particuliers arrivent tantôt en marque brute (« Argot carcéral »),
# tantôt en domaine (« poilu »), tantôt en catégorie (« Argot militaire en
# français »). Un mot-clé suffit à les reconnaître.
RE_ARGOT = re.compile(r"argot|verlan|louch[eé]r?bem|javanais|largonji|jargon", re.I)
DOMAINES_ARGOT = {"poilu", "polytechnicien", "Gadz'Arts", "Saint-Cyrien", "saint-cyrien"}

# Une étymologie qui dit « verlan de louche » fait de toute la section un mot
# d'argot, même sans marque de registre. Pas « de l'argot » : « abasourdir »
# vient de l'argot et c'est aujourd'hui du meilleur français. Pas « javanais »
# non plus : « batik » vient du javanais, la langue de Java.
RE_ETYMOLOGIE_ARGOT = re.compile(r"\b(verlan|largonji|louch[eé]r?bem)\b", re.I)

# Les catégories qui valent d'être gardées sur un sens : celles d'argot, pour
# les thèmes (« Argot militaire en français » → « Argot militaire »).
RE_CATEGORIE_ARGOT = re.compile(r"^((?:Argot|Termes argotiques|Verlan|Louchébem|Javanais)\b.*?)"
                                r"(?: en français)?$")


def categorie_courte(categorie):
    """« Argot militaire en français » → « Argot militaire » ; rien si ce n'est
    pas une catégorie d'argot française."""
    if "français" not in categorie or not RE_ARGOT.search(categorie):
        return None
    if categorie.startswith("Mots en français issus"):
        return None
    m = RE_CATEGORIE_ARGOT.match(categorie)
    return m.group(1).strip() if m else None


def sens_d_argot(sens):
    """Le sens porte-t-il une marque d'argot ou de familier ?"""
    if REGISTRES_ARGOT & set(sens.get("tags") or ()):
        return True
    if any(RE_ARGOT.search(r or "") for r in sens.get("raw_tags") or ()):
        return True
    if DOMAINES_ARGOT & set(sens.get("topics") or ()):
        return True
    return any(categorie_courte(c) for c in sens.get("categories") or ())

# --- Ce qui n'est pas un mot du dictionnaire --------------------------------

# Les noms propres, prénoms et noms de famille ont leur place dans une
# encyclopédie ; les symboles et les lettres n'ont pas de sens à apprendre.
# Les « variantes par contrainte typographique » sont « oeil » pour « œil » :
# la clé de recherche fait déjà ce travail.
TITRES_ECARTES = re.compile(
    r"^(Nom propre|Prénom|Nom de famille|Symbole|Lettre|Variante par contrainte"
    r"|Nom scientifique|Erreur|Sinogramme|Numéral|Chiffre|Abréviation"
    r"|Forme de nom propre|Forme de prénom|Particule|Infixe|Interfixe|Circonfixe"
    r"|Quantificateur|Classificateur)")

# Les sections de formes fléchies : elles ne font pas une fiche, elles mènent
# à celle du lemme.
TITRE_DE_FORME = re.compile(r"^Forme ")

# --- Les exemples ------------------------------------------------------------

# Le Wiktionnaire français illustre par des citations d'auteurs, souvent
# longues. On accepte large et on classe : `construire.py` n'en garde que les
# premiers, donc les plus proches d'une longueur lisible.
EXEMPLE_MOTS_MIN = 3
EXEMPLE_MOTS_MAX = 48
EXEMPLE_MOTS_IDEAL = 14
EXEMPLES_PAR_SENS = 3
REFERENCE_MAX = 110

# Les signes parasites que le rendu wiki laisse dans les définitions et les
# étymologies : renvois de maintenance, appels à contribution.
PARASITES = [
    re.compile(r"\s*référence nécessaire\s*\(résoudre le problème\)"),
    re.compile(r"\s*\^\([^)]*\)"),
    re.compile(r"\s*\((?:Ajouter|Siècle à préciser|Date à préciser)[^)]*\)"),
    re.compile(r"\s*\(\s*\)"),
]
ETYMOLOGIE_VIDE = re.compile(
    r"Étymologie manquante|Étymologie à préciser|ajouter en cliquant", re.I)


def nettoyer(texte):
    if not texte:
        return ""
    for motif in PARASITES:
        texte = motif.sub("", texte)
    return re.sub(r"[ \t]+", " ", texte).strip()


def mots_de(texte):
    return re.findall(r"\w+", texte, flags=re.UNICODE)


def nettoyer_api(brut):
    """« \\fø\\ » et « [fø] » donnent « fø » : l'interface encadre elle-même."""
    if not brut:
        return ""
    return brut.strip().strip("[]/\\").strip()


# Les citations arrivent parfois enfermées dans leurs guillemets. Sur une
# fiche, ils ne disent rien — on sait qu'on lit un exemple — et ils décalent
# le mot en gras d'un signe.
PAIRES_DE_GUILLEMETS = (("«", "»"), ("“", "”"), ('"', '"'))


def deshabiller(texte, marque):
    for ouvrant, fermant in PAIRES_DE_GUILLEMETS:
        if len(texte) <= 2 or not texte.startswith(ouvrant) or not texte.endswith(fermant):
            continue
        interieur = texte[len(ouvrant):-len(fermant)]
        if ouvrant in interieur or fermant in interieur:
            break
        interieur_nu = interieur.strip()
        decalage = len(ouvrant) + (len(interieur) - len(interieur.lstrip()))
        if marque:
            marque = [marque[0] - decalage, marque[1] - decalage]
        return interieur_nu, marque
    return texte, marque


def marque_saine(texte, marque):
    """La marque désigne-t-elle encore un mot dans le texte ?

    Une position qui déborde, ou qui tombe sur une espace, vaut moins que pas
    de marque du tout : l'application soulignerait n'importe quoi avec aplomb.
    """
    if not marque:
        return None
    debut, fin = marque
    if not (0 <= debut < fin <= len(texte)):
        return None
    extrait = texte[debut:fin]
    if not extrait.strip() or not re.search(r"\w", extrait):
        return None
    return [debut, fin]


def exemples_de(sens):
    """Les exemples d'un sens, classés du plus lisible au moins lisible.

    `bold_text_offsets` donne la position du mot vedette dans la phrase, telle
    que le Wiktionnaire l'a mise en gras : c'est elle qui permet de souligner
    le mot, et de fabriquer l'exercice de la phrase à trou.
    """
    candidats = []
    for rang, exemple in enumerate(sens.get("examples", ())):
        texte = (exemple.get("text") or "").strip()
        if not texte:
            continue
        longueur = len(mots_de(texte))
        if not (EXEMPLE_MOTS_MIN <= longueur <= EXEMPLE_MOTS_MAX):
            continue
        gras = (exemple.get("bold_text_offsets") or [None])[0]
        marque = [int(gras[0]), int(gras[1])] if gras and len(gras) == 2 else None
        texte, marque = deshabiller(texte, marque)
        marque = marque_saine(texte, marque)
        # « Voir la note sur l'accord… » n'est pas un exemple, c'est un renvoi.
        if not marque and re.match(r"^(Voir|Note|→|Cf\.)", texte):
            continue
        reference = nettoyer(exemple.get("ref") or "")
        if len(reference) > REFERENCE_MAX:
            reference = reference[:REFERENCE_MAX].rsplit(" ", 1)[0].rstrip(",;:") + "…"
        # Un exemple où le mot est repéré passe devant : on sait le souligner,
        # et il peut servir de phrase à trou.
        candidats.append(((0 if marque else 1), abs(longueur - EXEMPLE_MOTS_IDEAL), rang,
                          [texte, marque, reference]))
    candidats.sort(key=lambda c: (c[0], c[1], c[2]))
    return [c[3] for c in candidats[:EXEMPLES_PAR_SENS]]


def etiquettes_de(objet, compteur):
    """Registre, domaine, région : tout ce qui qualifie un sens ou un mot lié.

    `tags` et `topics` sont des codes anglais normalisés par wiktextract
    (« familiar », « cooking ») ; `raw_tags` est déjà en français (« Québec »,
    « Lutte contre l'incendie »). On garde les deux, préfixés, et c'est
    `etiquettes.py` qui traduit.
    """
    sortie = []
    for cle_, prefixe in (("tags", "t:"), ("topics", "d:"), ("raw_tags", "r:")):
        for valeur in objet.get(cle_, ()) or ():
            if not valeur or valeur in ("form-of", "no-gloss", "alt-of"):
                continue
            etiquette = prefixe + str(valeur).strip()
            compteur[etiquette] += 1
            if etiquette not in sortie:
                sortie.append(etiquette)
    return sortie


def sens_de(section, compteur):
    """Les sens, dans l'ordre du Wiktionnaire, avec leur profondeur.

    Un sous-sens arrive avec la liste de ses glosses depuis le sens parent :
    `["De dimensions importantes…", "De hauteur importante."]`. On ne garde que
    la dernière, et le nombre de crans pour l'indenter.
    """
    sortie = []
    for sens in section.get("senses", ()):
        if sens.get("form_of") or "form-of" in (sens.get("tags") or ()):
            continue
        gloses = [nettoyer(g) for g in sens.get("glosses", ()) if g]
        gloses = [g for g in gloses if g]
        if not gloses:
            continue
        s = {"d": gloses[-1]}
        if len(gloses) > 1:
            s["p"] = len(gloses) - 1
        if sens_d_argot(sens):
            s["a"] = 1
        argots = []
        for c in sens.get("categories") or ():
            courte = categorie_courte(c)
            if courte and courte not in argots:
                argots.append(courte)
        if argots:
            s["c"] = argots
        etiquettes = etiquettes_de(sens, compteur)
        if etiquettes:
            s["r"] = etiquettes
        exemples = exemples_de(sens)
        if exemples:
            s["x"] = exemples
        note = nettoyer(sens.get("note") or "")
        if note:
            s["n"] = note[:300]
        renvoi = [a.get("word") for a in sens.get("alt_of", ()) if a.get("word")]
        if renvoi:
            s["v"] = renvoi[:3]
        sortie.append(s)
    return sortie


def liens_de(section, champ, compteur, plafond=60):
    """Synonymes, contraires, dérivés, locutions : `[mot, précision, étiquettes]`.

    La précision est ce que le Wiktionnaire met à côté du mot : pour un
    synonyme, le sens auquel il se rattache (« Dégagement d'énergie ») ; pour
    une locution, ce qu'elle veut dire (« à petit feu » — « en faisant
    durer »). `sense_index` désigne un sens par son numéro : on le note « #3 ».
    """
    vus = set()
    sortie = []
    for lien in section.get(champ, ()) or ():
        mot = nettoyer(lien.get("word") or "")
        # Les émojis et les signes rangés parmi les « apparentés » ne sont pas
        # des mots.
        if not mot or mot in vus or not re.search(r"[^\W\d_]", mot):
            continue
        vus.add(mot)
        precision = nettoyer(lien.get("sense") or "")
        if not precision and lien.get("sense_index"):
            precision = "#" + str(lien.get("sense_index"))
        etiquettes = etiquettes_de(lien, compteur)
        element = [mot]
        if precision or etiquettes:
            element.append(precision[:160])
        if etiquettes:
            element.append(etiquettes)
        sortie.append(element)
        if len(sortie) >= plafond:
            break
    return sortie


def genre_de(section):
    etiquettes = set(section.get("tags") or ())
    masc = "masculine" in etiquettes
    fem = "feminine" in etiquettes
    if masc and fem:
        return "mf"
    if masc:
        return "m"
    if fem:
        return "f"
    return ""


def formes_de(section):
    """Les formes que la section énumère elle-même : pluriel, féminin…

    `[graphie, étiquettes]`. Les formes conjuguées d'un verbe n'y sont pas —
    elles arrivent par les sections « Forme de verbe », dans formes.tsv.
    """
    sortie = []
    for forme in section.get("forms", ()) or ():
        graphie = nettoyer(forme.get("form") or "")
        if not graphie or len(graphie) > 60 or graphie == section.get("word"):
            continue
        etiquettes = [t for t in (forme.get("tags") or ()) if t]
        etiquettes += ["r:" + r.replace("\n", " ") for r in (forme.get("raw_tags") or ()) if r]
        sortie.append([graphie, etiquettes])
        if len(sortie) >= 12:
            break
    return sortie


def api_de(section):
    for son in section.get("sounds", ()) or ():
        api = nettoyer_api(son.get("ipa"))
        if api:
            return api
    return ""


def etymologie_de(section):
    paragraphes = []
    for texte in section.get("etymology_texts", ()) or ():
        texte = nettoyer(texte)
        if not texte or ETYMOLOGIE_VIDE.search(texte):
            continue
        paragraphes.append(texte)
    return paragraphes


RE_TITRE = re.compile(r"^(.*?)(?:\s+(\d+))?$")


def section_de(d, compteur):
    titre, numero = RE_TITRE.match(d.get("pos_title") or "").groups()
    sections_sens = sens_de(d, compteur)
    if not sections_sens:
        return None
    s = {
        "m": d["word"],
        "n": d.get("pos") or "",
        "t": titre,
        "s": sections_sens,
    }
    if numero:
        s["h"] = int(numero)
    genre = genre_de(d)
    if genre:
        s["g"] = genre
    autres = [t for t in (d.get("tags") or ()) if t in ("invariable", "plural", "singular")]
    if autres:
        s["gt"] = autres
    api = api_de(d)
    if api:
        s["api"] = api
    etymologie = etymologie_de(d)
    if etymologie:
        s["et"] = etymologie
    for attestation in d.get("attestations", ()) or ():
        if attestation.get("date"):
            s["at"] = nettoyer(attestation["date"])
            break
    formes = formes_de(d)
    if formes:
        s["f"] = formes
    for champ, cle_ in (("synonyms", "syn"), ("antonyms", "ant"), ("paronyms", "par"),
                        ("derived", "der"), ("related", "rel"), ("proverbs", "prov"),
                        ("hypernyms", "hyper"), ("hyponyms", "hypo")):
        liens = liens_de(d, champ, compteur, plafond=120 if champ == "derived" else 60)
        if liens:
            s[cle_] = liens
    notes = [nettoyer(n) for n in (d.get("notes") or ()) if n]
    notes = [n for n in notes if n]
    if notes:
        s["no"] = [n[:600] for n in notes[:3]]
    categories = d.get("categories") or ()
    if any(re.match(r"^(Expressions|Idiotismes|Proverbes|Métaphores)\b.*en français", c)
           for c in categories):
        s["idiome"] = 1

    # La section est-elle de l'argot ? Par ses sens, d'abord ; sinon par son
    # étymologie (verlan…) ou par une catégorie d'argot posée sur l'article
    # entier — alors tous ses sens le sont.
    argots_article = []
    for c in categories:
        courte = categorie_courte(c)
        if courte and courte not in argots_article:
            argots_article.append(courte)
    if argots_article:
        s["cat"] = argots_article
    par_etymologie = any(RE_ETYMOLOGIE_ARGOT.search(t) for t in etymologie)
    if par_etymologie:
        s["ety"] = 1
    rang = RANGS[d["word"]]
    RANGS[d["word"]] += 1
    s["o"] = rang
    if not any(x.get("a") for x in sections_sens):
        if not (par_etymologie or argots_article):
            # Une section de la langue courante : on n'en garde que de quoi
            # rappeler, sur la fiche d'argot du même mot, ce qu'il veut dire
            # d'ordinaire (« lance » : l'arme ; en argot, la pluie).
            courant = COURANTS.setdefault(d["word"], [0, "", rang])
            courant[0] += len(sections_sens)
            if not courant[1]:
                premier = next((x for x in sections_sens if not x.get("p")), sections_sens[0])
                courant[1] = premier["d"][:200].replace("\t", " ").replace("\n", " ")
            return None
        for x in sections_sens:
            x["a"] = 1
        s["tout"] = 1
    return s


def extraire():
    debut = time.time()
    compteur = collections.Counter()
    natures = collections.Counter()
    categories = collections.Counter()
    n_sections = n_formes = 0
    with gzip.open(DUMP, "rt", encoding="utf-8") as source, \
            open(SORTIE_SECTIONS, "w", encoding="utf-8", newline="\n") as sections, \
            open(SORTIE_FORMES, "w", encoding="utf-8", newline="\n") as formes:
        for numero, ligne in enumerate(source):
            if '"lang_code": "fr"' not in ligne[:400]:
                continue
            d = json.loads(ligne)
            if d.get("lang_code") != "fr" or not d.get("word"):
                continue
            mot = d["word"]
            titre = d.get("pos_title") or ""
            nature = d.get("pos") or ""

            # Formes fléchies : toute section, lemme ou non, peut en désigner
            # par `form_of` — « fit » est un adjectif *et* une forme de faire.
            for sens in d.get("senses", ()):
                for cible in sens.get("form_of", ()) or ():
                    lemme = (cible.get("word") or "").strip()
                    if lemme and lemme != mot and "\t" not in lemme:
                        formes.write(f"{mot}\t{lemme}\t{nature}\n")
                        n_formes += 1

            if TITRE_DE_FORME.match(titre) or TITRES_ECARTES.match(titre):
                continue

            # Les formes que le lemme énumère lui-même mènent à lui.
            for forme in d.get("forms", ()) or ():
                graphie = (forme.get("form") or "").strip()
                if graphie and graphie != mot and "\t" not in graphie and len(graphie) <= 60 \
                        and " " not in graphie:
                    formes.write(f"{graphie}\t{mot}\t{nature}\n")
                    n_formes += 1

            section = section_de(d, compteur)
            if not section:
                continue
            natures[section["t"]] += 1
            for c in section.get("cat", ()):
                categories["article : " + c] += 1
            for sens in section["s"]:
                for c in sens.get("c", ()):
                    categories[c] += 1
            sections.write(json.dumps(section, ensure_ascii=False, separators=(",", ":")) + "\n")
            n_sections += 1
            if n_sections % 50000 == 0:
                print(f"  {n_sections} sections, {numero} lignes lues, "
                      f"{time.time() - debut:.0f} s", flush=True)

    with open(SORTIE_ETIQUETTES, "w", encoding="utf-8", newline="\n") as f:
        for etiquette, nombre in compteur.most_common():
            f.write(f"{etiquette}\t{nombre}\n")
    with open(SORTIE_CATEGORIES, "w", encoding="utf-8", newline="\n") as f:
        for categorie, nombre in categories.most_common():
            f.write(f"{categorie}\t{nombre}\n")
    with open(SORTIE_COURANTS, "w", encoding="utf-8", newline="\n") as f:
        for mot, (nombre, definition, rang) in COURANTS.items():
            if "\t" not in mot:
                f.write(f"{mot}\t{nombre}\t{definition}\t{rang}\n")
    print(f"{n_sections} sections d'argot, {n_formes} renvois de formes, "
          f"{len(compteur)} étiquettes distinctes, {time.time() - debut:.0f} s")
    for titre, nombre in natures.most_common(30):
        print(f"  {nombre:7d}  {titre}")


def main():
    analyseur = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    analyseur.add_argument("--forcer", action="store_true",
                           help="réextraire même si les extraits existent")
    options = analyseur.parse_args()
    if not DUMP.exists():
        sys.exit(f"Dump absent : {DUMP}\nLancer d'abord build/telecharger.py.")
    extraits = (SORTIE_SECTIONS, SORTIE_FORMES, SORTIE_COURANTS)
    if all(f.exists() for f in extraits) and not options.forcer:
        print("Extraits déjà présents — --forcer pour les refaire.")
        return
    extraire()


if __name__ == "__main__":
    main()
