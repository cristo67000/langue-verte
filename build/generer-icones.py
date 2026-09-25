# -*- coding: utf-8 -*-
"""Génère les icônes et l'image d'aperçu de La Langue verte.

Dessin : « Lv » en italique à empattements — le L crème, le v en or — sur le
vert de l'application. Deux lettres, pas davantage : à 48 pixels sur un écran
de téléphone, tout détail supplémentaire devient une tache.

Dessiné au quadruple de la taille finale puis réduit : Pillow ne lisse pas les
bords, le suréchantillonnage s'en charge.

    python build/generer-icones.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(os.path.dirname(ICI), "icons")

VERT = (34, 97, 74)
VERT_FONCE = (23, 72, 53)
CREME = (247, 246, 240)
OR = (221, 178, 98)
E = 4

POLICES = [r"C:\Windows\Fonts\georgiaz.ttf", r"C:\Windows\Fonts\palabi.ttf",
           "/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf"]


def police(taille):
    for chemin in POLICES:
        if os.path.exists(chemin):
            return ImageFont.truetype(chemin, taille)
    return ImageFont.load_default()


def icone(cote, masquable=False):
    grand = cote * E
    image = Image.new("RGB", (grand, grand), VERT)
    dessin = ImageDraw.Draw(image)
    # Un léger dégradé vers le bas, pour que l'icône ne soit pas un aplat mort.
    for y in range(grand):
        t = y / grand
        couleur = tuple(int(VERT[i] + (VERT_FONCE[i] - VERT[i]) * t * 0.9) for i in range(3))
        dessin.line([(0, y), (grand, y)], fill=couleur)
    # Une icône « masquable » peut être rognée en cercle : tout doit tenir
    # dans les 80 % du centre.
    echelle = 0.52 if masquable else 0.64
    f = police(int(grand * echelle))
    bl = dessin.textbbox((0, 0), "L", font=f)
    bv = dessin.textbbox((0, 0), "v", font=f)
    chevauchement = grand * 0.06
    largeur = (bl[2] - bl[0]) + (bv[2] - bv[0]) - chevauchement
    hauteur = bl[3] - bl[1]
    x = (grand - largeur) / 2 - bl[0]
    y = (grand - hauteur) / 2 - bl[1] - grand * 0.02
    dessin.text((x, y), "L", font=f, fill=CREME)
    xv = x + (bl[2] - bl[0]) - chevauchement - (bv[0] - bl[0])
    dessin.text((xv, y), "v", font=f, fill=OR)
    return image.resize((cote, cote), Image.LANCZOS)


def apercu():
    """L'image qu'affichent les messageries quand on partage le lien."""
    l, h = 1200, 630
    image = Image.new("RGB", (l * 2, h * 2), VERT)
    dessin = ImageDraw.Draw(image)
    logo = icone(360).resize((520, 520), Image.LANCZOS)
    image.paste(logo, (150, (h * 2 - 520) // 2))
    titre = police(160)
    dessin.text((780, 320), "La Langue verte", font=titre, fill=CREME)
    sous = ImageFont.truetype(r"C:\Windows\Fonts\georgia.ttf", 62) \
        if os.path.exists(r"C:\Windows\Fonts\georgia.ttf") else police(62)
    lignes = ["Dictionnaire d’argot hors ligne",
              "verlan · argot d’aujourd’hui · langue verte de 1880",
              "étymologie · synonymes · citations · révision"]
    for i, ligne in enumerate(lignes):
        dessin.text((790, 580 + i * 92), ligne, font=sous, fill=CREME if i == 0 else OR)
    return image.resize((l, h), Image.LANCZOS)


def main():
    os.makedirs(SORTIE, exist_ok=True)
    icone(192).save(os.path.join(SORTIE, "icon-192.png"), optimize=True)
    icone(512).save(os.path.join(SORTIE, "icon-512.png"), optimize=True)
    icone(512, masquable=True).save(os.path.join(SORTIE, "icon-maskable-512.png"), optimize=True)
    apercu().save(os.path.join(SORTIE, "apercu-1200x630.png"), optimize=True)
    print("icônes écrites dans", SORTIE)


if __name__ == "__main__":
    main()
