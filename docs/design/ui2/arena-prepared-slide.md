# Arena opening correction

The old opacity mapping reached fully opaque around 29 ms into its 240 ms cubic-out animation. The remaining 20 pt movement was barely visible. Initial simulator capture also showed the backdrop arriving after the screen started moving.

Arena now stays mounted in the menu shell with hidden accessibility and disabled hit testing while closed. Its native list and backdrop are prepared before the tap. A dedicated 340 ms full-width horizontal page transition replaces the compressed fade; Done reverses it in 260 ms. Current arena position resets while hidden. Other dialogs keep their own timing. No arena art, backdrop, rail or reward rules changed.

Simulator evidence: `arena-prepared-slide.mp4`, `arena-prepared-slide-frames.png`. Inspected actual intermediate frames: background is present during the slide (no dark unloaded backdrop). TypeScript and arena regression checks pass. Hardware accessibility Reduce Motion remains respected. This is not a real-device frame-time benchmark.
