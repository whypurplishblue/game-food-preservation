# Agent Routing

## Default

Use Sonnet as the main implementation agent.

Keep implementation, testing, debugging, and iteration in the main
conversation when those steps share context.

Do not create subagents unless delegation provides a clear benefit through
parallelism, context isolation, or independent review.

## Explore

Use Claude Code's built-in Explore agent for read-only codebase research.

When invoking Explore:
- use Haiku for quick, narrow, well-defined searches
- use Haiku for file discovery, reference lookup, and simple code tracing
- use Sonnet for broad, ambiguous, or very thorough exploration
- do not replace or override the built-in Explore agent

Keep exploration targeted. Return only findings relevant to the task.

## Subagents

Use Haiku for short, narrow, checkable work such as:
- locating files or references
- gathering facts
- checking implementation status
- examining logs
- simple verification

Use Sonnet for substantial independent work such as:
- feature implementation
- refactoring
- debugging
- tests
- complex code changes

Prefer keeping related implementation and iteration with the same Sonnet
agent instead of repeatedly starting fresh agents.

Run agents in parallel only when their work is genuinely independent.

Avoid multiple agents modifying the same files.

## Opus Advisor

Consult Opus when stronger reasoning is likely to materially improve the result:

- architecture decisions
- ambiguous or conflicting requirements
- difficult root-cause analysis
- repeated failed approaches
- major design decisions
- security-sensitive decisions
- final review of high-impact or complex changes

Do not consult Opus for routine coding, repository searches, or simple checks.

## Escalation

Use the lowest-cost model that can reliably perform the task.

Haiku -> Sonnet -> Opus

Escalate rather than repeatedly retrying a failing approach.

## Quality Loop

For substantial changes:

implement -> test -> review -> fix -> retest

Continue only while concrete defects remain.

Stop when:
- acceptance criteria are satisfied
- relevant tests pass
- identified defects are fixed
- no material issue remains

Do not create unnecessary review loops for small changes.

## Expensive Modes

Do not use Agent Teams, large fan-outs, or Ultracode by default.

Use them only when the task has enough independent work to justify their
additional token and coordination cost.

# Reference documents
Learning syllabus docs/y6-sci-u8.md

## Asset attribution

Every `.glb` under `public/assets/models/` must be listed in `src/content/credits.js`, either in:

- `MODEL_CREDITS` — a downloaded 3D asset that carries an external license (author, source URL, license name + URL). These are shown under the 3D assets section of the in-game Credits screen.
- `SELF_MADE` — a 3D model authored in-house. No external license, just a short note. Not shown on the Credits screen.

Other external creative work belongs in its own category list, such as `AUDIO_CREDITS` or `INSPIRATION_CREDITS`. `CREDIT_CATEGORIES` registers the lists shown by the Credits screen, so different asset types remain separate.

`tools/check-credits.mjs` (`npm run test:credits`) walks the models folder and fails if any file is missing from both model lists, listed in both, or if a model entry points at a file that no longer exists.

**When adding a new downloaded model:** drop the `.glb` into `public/assets/models/`, then add a `MODEL_CREDITS` entry with the matching `file` path (relative to `public/assets/models/`, e.g. `foods/prawns.glb`) in the same commit. `npm run test:credits` will fail until you do.

**When adding a new self-made model:** add a `SELF_MADE` entry instead.

**When adding audio, inspiration, or another external asset:** add it to the appropriate category list and register that list in `CREDIT_CATEGORIES` if needed.

The Credits screen (`Screens.js` → `credits()`) renders `CREDIT_CATEGORIES` directly — there is no separate copy to keep in sync, so updating `credits.js` is the only step needed.

## Procedural station models (`src/world/stations/`)

The procedural station class is the canonical model for both gameplay and the
Fact Book. Improve a method's machine in
`src/world/stations/<StationName>.js`; do not create separate Fact Book
geometry. `src/ui/factbook/models.js` resolves `METHODS[id].station` and
instantiates the same class, while `StationAutoplay` replays that class's real
interaction callbacks.

Keep the full station behaviour in the existing contract:

- `getSteps()` describes the controls.
- `onStepProgress()` and `onStepDone()` drive visible state from the current
  interaction.
- `playSuccess()`, `resetVisuals()` and `tick()` own the flourish, cleanup and
  continuous motion.
- Every animation must still work when `station.food` is absent: Fact Book
  autoplay demonstrates the machine without docking an ingredient.

Store every animated `THREE.Object3D` on the station instance (`this.lid`,
`this.needle`, etc.). `Station.batchStatic()` discovers those references and
keeps them out of the static merge; an unreferenced animated mesh may be merged
and become impossible to move. Prefer bounded, time-based animation over
cumulative per-input rotation so results do not depend on frame or pointer
event frequency.

Visual and mobile rules:

- Judge silhouette and mechanism readability at the kitchen's normal gameplay
  distance before adding close-up detail.
- Reuse materials, keep transparent surfaces scarce, and use modest cylinder
  and sphere segment counts. Static geometry is batched by material.
- Preserve the station envelope expected by the shared plinth and signage.
- Check both presentations: the busy kitchen-wide mobile view and the centred,
  close, three-point-lit Fact Book viewer. Different cameras and lighting are
  allowed; the underlying station geometry and animation are not.

Station GLBs in `public/assets/models/stations/` are experimental and remain
opt-in through `?models=1`. Do not enable one by default until it beats the
procedural station in both gameplay and the Fact Book. When working on an
opt-in GLB:

- rebuild one station with `PP_ONLY=<StationName>` and
  `tools/blender/build_stations.py`;
- keep `shell` plus explicitly named mover nodes in `MOVER_BINDINGS`;
- set each mover origin on its hinge and never bake object locations afterward
  (`transform_apply(location=False, ...)` and `export_apply=False`);
- ensure GLB and procedural pieces do not duplicate or overlap.

Verification loop for a station visual change:

```
npm run build
npm run test:notes
npm run test:factbook     # requires npm run preview on port 4173
```

Also inspect idle and complete interaction frames in a landscape-phone kitchen
view and in the Fact Book. Confirm animated parts remain inside the station
bounds and that the browser reports no errors. Run `npm run test:credits` when
adding, replacing or removing a `.glb`.

## The 3D Fact Book (`src/ui/factbook/`)

The Fact Book is a physical animated book with its own WebGL context, opened by
`Game.openFactBook()`. It arrives shut, is held there for a beat (`AUTO_OPEN_MS`
in `FactBook3D.js`) and then opens itself; a tap, click, Enter or Space during
that beat opens it early. Shut, it is presented centre stage and larger than
life; opening walks it across into the book zone, so the panel's half of the
screen is only claimed once there is something to put in it. Both framings are
computed in `_frameBook()` and cross-faded by `openness` — the size back early,
the position late.

The 3D book is the **preservation methods chapter**: methods divider → playable
methods → Fact-Book-only methods → why preservation matters. Spoilage
(`spoilage.*`) is taught by `Screens.factBook()`, the flat fallback used when
the WebGL context cannot be created.

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
