# Preservation Panic - Interactive 3D Fact Book

Build a premium interactive 3D Fact Book for **Preservation Panic - Year 6 Science, Unit 8: Food Preservation Technology**.

The goal is to replace the current flat Fact Book presentation with a physical animated 3D book while preserving the existing curriculum content architecture.

The supplied reference image is the primary visual target.

The finished experience should combine:

* the physical book opening and page-turning quality of the reference
* the layout shown in the supplied concept image
* the existing Preservation Panic visual style
* curriculum structure from `src/content/curriculum.js`
* existing Fact Book text from the locale files
* interactive 3D preservation-method models
* interactive 3D food models

The result should feel like:

**a physical interactive science field guide inside Preservation Panic**

It should not feel like:

* a normal webpage
* a modal
* a PDF reader
* a generic textbook
* a collection of UI cards placed on top of a book

---

# 1. PRIMARY EXPERIENCE

The complete interaction should feel like:

```text
Preservation Panic
        ↓
player opens Fact Book
        ↓
closed physical book appears
        ↓
book moves into reading position
        ↓
cover physically opens
        ↓
pages settle
        ↓
Fact Book content appears
        ↓
player navigates curriculum sections
        ↓
player reaches a preservation method
        ↓
interactive method model appears on right
        ↓
player rotates and explores method
        ↓
player explores suitable food models
        ↓
player turns pages
        ↓
book physically closes when leaving
        ↓
return to game
```

The physical animation is a major part of the feature.

Do not fake it by switching between separate closed-book and open-book images.

The same physical book should animate continuously.

---

# 2. EXISTING FACT BOOK IS THE CONTENT BASELINE

The existing Fact Book implementation is located at approximately:

```text
src/ui/Screens.js
factBook()
```

Treat the existing `factBook()` implementation as the authoritative reference for:

**what educational content belongs in the Fact Book.**

This task should primarily change:

```text
HOW CONTENT IS PRESENTED
```

not:

```text
WHAT CONTENT IS TAUGHT
```

Do not independently redesign, rewrite, shorten, expand, or reinterpret the curriculum unless required to fit the new layout.

The existing content pipeline should remain conceptually:

```text
curriculum.js
        +
locale content
        ↓
existing Fact Book content
        ↓
new 3D Fact Book presentation
```

Do not create:

```text
curriculum.js
        ↓
new independently written educational content
```

---

# 3. FACT BOOK HAS TWO CONTENT SOURCES

The Fact Book currently receives content from two separate systems.

Preserve this separation.

---

## SOURCE 1 - CURRICULUM STRUCTURE

Use:

```text
src/content/curriculum.js
```

and particularly:

```js
METHODS
FOODS
REFERENCE_ONLY_FOODS
MECHANISM
```

for structured curriculum information.

`curriculum.js` is the source of truth for things such as:

* method ID
* whether a method is playable
* station
* preservation mechanism
* what condition changes
* method colour
* accent colour
* icon
* primary curriculum foods
* secondary valid foods
* interaction type
* temperature settings
* solutions
* pasteurisation programmes
* source reference
* other method-specific data

Do not duplicate these relationships inside the new Fact Book.

The curriculum explicitly says food-method pairings must come from the notes rather than being added from general knowledge.

---

## SOURCE 2 - LOCALISED STUDENT-FACING TEXT

The actual educational prose should continue to come through the existing localisation system:

```js
t()
tList()
```

using the locale files such as:

```text
src/content/locales/en.js
src/content/locales/...
```

The important Fact Book locale groups currently include:

```text
spoilage.*
methods.<id>.explain
methods.<id>.exam
methods.<id>.detail
importance.*
```

Do not generate replacement English explanations inside the 3D rendering code.

Do not create a second set of Fact Book strings.

The architecture should remain:

```text
METHODS
    ↓
structure and relationships

locale files
    ↓
student-facing prose

both
    ↓
Fact Book view model
    ↓
3D book presentation
```

---

# 4. CORE ENGINEERING RULE

