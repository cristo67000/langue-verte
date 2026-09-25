#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Les étiquettes d'usage, en français.

wiktextract normalise les marques du Wiktionnaire en codes anglais —
« (Familier) » devient `familiar`, « (Cuisine) » devient `cooking`. C'est
commode pour qui compare des éditions, et illisible pour qui lit une fiche.
On les remet donc en français, dans la forme abrégée qu'utilisent les
dictionnaires : *fam.*, non ; « familier », oui — un lecteur de téléphone n'a
pas la liste des abréviations sous les yeux.

Trois familles, trois sorts :

  t:  registre, emploi, grammaire      traduit ici ; inconnu = laissé de côté
  d:  domaine                          traduit ici ; inconnu = laissé de côté
  r:  marque déjà en français          gardée telle quelle, sauf les
                                       indications de taxinomie latine

Une étiquette laissée de côté ne fait rien perdre d'essentiel : le sens reste,
seule sa marque disparaît. Mieux vaut cela qu'un « ichthyology » au milieu
d'une fiche française. `construire.py` compte ce qui est ainsi écarté et le dit
dans son rapport, pour qu'on complète la table.
"""

REGISTRES = {
    "figuratively": "figuré",
    "familiar": "familier",
    "very-familiar": "très familier",
    "informal": "familier",
    "dated": "vieilli",
    "obsolete": "désuet",
    "archaic": "archaïque",
    "broadly": "par extension",
    "rare": "rare",
    "slang": "argot",
    "especially": "en particulier",
    "specifically": "spécialement",
    "Anglicism": "anglicisme",
    "pejorative": "péjoratif",
    "colloquial": "populaire",
    "pronominal": "pronominal",
    "physical": "au physique",
    "analogy": "par analogie",
    "vulgar": "vulgaire",
    "Ancient": "Antiquité",
    "metonymically": "par métonymie",
    "ellipsis": "par ellipse",
    "neologism": "néologisme",
    "intransitive": "intransitif",
    "transitive": "transitif",
    "indirect": "transitif indirect",
    "uncountable": "indénombrable",
    "countable": "dénombrable",
    "ironic": "ironique",
    "plural": "au pluriel",
    "singular": "au singulier",
    "literary": "littéraire",
    "formal": "soutenu",
    "literally": "au sens propre",
    "offensive": "injurieux",
    "hyperbole": "par hyperbole",
    "euphemism": "par euphémisme",
    "litotes": "par litote",
    "rhetoric": "rhétorique",
    "poetic": "poétique",
    "collective": "collectif",
    "collectively": "collectivement",
    "childish": "langage enfantin",
    "Ancient-Greek": "Grèce antique",
    "Ancient-Roman": "Rome antique",
    "Middle-Ages": "Moyen Âge",
    "Judaism": "judaïsme",
    "Christianity": "christianisme",
    "Hinduism": "hindouisme",
    "Marxism": "marxisme",
    "Nazism": "nazisme",
    "Biblical": "biblique",
    "European-Union": "Union européenne",
    "generically": "génériquement",
    "generally": "en général",
    "idiomatic": "idiomatique",
    "demonym": "gentilé",
    "adjective": "adjectivement",
    "adverb": "adverbialement",
    "impersonal": "impersonnel",
    "abbreviation": "abréviation",
    "diminutive": "diminutif",
    "augmentative": "augmentatif",
    "toponymic": "toponymie",
    "reflexive": "réfléchi",
    "reciprocal": "réciproque",
    "passive": "passif",
    "proverb": "proverbe",
    "auxiliary": "auxiliaire",
    "vernacular": "vernaculaire",
    "polite": "poli",
    "common": "courant",
    "Traditional-Chinese": "chinois traditionnel",
}

# Les étiquettes qu'on écarte exprès : ce sont des indications de grammaire
# que la fiche dit déjà autrement (le genre, la nature), ou des artefacts.
REGISTRES_MUETS = {
    "compound", "analytic", "conjugation", "feminine", "masculine", "neuter",
    "invariable", "participle", "past", "future", "imperative", "positive",
    "negative", "interrogative", "exclusive", "partitive", "second-person",
    "suffix", "error-lua-exec",
}

DOMAINES = {
    "geography": "géographie", "botany": "botanique", "medicine": "médecine",
    "chemistry": "chimie", "zoology": "zoologie", "music": "musique",
    "anatomy": "anatomie", "linguistic": "linguistique", "linguistics": "linguistique",
    "ornithology": "ornithologie", "history": "histoire", "nautical": "marine",
    "law": "droit", "computing": "informatique", "military": "militaire",
    "cuisine": "cuisine", "cooking": "cuisine", "religion": "religion",
    "politics": "politique", "mineralogy": "minéralogie", "agriculture": "agriculture",
    "biology": "biologie", "metrology": "métrologie", "sports": "sport",
    "mathematics": "mathématiques", "biochemistry": "biochimie", "technical": "technique",
    "geology": "géologie", "architecture": "architecture", "entomology": "entomologie",
    "electricity": "électricité", "heraldry": "héraldique", "finance": "finance",
    "philosophy": "philosophie", "art": "art", "arts": "arts", "ecology": "écologie",
    "ichthyology": "ichtyologie", "clothing": "habillement", "astronomy": "astronomie",
    "psychology": "psychologie", "construction": "construction", "education": "éducation",
    "cartography": "cartographie", "grammar": "grammaire", "sexuality": "sexualité",
    "fishing": "pêche", "mycology": "mycologie", "commerce": "commerce",
    "mechanical": "mécanique", "mechanics": "mécanique", "hunting": "chasse",
    "telecommunications": "télécommunications", "sociology": "sociologie",
    "automobile": "automobile", "geometry": "géométrie", "textiles": "textile",
    "programming": "programmation", "surgery": "chirurgie", "transport": "transports",
    "Christianity": "christianisme", "astronautics": "astronautique",
    "meteorology": "météorologie", "forestry": "sylviculture", "pharmacology": "pharmacologie",
    "metallurgy": "métallurgie", "mammalogy": "mammalogie", "literature": "littérature",
    "typography": "typographie", "carpentry": "menuiserie", "games": "jeux",
    "railways": "chemin de fer", "aeronautics": "aéronautique", "film": "cinéma",
    "cycling": "cyclisme", "masonry": "maçonnerie", "technology": "technologie",
    "physiology": "physiologie", "numismatics": "numismatique", "theater": "théâtre",
    "psychiatry": "psychiatrie", "oenology": "œnologie", "biogeography": "biogéographie",
    "dance": "danse", "Catholicism": "catholicisme", "photography": "photographie",
    "equestrianism": "équitation", "mythology": "mythologie", "beverages": "boissons",
    "Internet": "Internet", "marketing": "marketing", "police": "police",
    "furniture": "mobilier", "anthropology": "anthropologie", "accounting": "comptabilité",
    "sewing": "couture", "malacology": "malacologie", "nobility": "noblesse",
    "poetry": "poésie", "journalism": "journalisme", "neurology": "neurologie",
    "ophthalmology": "ophtalmologie", "science": "sciences", "sciences": "sciences",
    "Islam": "islam", "pedology": "pédologie", "oncology": "oncologie", "logic": "logique",
    "soccer": "football", "archeology": "archéologie", "statistics": "statistiques",
    "paleontology": "paléontologie", "petrography": "pétrographie", "theology": "théologie",
    "colorimetry": "colorimétrie", "hairdressing": "coiffure", "weaving": "tissage",
    "jewelry": "joaillerie", "management": "gestion", "hydrology": "hydrologie",
    "feminism": "féminisme", "falconry": "fauconnerie", "rugby": "rugby",
    "histology": "histologie", "astrology": "astrologie", "martial-arts": "arts martiaux",
    "circus": "cirque", "telephony": "téléphonie", "ethnology": "ethnologie",
    "topology": "topologie", "aviation": "aviation", "chess": "échecs",
    "editing": "édition", "teratology": "tératologie", "herpetology": "herpétologie",
    "horticulture": "horticulture", "dentistry": "dentisterie", "business": "affaires",
    "media": "médias", "fencing": "escrime", "virology": "virologie",
    "climatology": "climatologie", "taxation": "fiscalité", "insurance": "assurance",
    "occultism": "occultisme", "oceanography": "océanographie",
    "psychoanalysis": "psychanalyse", "tennis": "tennis", "anarchism": "anarchisme",
    "tourism": "tourisme", "diplomacy": "diplomatie", "television": "télévision",
    "plumbing": "plomberie", "alchemy": "alchimie", "embryology": "embryologie",
    "thermodynamics": "thermodynamique", "algebra": "algèbre",
    "bullfighting": "tauromachie", "astrophysics": "astrophysique", "school": "école",
    "baseball": "baseball", "mountaineering": "alpinisme", "beekeeping": "apiculture",
    "microbiology": "microbiologie", "SMS": "SMS", "robotics": "robotique",
    "cryptography": "cryptographie", "obstetrics": "obstétrique", "glaciology": "glaciologie",
    "dermatology": "dermatologie", "conchology": "conchyliologie",
    "physics": "physique", "economics": "économie", "economy": "économie",
    "genetics": "génétique", "electronics": "électronique", "optics": "optique",
    "printing": "imprimerie", "painting": "peinture", "sculpture": "sculpture",
    "pottery": "poterie", "rhetoric": "rhétorique", "semantics": "sémantique",
    "phonetics": "phonétique", "phonology": "phonologie", "lexicography": "lexicographie",
    "biblical": "Bible", "Bible": "Bible", "Buddhism": "bouddhisme", "Judaism": "judaïsme",
    "Protestantism": "protestantisme", "Hinduism": "hindouisme", "liturgy": "liturgie",
    "gastronomy": "gastronomie", "pastry": "pâtisserie", "bakery": "boulangerie",
    "wine": "vin", "viticulture": "viticulture", "brewing": "brasserie",
    "boxing": "boxe", "golf": "golf", "swimming": "natation", "skiing": "ski",
    "sailing": "voile", "basketball": "basket-ball", "volleyball": "volley-ball",
    "handball": "handball", "cricket": "cricket", "athletics": "athlétisme",
    "gymnastics": "gymnastique", "horse-racing": "courses hippiques",
    "card-games": "jeux de cartes", "video-games": "jeux vidéo",
    "role-playing-games": "jeux de rôle", "board-games": "jeux de société",
    "gambling": "jeux d'argent", "poker": "poker", "billiards": "billard",
    "go": "jeu de go", "bridge": "bridge", "comics": "bande dessinée",
    "radio": "radio", "cinema": "cinéma", "audiovisual": "audiovisuel",
    "advertising": "publicité", "banking": "banque", "stock-market": "bourse",
    "trading": "négoce", "industry": "industrie", "mining": "mines",
    "petroleum": "pétrole", "nuclear": "nucléaire", "energy": "énergie",
    "hydraulics": "hydraulique", "acoustics": "acoustique", "materials": "matériaux",
    "woodworking": "menuiserie", "metalworking": "métallurgie", "glass": "verrerie",
    "leather": "cuir", "shoemaking": "cordonnerie", "tailoring": "couture",
    "fashion": "mode", "cosmetics": "cosmétique", "perfumery": "parfumerie",
    "pharmacy": "pharmacie", "nursing": "soins infirmiers", "veterinary": "médecine vétérinaire",
    "immunology": "immunologie", "cardiology": "cardiologie", "gynecology": "gynécologie",
    "pediatrics": "pédiatrie", "urology": "urologie", "radiology": "radiologie",
    "anesthesiology": "anesthésiologie", "hematology": "hématologie",
    "endocrinology": "endocrinologie", "gastroenterology": "gastro-entérologie",
    "pathology": "pathologie", "toxicology": "toxicologie", "nutrition": "nutrition",
    "dietetics": "diététique", "cytology": "cytologie", "ethology": "éthologie",
    "bryology": "bryologie", "lichenology": "lichénologie", "phycology": "phycologie",
    "arachnology": "arachnologie", "myrmecology": "myrmécologie",
    "carcinology": "carcinologie", "primatology": "primatologie",
    "cetology": "cétologie", "protistology": "protistologie",
    "bacteriology": "bactériologie", "parasitology": "parasitologie",
    "cosmology": "cosmologie", "planetology": "planétologie", "seismology": "sismologie",
    "volcanology": "volcanologie", "speleology": "spéléologie",
    "crystallography": "cristallographie", "geomorphology": "géomorphologie",
    "hydrography": "hydrographie", "topography": "topographie", "surveying": "arpentage",
    "urbanism": "urbanisme", "urban-planning": "urbanisme", "administration": "administration",
    "justice": "justice", "sociolinguistics": "sociolinguistique", "demography": "démographie",
    "genealogy": "généalogie", "ethnography": "ethnographie", "folklore": "folklore",
    "esotericism": "ésotérisme", "spiritualism": "spiritisme", "divination": "divination",
    "magic": "magie", "fantasy": "fantasy", "science-fiction": "science-fiction",
    "Freemasonry": "franc-maçonnerie", "freemasonry": "franc-maçonnerie",
    "philately": "philatélie", "calligraphy": "calligraphie", "graphic-design": "graphisme",
    "design": "design", "drawing": "dessin", "engraving": "gravure", "lutherie": "lutherie",
    "arms": "armement", "weapons": "armement", "firearms": "armes à feu",
    "artillery": "artillerie", "navy": "marine", "army": "armée", "police-force": "police",
    "security": "sécurité", "firefighting": "lutte contre l'incendie",
    "firefighters": "lutte contre l'incendie", "sports-and-games": "sports et jeux",
    "mathematical-analysis": "analyse", "arithmetic": "arithmétique",
    "probability": "probabilités", "set-theory": "théorie des ensembles",
    "networking": "réseaux", "software": "logiciel", "hardware": "matériel informatique",
    "databases": "bases de données", "artificial-intelligence": "intelligence artificielle",
    "social-media": "réseaux sociaux", "video": "vidéo", "audio": "audio",
    # Les argots particuliers que wiktextract range parmi les domaines.
    "polytechnicien": "argot polytechnicien", "Gadz'Arts": "argot des Gadz'Arts",
    "poilu": "argot des poilus", "thieves": "argot des voleurs",
    # Et quelques domaines de plus, relevés dans rapport.txt.
    "fortification": "fortification", "information": "information",
    "vexillology": "vexillologie", "motorcycling": "moto", "farriery": "maréchalerie",
    "bodybuilding": "culturisme", "phytopathology": "phytopathologie", "juggling": "jonglerie",
    "feudalism": "féodalité", "hobbies": "loisirs", "machining": "usinage",
    "food": "alimentation", "socialism": "socialisme", "broadcasting": "radiodiffusion",
    "performing-arts": "arts du spectacle", "time": "temps", "wrestling": "lutte",
    "chronology": "chronologie", "tools": "outils", "diving": "plongée",
    "monarchy": "monarchie", "epidemiology": "épidémiologie",
}

# Les marques déjà françaises qu'on n'affiche pas : des rangs de taxinomie
# glissés par le Wiktionnaire pour classer des noms d'animaux, qui ne disent
# rien à qui cherche le sens d'un mot.
MARQUES_MUETTES = {
    "Aves", "Canidea", "Canis familiaris", "Bovidea", "Psittacidae",
    "poissons entièrement ossifiés", "lépidoptère", "passériforme", "Didactique",
    "Absolument", "Métier", "Transitude",
}


def traduire(etiquette):
    """`t:familiar` → « familier ». Rend None pour ce qu'on n'affiche pas."""
    if not etiquette or len(etiquette) < 3 or etiquette[1] != ":":
        return None
    famille, valeur = etiquette[0], etiquette[2:]
    if famille == "t":
        if valeur in REGISTRES_MUETS:
            return None
        return REGISTRES.get(valeur)
    if famille == "d":
        return DOMAINES.get(valeur)
    if famille == "r":
        valeur = " ".join(valeur.split())
        if valeur in MARQUES_MUETTES or len(valeur) > 40:
            return None
        return valeur
    return None


def traduire_liste(etiquettes, inconnues=None):
    """Traduit une liste, sans doublon, dans l'ordre d'arrivée."""
    sortie = []
    for etiquette in etiquettes or ():
        francais = traduire(etiquette)
        if francais is None:
            if inconnues is not None and etiquette[:2] in ("t:", "d:") \
                    and etiquette[2:] not in REGISTRES_MUETS:
                inconnues[etiquette] += 1
            continue
        if francais not in sortie:
            sortie.append(francais)
    return sortie


# Les étiquettes grammaticales des formes énumérées par un lemme, à l'affichage.
FORMES = [
    ({"plural", "masculine"}, "masculin pluriel"),
    ({"plural", "feminine"}, "féminin pluriel"),
    ({"singular", "feminine"}, "féminin"),
    ({"feminine"}, "féminin"),
    ({"singular", "masculine"}, "masculin"),
    ({"masculine"}, "masculin"),
    ({"plural"}, "pluriel"),
    ({"singular"}, "singulier"),
]


def etiquette_de_forme(etiquettes):
    """`["plural", "feminine"]` → « féminin pluriel ». Rend « » si rien ne va."""
    brutes = set(e for e in etiquettes if not e.startswith("r:"))
    for attendu, libelle in FORMES:
        if attendu <= brutes:
            return libelle
    for e in etiquettes:
        if e.startswith("r:"):
            texte = " ".join(e[2:].split())
            if len(texte) <= 40:
                return texte
    return ""
