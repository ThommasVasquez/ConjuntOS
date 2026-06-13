#!/usr/bin/env python3
"""Migra la paleta a monocromo (blanco/negro/gris).
- Familia fria/decorativa (blue, indigo, cyan, sky, slate, purple, violet,
  fuchsia, pink, rose) -> zinc (gris neutro), preservando shade y opacidad.
- Hex de marca azul/navy/purpura -> grises equivalentes.
- Conserva colores semanticos de estado: emerald, teal, green, red, orange,
  amber, yellow, rose? (rose se trata como decorativo -> gris).
NO toca globals.css (se edita a mano) ni archivos backend.
"""
import re
import pathlib

SRC = pathlib.Path("/home/user_vkibfp0l/conjunto/src")

# Familias decorativas frias/marca -> zinc
COOL = ["blue", "indigo", "cyan", "sky", "slate", "purple", "violet",
        "fuchsia", "pink", "rose"]
cool_re = re.compile(r"\b(" + "|".join(COOL) + r")-(\d{2,3})")

# Hex de marca -> grises
HEX_MAP = {
    "#009df2": "#FAFAFA",  # acento azul vivo -> casi blanco (sobre fondos oscuros)
    "#5ec1f8": "#A1A1AA",  # azul claro -> gris medio claro (zinc 400)
    "#007ac2": "#52525B",  # azul oscuro -> zinc 600
    "#172554": "#18181B",  # navy -> zinc 900
    "#701A75": "#27272A",  # purpura -> zinc 800
}

changed = []
for path in SRC.rglob("*.tsx"):
    txt = path.read_text()
    orig = txt
    txt = cool_re.sub(lambda m: "zinc-" + m.group(2), txt)
    for h, g in HEX_MAP.items():
        txt = txt.replace(h, g)
        txt = txt.replace(h.upper(), g)
    if txt != orig:
        path.write_text(txt)
        changed.append(str(path.relative_to(SRC.parent)))

print(f"Archivos modificados: {len(changed)}")
for c in sorted(changed):
    print("  ", c)