The new Fact Book is a **presentation-layer replacement**.

Do not rebuild the educational data model.

Think of the architecture as:

```text
METHODS answers:

"What method is this?"
"What mechanism does it use?"
"What foods belong to it?"
"What station represents it?"
"What source section does it come from?"

t() / tList() answer:

"What should the student read?"

Three.js answers:

"How should the student experience it?"
```

Keep these responsibilities separate.

---

# 5. FACT BOOK CONTENT FLOW

Preserve the existing Fact Book's three main content groups.

The physical book should roughly follow:

```text
COVER

↓

FOOD SPOILAGE
spoilage.*

↓

PRESERVATION METHODS
METHODS + methods.<id>.*

↓

WHY PRESERVATION MATTERS
importance.*

↓

END / CLOSE BOOK
```

---

# 6. FOOD SPOILAGE SECTION

The beginning of the physical book should use the existing:

```text
spoilage.*
```

locale content.

Preserve the existing Fact Book information covering topics such as:

* what food spoilage is
* why food spoils
* signs of spoilage
* senses used to identify spoilage
* the existing senses table
* the existing food-safety warning

Do not replace these sections with newly written introductory content.

They may be reformatted into one or more visually attractive book spreads.

For example:

```text
SPREAD 1

WHAT IS FOOD SPOILAGE?

[existing spoilage content]

[small visual]
```

Then:

```text
SPREAD 2

HOW CAN WE TELL FOOD HAS SPOILED?

[existing signs]

[senses visual/table]

[safety warning]
```

The visual presentation may change.

The meaning and curriculum content should not.

---

# 7. PRESERVATION METHODS SECTION

Generate preservation method pages from:

```js
Object.values(METHODS)
```

Do not maintain a manually duplicated list.

The Fact Book should support both:

```js
playable: true
```

and:

```js
playable: false
```

methods.

The curriculum intentionally contains methods that can be taught in the Fact Book even when they do not yet have playable stations.

Do not silently remove these methods.

---

# 8. PLAYABLE VS EXTRA METHODS

Preserve the conceptual distinction already used by the existing `factBook()` screen.

There are:

```text
PLAYABLE METHODS
```

and:

```text
EXTRA / NON-PLAYABLE METHODS
```

The book may visually organise these into chapters such as:

```text
PRESERVATION METHODS

Methods you use in the game
```

followed later by:

```text
MORE PRESERVATION METHODS

Additional methods from the curriculum
```

Do not imply that non-playable methods have gameplay stations when they do not.

---

# 9. METHOD CONTENT

For every method, combine the structure from `METHODS` with the existing locale prose.

Conceptually:

```js
const method = METHODS[methodId];

const explain = t(`methods.${method.id}.explain`);
const exam = t(`methods.${method.id}.exam`);
const detail = t(`methods.${method.id}.detail`);
```

The exact existing translation API should be reused rather than replaced.

Use these values to populate the new book and information panel.

---

# 10. METHOD SPREAD LAYOUT

Use one physical two-page spread per preservation method where practical.

The supplied reference layout should guide the design.

The book occupies approximately:

```text
55% - 65%
```

of the screen.

The information panel occupies approximately:

```text
35% - 45%
```

of the screen.

Overall layout:

```text
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│      PHYSICAL OPEN BOOK             DETAIL PANEL             │
│                                                              │
│      ┌──────────────────────┐       DRYING                   │
│      │                      │       [REMOVES WATER]          │
│      │   METHOD CONTENT     │                                │
│      │                      │       explanation              │
│      │                      │                                │
│      │                      │       ┌───────────────────┐    │
│      └──────────────────────┘       │ INTERACTIVE       │    │
│                                     │ 3D METHOD MODEL   │    │
│                                     └───────────────────┘    │
│                                                              │
│                                     SUITABLE FOODS           │
│                                     [3D] [3D] [3D] [3D]      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

# 11. PHYSICAL BOOK CONTENT

Keep the physical pages concise.

The book should contain the core educational explanation.

The right-side panel should provide deeper interaction.

Do not duplicate every sentence on both sides.

A good hierarchy is:

```text
BOOK
↓
core concept

