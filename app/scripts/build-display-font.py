"""Build the OFL-compliant COF Display derivative. Requires fonttools.

CoreText offsets composite accents in the upstream font on iOS. Flatten
composites to explicit contours without changing outlines or advance widths.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

root = Path(__file__).resolve().parents[1]
font = TTFont(root / 'assets/fonts/LilitaOne-Regular.ttf', recalcTimestamp=False)
glyphs = font.getGlyphSet()
converted = {}
for name in font.getGlyphOrder():
    if not font['glyf'][name].isComposite():
        continue
    recording = DecomposingRecordingPen(glyphs)
    glyphs[name].draw(recording)
    pen = TTGlyphPen(None)
    recording.replay(pen)
    converted[name] = pen.glyph()
for name, glyph in converted.items():
    font['glyf'][name] = glyph

# The original font reserves its family name; this derivative has its own name.
names = {1: 'COF Display', 2: 'Regular', 3: 'COF Display Regular 1.0',
         4: 'COF Display Regular', 6: 'COFDisplay-Regular',
         16: 'COF Display', 17: 'Regular'}
for record in font['name'].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
if 'DSIG' in font:
    del font['DSIG']
output = root / 'assets/fonts/COFDisplay-Regular.ttf'
font.save(output)
check = TTFont(output)
for char in 'İıĞğŞşÇçÖöÜü':
    name = check.getBestCmap()[ord(char)]
    assert not check['glyf'][name].isComposite(), char
print(f'Built {output.name}: {len(converted)} flattened composites; Turkish coverage verified.')
