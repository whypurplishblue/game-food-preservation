
Learning syllabus docs/y6-sci-u8.md

## 3D model attribution

Every `.glb` under `public/assets/models/` must be listed in `src/content/credits.js`, either in:

- `CREDITS` — a downloaded asset that carries an external license (author, source URL, license name + URL). These are the ones shown to players on the in-game Credits screen (title screen and pause menu → © Credits).
- `SELF_MADE` — a model authored in-house. No external license, just a short note. Not shown on the Credits screen.

`tools/check-credits.mjs` (`npm run test:credits`) walks the models folder and fails if any file is missing from both lists, listed in both, or if an entry points at a file that no longer exists.

**When adding a new downloaded model:** drop the `.glb` into `public/assets/models/`, then add a `CREDITS` entry with the matching `file` path (relative to `public/assets/models/`, e.g. `foods/prawns.glb`) in the same commit. `npm run test:credits` will fail until you do.

**When adding a new self-made model:** add a `SELF_MADE` entry instead.

The Credits screen (`Screens.js` → `credits()`) renders `CREDITS` directly — there is no separate copy to keep in sync, so updating `credits.js` is the only step needed.

## The 3D Fact Book (`src/ui/factbook/`)

The Fact Book is a physical animated book with its own WebGL context, opened by
`Game.openFactBook()`. `Screens.factBook()` is still there as the flat fallback
if that context cannot be created; it teaches exactly the same material.

It is a **presentation layer only**. Nothing educational is decided inside it:

```
curriculum.js (METHODS, FOODS, MECHANISM, REFERENCE_ONLY_FOODS)   structure
        +  locale files via t() / tList()                          prose
        ↓
  viewModel.js  →  pageArt.js (printed pages)  +  the detail panel
```

| file | owns |
| --- | --- |
| `viewModel.js` | joins curriculum structure to localised prose; builds the spread list |
| `pageArt.js` | everything printed on a page: type, rules, icons, method diagrams |
| `BookMesh.js` | the book geometry, driven by `openness`, `progress` and `turn` |
| `Viewer.js` | the clamped turntable used by the method and food viewers |
| `models.js` | station models via `METHODS[id].station`, food models via `FOODS[id].model` |
| `FactBook3D.js` | state machine, input zones, rendering, the detail panel |

Rules that keep it honest:

- **Never write a method, food, mechanism or food→method pairing into this
  folder.** Adding a method to `curriculum.js` adds a spread, a tab and a page
  with no edit here; that property is the whole point.
- **The book carries the core concept, the panel carries the detail.** A method
  page prints `explain` + the mechanism; the panel prints `detail`, `exam`, the
  foods and the source reference. The same sentence must not appear on both.
- `foods` and `alsoWorks` must stay visually distinct (cards vs chips), and
  playable vs Fact-Book-only methods must stay distinguishable.
- **Cut-outs:** the WebGL canvas sits *behind* the panel and is scissored into
  the screen rectangle of `.pp-fb__viewport` and each `.pp-fb__cardslot`. Those
  elements must stay transparent, and the clear colours in
  `FactBook3D._render()` must match `--fb-viewer-bg` / `--fb-card-bg` in
  `factbook.css`. Giving either card a solid background hides the model.

Harnesses:

```
npm run shots:factbook   # the visual gauntlet — opening, every spread kind,
                         # a page turn at the quarter points, closing
npm run test:factbook    # behaviour — drag commits and reverses, the model
                         # viewer never reaches the book, keyboard, Escape,
                         # narrow layout, localisation, in-game open/close
```

Both need `npm run preview` running on port 4173.