RIGHT PANEL
↓
interactive exploration
+
additional detail
+
exam note
```

---

# 12. LEFT PAGE

Recommended structure:

```text
PRESERVATION METHOD

DRYING

[methods.drying.explain]

KEY IDEA

[mechanism visual]
```

Use curriculum fields such as:

```js
method.icon
method.colour
method.accent
method.mechanism
method.changes
```

for visual presentation.

Do not use those fields to invent new educational prose.

---

# 13. RIGHT PHYSICAL PAGE

The right page should visually explain the method.

For example, Drying could show:

* sun
* airflow
* drying rack
* food
* moisture leaving food

Use existing method content such as:

```text
methods.drying.detail
```

where appropriate.

The page may use diagrams, arrows or illustrations.

Avoid large blocks of text.

---

# 14. RIGHT INFORMATION PANEL

The right information panel should follow the supplied reference layout closely.

Example:

```text
DRYING

[REMOVES WATER]

[methods.drying.detail]


INTERACTIVE 3D MODEL

┌──────────────────────────────┐
│                              │
│       DRYING RACK            │
│                              │
│       drag to rotate         │
│                              │
└──────────────────────────────┘


SUITABLE FOODS

[FISH] [PRAWNS] [SQUID] [FRUITS]


EXAM NOTE

[methods.drying.exam]
```

Do not hard-code the Drying values.

This structure should work dynamically for every method.

---

# 15. METHOD MECHANISM BADGE

Generate the method badge from:

```js
method.mechanism
```

Mechanisms are defined centrally in `MECHANISM`, including values such as:

```js
REMOVES_WATER
LOW_TEMPERATURE
REMOVES_AIR
CHANGES_ENVIRONMENT
HIGH_TEMPERATURE
SEALS_SURFACE
HEAT_THEN_COOL
```

These are defined by the curriculum itself.

The human-readable badge label should be localised.

Do not create a separate mapping inside the Fact Book if an existing localisation mapping can be reused or extended.

---

# 16. DRYING EXAMPLE

Do not manually encode this example.

Use:

```js
METHODS.drying
```

The curriculum currently defines Drying with data including:

```text
station       DryingRack
mechanism     REMOVES_WATER
changes       water
icon          sun
foods         fish, prawns, squid, fruits
alsoWorks     meat, mushrooms, vegetables
interaction   hang-and-sun
sourceRef     §5B
```

These values come directly from the curriculum.

The UI should resolve this automatically.

---

# 17. INTERACTIVE METHOD MODEL

For playable methods, use:

```js
method.station
```

to determine which 3D preservation machine or setup to display.

Example:

```js
METHODS.drying.station
```

resolves to:

```text
DryingRack
```

The large right-side viewer should show that 3D station.

Do not maintain a separate mapping like:

```js
if (method === 'drying') model = 'DryingRack';
```

unless an asset loader requires a generic station-to-file mapping.

The method-to-station relationship must come from `METHODS`.

---

# 18. 3D METHOD VIEWER

The method viewer must be truly interactive.

Allow:

* drag to rotate
* limited zoom
* reset orientation

Show a subtle instruction:

```text
DRAG TO ROTATE
```

Keep controls restrained.

The player should not be able to lose the object by zooming or panning too far.

---

# 19. INTERACTION ZONES

Interaction zones must be isolated.

### Physical book

Used for:

* page dragging
* page turning

### Method viewer

Used for:

* model rotation
* model zoom

### Food viewer

Used for:

* food inspection

### Background

Not interactive while Fact Book is active.

Dragging the drying rack must never accidentally turn the book page.

---

# 20. METHOD HOTSPOTS

Where useful, add optional hotspots to the interactive method model.

These should reinforce existing curriculum concepts.

For example, Drying could have selectable parts such as:

```text
SUN
AIRFLOW
FOOD
```

Do not invent curriculum claims for the hotspot text.

Use existing localised curriculum wording or introduce localisation keys only when the content is supported by the existing curriculum.

Keep hotspots hidden until hovered or selected.

Avoid permanently covering the model with labels.

---

# 21. SUITABLE FOODS

Primary food examples must come from:

```js
method.foods
```

These are the curriculum's taught examples.

For Drying, the data currently contains:

```text
fish
prawns
squid
fruits
```

Do not manually put these into the UI.

Resolve them dynamically.

The curriculum treats these `foods` entries as the main taught associations.

---

# 22. ALSO WORKS

Some methods also define:

```js
method.alsoWorks
```

These are valid food-method relationships but are not the main Unit 8 taught examples.

Do not mix them equally with:

```js
method.foods
```

Use a secondary section such as:

```text
ALSO WORKS WITH
```

Make this visually less prominent than:

```text
SUITABLE FOODS
```

This preserves the distinction between:

* curriculum examples
* other valid applications

---

# 23. FOOD MODELS

Resolve available food assets from:

```js
FOODS
```

The `FOODS` structure already provides data such as:

* food ID
* model ID
* scale
* category
* primary association

for the gameplay food models.

Conceptually:

```js
const foodData = FOODS[foodId];

