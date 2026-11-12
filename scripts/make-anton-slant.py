"""Builds "Anton Slant": Anton (SIL OFL 1.1) with every glyph sheared 10° to the right, to match the
italic condensed lettering in the DSA Fort Worth logo. Run with `npm run fonts` (needs nix-shell, or
any Python with fonttools + brotli). Reads fonts-src/Anton-Regular.ttf, writes
src/assets/fonts/AntonSlant.woff2 (the site loads it as --font-display).

Renamed as a Modified Version under the OFL, so it can't be mistaken for upstream Anton. Hinting is
dropped (TrueType instructions don't survive a shear); browsers render it unhinted anyway.
"""

import math
from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "fonts-src" / "Anton-Regular.ttf"
OUT = ROOT / "src" / "assets" / "fonts" / "AntonSlant.woff2"
ANGLE = 10  # degrees, forward lean
FAMILY = "Anton Slant"

font = TTFont(SRC)
glyph_set = font.getGlyphSet()
glyf = font["glyf"]
hmtx = font["hmtx"]
slant = math.tan(math.radians(ANGLE))
# Shear around half the cap height so letters stay centred on their advance widths.
shift = -slant * font["OS/2"].sCapHeight / 2

new_glyphs = {}
for name in font.getGlyphOrder():
    # Decompose first: a composite's base glyph is sheared too, so shearing both would double it.
    rec = DecomposingRecordingPen(glyph_set)
    glyph_set[name].draw(rec)
    pen = TTGlyphPen(None)
    rec.replay(TransformPen(pen, (1, 0, slant, 1, shift, 0)))
    new_glyphs[name] = pen.glyph()

for name, glyph in new_glyphs.items():
    glyf[name] = glyph
    glyph.recalcBounds(glyf)
    advance, _ = hmtx[name]
    hmtx[name] = (advance, getattr(glyph, "xMin", 0))

for tag in ("fpgm", "prep", "cvt ", "hdmx", "LTSH", "VDMX"):
    if tag in font:
        del font[tag]

font["post"].italicAngle = -ANGLE
font["hhea"].caretSlopeRise = 1000
font["hhea"].caretSlopeRun = round(1000 * slant)

name_table = font["name"]
for record in list(name_table.names):
    if record.nameID in (1, 16):
        name_table.setName(FAMILY, record.nameID, record.platformID, record.platEncID, record.langID)
    elif record.nameID == 4:
        name_table.setName(f"{FAMILY} Regular", 4, record.platformID, record.platEncID, record.langID)
    elif record.nameID == 6:
        name_table.setName(FAMILY.replace(" ", "") + "-Regular", 6, record.platformID, record.platEncID, record.langID)
    elif record.nameID == 3:
        name_table.setName(f"{FAMILY.replace(' ', '')}-Regular;DSA Fort Worth;sheared {ANGLE}deg", 3, record.platformID, record.platEncID, record.langID)
    elif record.nameID == 5:
        name_table.setName(f"{record.toUnicode()}; sheared {ANGLE}deg from Anton", 5, record.platformID, record.platEncID, record.langID)

OUT.parent.mkdir(parents=True, exist_ok=True)
font.flavor = "woff2"
font.save(OUT)
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
