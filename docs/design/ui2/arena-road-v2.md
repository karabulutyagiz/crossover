# Arena road v2

Replaces v1 flat row backgrounds, gray stripe, and rectangular reward cards.
Existing arena artwork and gate-only automatic reward economy are unchanged.

## Asset

Built-in imagegen tool (not CLI). Final production asset:
`app/assets/ui2/arena-road-backdrop-v2.png` (887 × 1774 PNG, approximately 1.7 MB).
One fixed viewport background is reused behind the virtualized list. No per-frame
JS animation or new native dependency was added.

## Prompt

Use case: stylized-concept
Asset type: production mobile football game's arena-road BACKGROUND ONLY, portrait 1024x2048.
Reference image: existing floating football arena artwork is ONLY a rendering/material style reference. Do NOT reproduce its stadium, football, lettering, crowns or interface.
Create an elegant deep cobalt-blue aerial environment for floating stadium islands that will be composited in code. Premium hand-painted 3D mobile strategy-game environment: sculpted blue slate cliffs and stepped stone architecture ONLY along the outermost left and right edges, a few clipped navy pennants and tiny warm stadium light glows at the far margins, soft atmospheric blue depth below. Central 75% of image must be broad, calm, uncluttered midnight/cobalt negative space with very subtle painterly terrain/cloud texture, behind bright green arena islands and white UI labels. Camera is high oblique/isometric, not a horizon stadium view. Rich beveled material detail at edges, carefully controlled value hierarchy; vivid yet tasteful blue, softly illuminated stone edges. Premium game art, crisp rendered edges fading into atmospheric distance.
No road, no path, no center stripe, no platforms in center, no grid, no checkerboard, no cards, no text, no letters, no numbers, no logo, no characters, no football, no stadium at center, no mockup, no phone frame, no UI. Full bleed background asset. Keep top and bottom similarly dark blue, no vignette black band.

## Implementation

Transparent arena rows, original islands, subtle light/shadow, separate beveled
SVG enamel frames, short shaded stone steps between gates, safe-area header/footer.
Text and amounts remain native UI, not baked into the generated image.

## Checks

TypeScript and arena-road tests passed. New composition visually inspected in iOS
Simulator. V1 scroll behavior already manually confirmed by the user; this pass
retains that FlatList and changes only row height/presentation.
No push, OTA, server mutation, or production deployment.