loadFoodModel(foodData.model);
setScale(foodData.scale);
```

Do not maintain another food-to-model table specifically for the Fact Book.

---

# 24. FOOD CARDS

Display primary curriculum foods as small interactive 3D cards.

Example:

```text
SUITABLE FOODS

┌────────┐
│  3D    │
│ FISH   │
└────────┘

┌────────┐
│  3D    │
│PRAWNS  │
└────────┘

┌────────┐
│  3D    │
│ SQUID  │
└────────┘

┌────────┐
│  3D    │
│ FRUITS │
└────────┘
```

Food labels should use localisation.

The models should match the low-poly style of Preservation Panic.

Recognition is more important than realism.

---

# 25. FOOD INSPECTION

Selecting a food should allow focused inspection.

For example:

```text
PRAWNS
```

The player can:

* rotate the model
* slightly zoom
* reset orientation

Provide a clear:

```text
BACK TO METHOD
```

control.

Do not make the user close the Fact Book to return.

---

# 26. REFERENCE-ONLY FOODS

Some foods are intentionally part of the curriculum but have no gameplay model.

These are represented by:

```js
REFERENCE_ONLY_FOODS
```

Current examples include items such as rendang, jam, bananas, apples, oranges and tomatoes.

The Fact Book must still teach these foods.

If no 3D model exists:

* use a simple illustration
* or use a clean icon
* show the localised food name

Do not omit curriculum content because an interactive asset does not exist.

---

# 27. PLAYABLE METHODS

Where:

```js
method.playable === true
```

and:

```js
method.station
```

exists:

show the actual or visually equivalent gameplay station in the interactive 3D viewer.

This helps the Fact Book reinforce recognition of the machine the player will use during gameplay.

---

# 28. NON-PLAYABLE METHODS

Where:

```js
method.playable === false
```

do not imply a playable machine exists.

Still show:

* method page
* explanation
* detail
* exam content
* mechanism
* foods
* source information

For the visual area, use:

* a small educational 3D illustration
* or diagram
* or appropriate visual asset

The distinction between playable and curriculum-only methods must remain clear.

---

# 29. SHARED STATIONS

Do not assume:

```text
one station = one method
```

For example, Freezing and Cooling intentionally share the same physical station but remain separate methods.

They have different:

* target temperatures
* food lists
* educational meanings

The curriculum explicitly separates them for this reason.

They must have separate Fact Book pages.

---

# 30. METHOD-SPECIFIC VISUALS

Do not force every method into an identical generic animation.

Use method-specific curriculum data where available.

---

## DRYING

Use:

```js
station
mechanism
interaction
foods
```

to show:

* drying rack
* sun
* airflow
* moisture removal

---

## FREEZING

Use:

```js
targetC
acceptC
```

to make the temperature concept visible.

Show:

* freezer
* thermostat
* low-temperature visualisation

---

## COOLING

Do not present Cooling as simply another Freezing page.

Use its own:

```js
targetC
acceptC
foods
```

and its own locale content.

---

## VACUUM PACKING

Use:

```js
mechanism
interaction
```

to demonstrate:

```text
air leaves package
        ↓
