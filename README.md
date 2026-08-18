# Preservation Panic!

A Year 6 Science game for **Unit 8 — Food Preservation Technology**, built with
Three.js. Six preservation methods, each with its own machine and its own
physical interaction, wrapped in a six-stage curve that goes from recognition to
unaided recall.

Needs **Node 18, 20 or 22**. If `npm run dev` reports *Cannot find native
binding*, delete `node_modules` and `package-lock.json` and install again —
npm's optional-dependency bug leaves the platform binary behind.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
npm run preview    # serve the build
```

Landscape-first for tablets and desktop; playable in portrait. Mouse, touch and
keyboard all work.

---

## The source of truth

Every educational claim comes from the supplied notes,
*Year 6 Science — Unit 8: Food Preservation Technology*. The exam sentences are
**verbatim**. Each method carries a `sourceRef` (`§5B`, `§5E`, …) pointing at the
section it came from, so the game can be audited against the handout.

The notes list ten methods. Six are playable stations; the other four (boiling,
waxing, smoking, canning and bottling) are in the Fact Book so the unit is
covered end to end.

**Freezing and cooling are two methods, not one.** §5E gives them different
temperatures and different food lists, and §7 lists them as separate rows. They
share one cabinet in the game — one dial, two settings — but the game always
reports the correct name: chicken at −18 °C is *Freezing*, milk at 4 °C is
*Cooling*.

---

## Content architecture

Curriculum content is completely separate from gameplay code.

```
src/content/
  curriculum.js       structure only: methods, mechanisms, foods, stages, scoring
  quiz.js             questions BUILT from the curriculum, never hand-written
  i18n.js             dotted-key lookup with automatic fallback to English
  locales/
    en.json           every display string
    zh.json           中文 — terminology from §10 of the notes
    ms.json           Bahasa Melayu — KSSR terminology
