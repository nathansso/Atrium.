# World assets

The EduForge world is drawn procedurally on a 2D canvas (`src/world/render.ts`),
so it ships with no binary sprite files. That is deliberate:

- No character art is copied from `twofactor/pogicity-demo`, whose sprites are
  reference-only for this project.
- Buildings, students, and icons are described by palettes and geometry in
  `src/world/layout.ts` and `src/world/render.ts`, so a room's color is the same
  value the React panels use.
- The demo runs fully offline with no asset loading step and no decode jank.

Drop-in raster assets can be added here later and blitted from the renderer
without changing the event-to-animation contract.