package tightens
        ↓
food remains sealed
```

---

## PICKLING

Use curriculum-defined solution data.

The interactive visual can show:

```text
food
 ↓
jar
 ↓
preservation solution
 ↓
seal
```

Do not add solutions that are not defined by the curriculum.

---

## SALTING

Use the curriculum mechanism and interaction to show:

* salt being applied
* moisture leaving food
* preservation effect

---

## PASTEURISING

Pasteurising must not be visually reduced to just:

```text
HEAT
```

Its curriculum mechanism explicitly represents:

```text
HEAT
+
IMMEDIATE COOLING
```

The curriculum models it as `HEAT_THEN_COOL` and includes specific programmes and chilling behaviour.

The animation should show both phases.

---

## SMOKING

Show:

* smokehouse
* hanging food
* smoke
* long process
* moisture reduction where supported by curriculum content

---

## CANNING

The visual should demonstrate both:

```text
HIGH TEMPERATURE
+
AIRTIGHT SEALING
```

The curriculum explicitly defines both parts of this method.

Do not teach only heating.

Do not teach only sealing.

---

# 31. EXAM CONTENT

The existing locale system provides:

```text
methods.<id>.exam
```

Retain this content.

A good placement is a compact:

```text
EXAM NOTE
```

section in the right panel.

Do not alter the existing exam answer wording unless required by localisation or existing app conventions.

---

# 32. SOURCE REFERENCES

Preserve:

```js
method.sourceRef
```

through the Fact Book view model.

Example:

```text
§5B
```

The curriculum uses these references so the educational material can be audited against the teaching notes.

It does not need to dominate the student-facing layout.

Possible presentation:

```text
Source: §5B
```

in small text.

Or expose it through:

* teacher mode
* information tooltip
* developer mode

But do not discard it.

---

# 33. WHY PRESERVATION MATTERS

After the methods section, preserve the existing content under:

```text
importance.*
```

This becomes the closing educational section.

Do not write a new replacement summary.

Use the existing:

```js
t()
tList()
```

content.

A visually strong final spread could be:

```text
WHY PRESERVE FOOD?

[existing importance.* content]

[small supporting illustrations]
```

Then allow the student to close the book.

---

# 34. BOOK COVER

The closed book should read something like:

```text
PRESERVATION FIELD GUIDE

Year 6 Science
Unit 8
```

Use Preservation Panic's visual language:

* cream
* blue
* cyan
* orange
* warm wood tones

Possible subtle cover symbols:

* sun
* snowflake
* jar
* water droplet
* thermometer
* leaf

Do not make the cover look like a corporate software book.

Do not make it overly childish.

Target:

**high-quality educational field guide**

---

# 35. BOOK MODEL

Construct the physical book from separate components:

* front cover
* back cover
* spine
* hinges
* shoulders
* endpapers
* page block
* individual interactive sheets
* page-edge layers
* bookmark
* cover artwork
* spine artwork
* back artwork
* contact shadows

The silhouette should remain clearly book-like.

Avoid:

* pill-shaped covers
* excessively rounded spine
* floating sheets
* paper clipping through cover
* rubber-looking pages

---

# 36. MATERIALS

Use physically based materials.

### Cover

* subtle coated-paper or cloth texture
* restrained roughness
* small normal detail

### Pages

* warm cream
* subtle grain
* visible layered edges
* slight roughness variation

Keep texture detail subtle enough that text remains readable.

---

# 37. OPENING ANIMATION

The opening animation is one of the most important parts.

Sequence:

```text
closed book
    ↓
moves into reading position
    ↓
rotates slightly toward player
    ↓
front cover cracks open
    ↓
front cover rotates around hinge
    ↓
first pages respond subtly
    ↓