```

Rules that keep it honest:

- No gameplay file contains a display string. Everything goes through `t('…')`.
- A locale may be partial; missing keys fall back to English, so a
  half-translated language still ships.
- `validateCurriculum()` runs at boot and fails loudly on an invented
  food-method pairing, a food claimed by two methods that share a station, or a
  stage referencing a method that does not exist.

Adding a language is one JSON file plus one line in `i18n.js`. No gameplay code
changes.

### Changing the difficulty curve

`STAGES` in `curriculum.js` is data. A teacher can retune spawn rate, spoilage
speed, quiz frequency, targets and every hint flag without touching code:

| Flag | Effect |
| --- | --- |
| `showStationLabels` | name plates on the machines |
| `showMethodHintOnFood` | a chip on the food naming its method |
| `shufflePositions` | re-deal the slots at stage start |
| `reshuffleMidStage` | also re-deal *during* play |
| `allowFactBook` | whether the reference book can be opened mid-run |
| `quizChance` | probability of a question after a preservation |

---

## The six interactions

Each station is a different motor action, because the hand remembers what the
head is still learning. None of them reduce to the same button.

| Method | Interaction | What it makes physical |
| --- | --- | --- |
| **Drying** | hang it, then **sweep** the sun across | the player's own drag drives the water out |
| **Freezing / Cooling** | open, load, close, then **turn the dial** | 0 °C and below vs around 4 °C — the band changes per food |
| **Vacuum packing** | **hold** the pump until the gauge hits zero | air is a quantity you have to remove; let go and it leaks back |
| **Pickling** | drop in, **choose** a solution, pour, seal | all three solutions are correct, and the game says so |
| **Salting** | scoop, then **scrub** to full coverage | "a large quantity of salt" has to be worked for |
| **Pasteurising** | choose a programme, **hold** to heat, **cool in time** | a countdown makes "cooled immediately" a felt rule |

The controls are DOM widgets docked under the 3D machine. That is deliberate:
raycast gestures onto 3D parts shift with the camera, are smaller than a
fingertip on a phone, and are invisible to screen readers. The machine does all
the animating; the control stays big, readable and keyboard-operable.

---

## How recall is actually built

Progressive removal of scaffolding, in this order:

1. **Learn** — two methods, method chip on the food, full memory panel, slow spoilage.
2. **Practice** — four stations, cooling joins so the dial stops having one answer, chip off.
3. **Panic** — all six, memory panel collapses to a peek button that **costs the combo**.
4. **Recall** — labels off, positions re-dealt, Fact Book closed. A process clue replaces the name.
5. **Why It Works** — a question after *every* preservation. No clue on the machine: the answer must not be on screen.
6. **Mastery** — positions re-deal mid-stage, recognition questions removed entirely.

Loopholes that are explicitly closed:

- **Screen position** — slots are re-dealt for every label-free stage, so a
  position learned in Stage 3 carries no information into Stage 4.
- **Option order** — quiz options and distractors are re-shuffled per question.
- **Trial and error** — wrong drops cost score and combo, the score is not
  clamped at zero, and the Fact Book is locked from Stage 4.
- **The freezer dial** — confirming the wrong temperature is a real failure that
  states the correct band ("Milk needs around 4 °C") rather than a button that
  refuses to appear until you are already right.

Wrong answers always teach: the correct option is revealed, and the verbatim
exam sentence is shown on **both** outcomes. A per-method miss ledger persists
across sessions and biases later questions toward whatever the child keeps
getting wrong.

---

## Visuals

Six stations sit on a horseshoe arc behind the prep table. Two earlier layouts
failed for opposite reasons — straight columns hid the back machines, and fanned
columns pushed the outer pair off a 16:9 frame. On the arc every machine is at a
similar depth, so nothing occludes anything, and because the camera looks down
the centre-back stations project *above* the table rather than behind it.

- One warm key with a tight shadow frustum, a cool fill, a back rim, and
  `RoomEnvironment` IBL so `MeshPhysicalMaterial` clearcoat has something to
  reflect. ACES tonemapping with restrained bloom.
- All geometry is procedural. Every hard edge is bevelled — sharp boxes are the
  fastest way to look like a placeholder.
- The room is authored as ~200 small meshes and batched by material at startup
  (`mergeStatic`), which is most of the frame's draw calls removed for free.
- Camera framings are **data** (`Stage3D.setCameraFraming`), and the dolly
  distance is solved from the horizontal half-angle so the whole arc stays in
  frame at any aspect ratio.

Microorganisms are the load-bearing teaching object. Activity 0–1 drives
population, orbit speed, colour and facial expression simultaneously — four
redundant channels, so the state reads at a glance and survives colour-blindness.
Each method has its own defeat animation (drying shrivels them, vacuum crushes
them flat, heat pops them), because the *shape* of the animation is the mnemonic.

Sound is synthesised with WebAudio — zero audio payload, works offline, and each
station has its own success signature as another recall channel. Every hook is a
named event (`sfx('preserve.freezing')`) so recorded assets can replace them
behind the same call sites.

---

## Tools

```bash
node tools/check-content.mjs   # curriculum + quiz + locale coverage test
node tools/probe.mjs           # drives all six interactions, asserts outcomes
node tools/shoot.mjs           # screenshots each stage and station
node tools/quick.mjs           # fast single-screen visual check
node tools/models.mjs          # A/B: Blender shells vs procedural machines
PP_NO_GLB=1 node tools/models.mjs
```

All four need a server on `:4173` (`npm run preview`, or
`python3 -m http.server 4173 --directory dist`).

`window.__pp.pump(seconds)` advances the game deterministically — headless
browsers throttle `requestAnimationFrame` hard, which otherwise catches every
screenshot mid-transition.

---

## The Blender pipeline

`tools/blender/build_stations.py` builds all six machines from primitives and
exports one GLB per station, named exactly as the game names it:

```bash
blender --background --python tools/blender/build_stations.py
# -> public/assets/models/stations/DryingRack.glb, Freezer.glb, …
```

Each file is a small hierarchy, not one welded lump: a `shell` mesh plus one
node per moving part, with the origin already baked onto its hinge.
`src/world/AssetRegistry.js` declares which node drives which station property:

```js
Freezer: { door: 'door', dial: 'dialKnob' }
```

`Station.useModel()` re-parents each named node onto the procedural pivot that
already animates it, drops every node it was not asked for, and hides the
procedural geometry nothing animates. So a shell can be swapped in without
touching a single line of interaction or animation code.

**It is off by default, and that is a judgement, not an oversight.** Run
`tools/models.mjs` both ways and the comparison is not close: the procedural
machines carry canvas-drawn temperature displays, pressure gauges, snowflake
badges and dial faces, and the exported meshes have no equivalent — a freezer
loses its `-- °C` readout and its frosted window and becomes a white box. Six
machines that read at a glance is the whole point of the layout, so the
procedural set stays the shipped look. Add `?models=1` to load the GLBs.

Closing that gap means giving the Blender models their own baked textures rather
than flat material colours. The loader, the naming contract and the mover
bindings are all in place for that work; nothing about it needs gameplay changes.

Current cost of the set: 35 476 triangles, 991 KB across six files, no Draco —
the decoder would outweigh what it saves at this size and the game works offline.

---

## Known gaps

- **The Blender shells lose to the procedural machines** and are therefore
  opt-in — see the section above. The pipeline itself is finished and verified
  end to end; the models need baked textures before they are worth switching on.
- **Foods are procedural only.** `FoodFactory` is structured the same way, so
  the same GLB route is open for them, but no food assets have been built.
- **Chinese and Malay need a teacher's eye.** The terminology comes from §10 of
  the notes and standard KSSR usage, but the gameplay chrome around it is a
  translation, not a review.
- Boiling, waxing, smoking and canning are Fact Book only. Promoting one to a
  station needs a `station` class and a slot; the data is already there.
"# game-food-preservation" 