book reaches open pose
    ↓
pages settle
    ↓
right panel appears
    ↓
interactive content activates
```

Do not cross-fade between separate book states.

The physical geometry must animate continuously.

---

# 38. COVER HOVER

While closed:

* hovering may crack the cover open slightly
* leaving returns it to closed
* clicking commits to full opening

Keep the motion restrained.

Do not use exaggerated bounce.

---

# 39. PAGE TURNING

Allow page turns using:

* pointer drag
* swipe
* previous button
* next button
* keyboard arrows

Use segmented page geometry.

The active page should:

1. lift from the outer edge
2. curl
3. twist slightly
4. cross the spine
5. flatten onto the opposite side
6. settle

The page must behave like paper, not a rigid card.

---

# 40. PAGE DRAGGING

During pointer dragging:

* page movement should respond directly to drag progress
* page curvature should change progressively
* page shadow should change
* user must be able to reverse before commitment

If released before threshold:

```text
return page
```

If released after threshold:

```text
complete turn
```

Never allow a committed page to spring back.

---

# 41. PAGE SHADOWS

Page shadows are important to the physical feel.

When the sheet lifts:

* contact shadow separates from the page underneath

When it crosses the spine:

* shadow moves across the opposite page

When it lands:

* shadow becomes a subtle contact shadow again

Avoid dark theatrical shadows.

---

# 42. BOOK AND PANEL SYNCHRONISATION

The book and right panel must always refer to the same curriculum section.

When moving from one method to another:

```text
current page begins turning
        ↓
current 3D model starts fading
        ↓
page approaches midpoint
        ↓
selected method changes
        ↓
new physical page becomes visible
        ↓
new title / text appears
        ↓
new 3D model fades in
        ↓
new foods appear
```

Do not change the panel immediately when the pointer first touches the page.

Synchronise it with page-turn progress.

---

# 43. METHOD TRANSITION TIMING

Recommended:

### 0-25%

Current method remains active.

### 25-50%

Current 3D model begins fading or scaling down slightly.

### Around 50%

Page crosses the spine.

Update selected method.

### 50-75%

New UI content appears.

### 75-100%

New method model finishes appearing.

Keep the complete transition responsive.

---

# 44. METHOD NAVIGATION

Generate method navigation dynamically.

Do not hard-code:

```text
Method 4 of 8
```

Use actual curriculum data.

For example:

```js
const methods = Object.values(METHODS);
```

Then derive:

```text
METHOD X OF Y
```

from the selected index.

Optional method tabs may also be generated dynamically.

---

# 45. MODEL PRELOADING

Preload nearby assets where practical.

When viewing one method, consider keeping:

```text
previous model
current model
next model
```

ready.

Page turning must not freeze while a 3D asset loads.

If loading takes time:

* continue page animation
* show a lightweight viewer placeholder

---

# 46. BOOK CLOSING

Allow closing using:

* close button
* Escape
* cover drag from the appropriate starting page

Sequence:

```text
method model disappears
        ↓
right information panel fades
        ↓
pages settle
        ↓
front cover closes
        ↓
book settles
        ↓
Fact Book mode ends
        ↓
Preservation Panic resumes
```

Do not destroy the book geometry before the close animation completes.

---

# 47. CAMERA

Keep the main reading camera controlled.

Do not use free OrbitControls for the whole Fact Book.

The book should stay framed similarly to the reference.

Use OrbitControls only where useful for:

* method model inspection
* food inspection

The physical book itself should remain intentionally presented.

---

# 48. ART DIRECTION

Combine:

### Premium editorial book design

* strong typography
* large margins
* cream paper
* restrained decoration
* controlled whitespace
* subtle rule lines

with:

### Preservation Panic

* friendly low-poly objects
* orange
* cyan
* blue
* cream
* warm wood
* playful science icons

Target:

**a magical interactive science field guide from the Preservation Panic world**

---

# 49. TYPOGRAPHY

Use clear hierarchy.

### Main method title

Large display or serif type.

### Book section labels

Small uppercase sans serif.

### Body content

Highly readable serif or sans serif.

### Right panel title

Large and confident.

### Controls

Simple sans serif.

Prioritise readability over decorative typography.

---

# 50. METHOD COLOUR

Where suitable, derive visual accents from:

```js
method.colour
method.accent
```

Use them for:

* method icon
* badge
* small book highlights
* active tab
* hotspot
* viewer accent

Do not recolour the entire screen for every method.

Keep the overall Preservation Panic visual identity stable.

---

# 51. LOW-POLY STYLE

Method and food models should match the game's existing low-poly visual language.

Prioritise:

* clear silhouette
* recognition
* friendly proportions
* matte surfaces
* good lighting

Avoid excessive photorealism.

A Year 6 student should immediately recognise each food.

---

# 52. RESPONSIVE DESIGN

Desktop is the primary target.

Large desktop:

```text
BOOK | INFORMATION PANEL
```

Smaller laptop:

```text
slightly smaller book | narrower panel
```

Tablet / narrow layouts:

```text
BOOK

INFORMATION PANEL
```

Do not simply scale desktop UI until the text becomes unreadable.

---

# 53. STATE MACHINE

Use a clear interaction state machine.

Recommended states:

```text
closed
opening
reading
page-drag
page-return
page-turn
section-transition
method-transition
method-model-inspection
food-inspection
closing
```

Only allow relevant interactions in each state.

Examples:

* rotating a food must not turn the page
* rotating a method must not move the book
* closing during an active page turn should resolve safely

---

# 54. ANIMATION ENGINEERING

Use time-based deterministic animation.

Do not rely on frame-dependent completion such as:

```js
position += (target - position) * 0.1;
```

for important state transitions.

Use:

```text
start value
+
elapsed time
+
duration
+
easing
+
exact destination
```

At completion, explicitly assign exact final transforms.

Apply this to:

* book movement
* opening
* closing
* page turning
* page returning
* model transitions
* panel transitions
* camera movement

---

# 55. PAGE GEOMETRY

Use segmented geometry for active sheets.

Calculate deformation progressively from:

```text
spine
 ↓
inner sheet
 ↓
middle
 ↓
outer edge
```

Support:

* curl
* slight twist
* subtle settling

Do not make paper behave like cloth.

---

# 56. PERFORMANCE

Target smooth performance on a normal modern laptop.

Optimise:

* shadow resolution
* page segment count
* texture size
* food-model polygon counts
* draw calls
* transparent materials

Reuse assets where practical.

Dispose of unused Three.js resources correctly.

Do not recreate the renderer during page changes.

---

# 57. ACCESSIBILITY

Provide:

* accessible button names
* keyboard navigation
* Escape to close
* arrow-key page navigation
* visible focus state
* status announcements where practical

Respect:

```css
prefers-reduced-motion: reduce
```

With reduced motion:

* shorten book opening
* shorten page turns
* remove non-essential camera motion
* maintain clear state transitions

---

# 58. CURRICULUM VALIDATION

Use the existing:

```js
validateCurriculum()
```

during development.

If curriculum validation returns problems:

* log them clearly
* do not silently ignore them
* do not compensate by hard-coding values in the Fact Book

The existing validator protects relationships between methods, foods and stations.

---

# 59. DO NOT DUPLICATE CURRICULUM DATA

Avoid:

```js
const dryingFoods = [
  'fish',
  'prawns',
  'squid',
  'fruits'
];
```

Use:

```js
METHODS.drying.foods
```

Avoid:

```js
if (method === 'drying') {
  model = 'DryingRack';
}
```

Use:

```js
METHODS[method].station
```

Avoid:

```js
const dryingDescription =
  'Drying removes water from food...';
```

Use the existing locale key:

```js
t('methods.drying.explain')
```

The 3D Fact Book should not become a second curriculum database.

---

# 60. RECOMMENDED ARCHITECTURE

Keep the systems separate:

```text
src/content/curriculum.js
        │
        ├── METHODS
        ├── FOODS
        ├── MECHANISM
        └── REFERENCE_ONLY_FOODS
                    │
                    ↓
          structured Fact Book data
                    │
                    +
                    │
        locale t() / tList()
                    │
                    ↓
            FactBookViewModel
             │            │
             ↓            ↓
        Physical Book   Detail Panel
             │            │
             ↓            ↓
        page system     method viewer
                       food viewer
```

---

# 61. VISUAL VERIFICATION

Do not only test functionality.

Capture screenshots of:

1. closed book
2. book 25% open
3. book 50% open
4. book 75% open
5. fully open spoilage section
6. first method spread
7. Drying method spread
8. Drying interactive rack
9. Drying food cards
10. selected food inspection
11. page 25% turned
12. page 50% turned
13. page 75% turned
14. next method settled
15. non-playable method page
16. importance section
17. closing animation

Compare against the supplied reference.

---

# 62. VISUAL GAUNTLET

Review each major area separately.

## Composition

* Is the book large enough?
* Is it positioned like the reference?
* Does the panel have sufficient whitespace?
* Is the hierarchy obvious?

## Book quality

* Does it feel physical?
* Is the spine believable?
* Are the covers thick enough?
* Do pages have visible depth?

## Opening

* Does the same physical object transition continuously?
* Are there any jumps?

## Page turns

* Do pages bend naturally?
* Are shadows correct?
* Can the turn be reversed?

## Content

* Does it preserve the existing Fact Book information?
* Is student prose still coming from localisation?
* Are curriculum relationships still coming from `METHODS`?

## Method viewer

* Is it obvious the model can be interacted with?
* Does rotation feel smooth?

## Foods

* Are models recognisable?
* Are primary and secondary foods correctly distinguished?

## Preservation Panic identity

* Does the feature feel like part of the existing game?

---

# 63. ITERATION LOOP

For each subsystem:

```text
implement
   ↓
run actual game
   ↓
inspect visually
   ↓
compare with reference
   ↓
identify largest weakness
   ↓
fix
   ↓
run again
```

Evaluate independently:

1. book model
2. cover design
3. opening animation
4. reading composition
5. spoilage spreads
6. method spread design
7. page physics
8. method viewer
9. food viewer
10. localisation
11. curriculum binding
12. closing section
13. closing animation
14. responsive layout

Do not stop when the feature is merely functional.

---

# 64. FINAL ACCEPTANCE CRITERIA

The feature is complete when:

* Fact Book opens as a physical 3D book
* opening is one continuous animation
* open layout closely follows the supplied reference
* the existing `factBook()` content structure is preserved
* `spoilage.*` drives the opening educational section
* `METHODS` drives preservation method structure
* `methods.<id>.explain` is reused
* `methods.<id>.detail` is reused
* `methods.<id>.exam` is reused
* `importance.*` drives the closing educational section
* student-facing prose still comes from `t()` / `tList()`
* methods are not hard-coded separately
* food-method relationships are not duplicated
* source references remain attached
* playable and non-playable methods are preserved
* non-playable methods remain teachable
* shared stations do not merge distinct methods
* primary foods and `alsoWorks` remain visually distinct
* reference-only foods are not lost
* playable methods use their station models
* method models can be rotated
* food models can be inspected
* model interaction does not interfere with page turning
* page turns physically bend
* completed pages do not spring back
* closing is physically animated
* localisation continues working
* `validateCurriculum()` reports no curriculum problems
* there are zero new console errors
* there are zero new console warnings caused by the feature
* the new implementation does not become a second source of curriculum truth
* the experience feels like a polished interactive science field guide inside Preservation Panic

---

# 65. MOST IMPORTANT CONSTRAINT

**Do not rebuild or rewrite the Fact Book's educational content architecture.**

Preserve:

```text
curriculum.js
+
existing locale content
+
existing Fact Book curriculum coverage
```

Replace:

```text
flat Fact Book presentation
```

with:

```text
physical animated 3D book
+
interactive method viewer
+
interactive food viewer
```

