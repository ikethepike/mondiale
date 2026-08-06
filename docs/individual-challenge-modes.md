# Twenty individual challenge modes

Group rounds and the final gauntlet have accumulated genuinely inventive formats — hidden
roles (manhunt), turn-based elimination (border chain), duplicate-cancel scoring
(unique or bust), chronological insertion (timeline), pin-distance contests (heritage hunt),
a night sweep you type against (sunset blitz). The individual gates have not kept pace.

This document diagnoses why, then proposes twenty modes that each introduce a **verb or a
stakes shape the gate does not currently have**, grounded in data the repo already ships.
Two of them — **Errata** and **Rosetta** — are built; the other eighteen are on the record
here rather than lost in a chat log.

---

## Diagnosis

Fifteen variants in `types/challenges/individual-challenge.type.ts` at the time of writing,
but only three verbs between them:

| Verb                                       | Variants                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recognize** (pick 1 of 4 from a picture) | `flag-pick`, `flag-twins`, `capital-match`, `landmark-quiz`, `leader-pick`, `leader-portrait`, `money-match`, `odd-one-out`, `trajectory-match` |
| **Identify a revealed shape**              | `border-detective`, `zoom-out`, `outline-reveal`                                                                                                |
| **Compare / locate**                       | `higher-lower`, `trend-duel`, `find`                                                                                                            |

Nine of fifteen are the same interaction with a different noun on the card.

**One stakes shape, and it is coarse.** `gateLeapSteps` pays `GATE_LEAP_STEPS = 2` or the walk
is forfeited. `buzzFraction`'s `BUZZ_FLOOR = 0.35` means even a last-millisecond correct answer
pays 1 step, so the curve cannot express "correct but barely", and nothing pays more than 2.
No gate anywhere produces a graded outcome.

**The hint economy could not function.** `GATE_HINT_BITE_STEPS` (2) equalled
`GATE_LEAP_STEPS` (2) — buying one hint on an untimed gate zeroed the leap outright. Hints
could only ever buy safety, never value, because no pot was large enough to make a hint a
_trade_. (`gatePot` now lets a variant declare a deeper pot; Errata and Rosetta both do.)

**Zero agency.** The player chooses nothing at a gate except the answer itself. No stake, no
route, no line of questioning.

**Zero board awareness.** No gate reads `player.currentPosition`, the standings, or anything
about the rest of the table.

**Data sitting unused.** `PYRAMIDS` — referenced by nothing outside its generator.
`CAPITAL_FACTS.timezone` — the file is read only for etymology, never the offsets.
`NAME_FACTS.etymology` — reveal copy only. `TONGUE_FACTS` — one scoreboard. `STRAITS` — border
chain's hop rules only. `lib/flags/forge.ts`, a complete synthetic-flag generator, flies only
on `/health`. `COMMODITY_EXPORTERS`, `TREATIES`, `CHANGES`, `MIGRATION` — final challenge only.

### Constraints any new gate must respect

- **Solo and simultaneous.** Several players sit in gates at once and the round barrier waits
  for the slowest walker, so 20–40s is the ceiling (`BORDER_DETECTIVE_SECONDS = 40` is the
  current high-water mark). This also rules out audio gates: same room, colliding clips.
- **The wire carries one ISO code.** `submit-individual-challenge-answer` takes `isoCode`,
  `remainingFraction`, `hintsUsed`, `gateTile`. Anything else grades client-trust
  (higher-lower's precedent) or needs the payload widened.
- **Gate tiles are typed by `individualChallengeAccessors`** (`lib/tiles.ts`) — eight of them:
  six named for the data a gate asks about, plus `errata` and `lexicon`, named for a kind of
  thinking. A new mode either files under an existing theme (`isoCode` is the catch-all) or
  joins a category, which is the only way it can carry a board marker: tiles are dealt at game
  creation, long before any challenge is, so a marker reflects the tile's **theme** and never
  the variant the player will meet there. Themes are categories, never modes — see _Tile themes
  are categories_ under Shared work.

---

## Built

### 1. Errata — one thing on this map is wrong

A connected cluster of countries frames up wearing written names. Exactly one is a misprint:
on hard, two neighbours are wearing each other's names; below it, one country wears a name
borrowed from off the stage. Tap the mistake.

**Verb:** error detection in a composite. Two truths does this for stats; nothing did it
spatially.

**Data:** `map.gen` (`MAP_BOUNDS`), `BORDERS`. The lineup is grown outward over land borders,
and every member must clear `isLabelableBox` — the same threshold the map's label builder
uses, so a lineup member the renderer would skip can never be dealt.

**Grading:** plain ISO submit. A swap makes two countries wrong, so `isCorrectIndividualAnswer`
accepts either culprit — the same variant-scoped carve-out shape the shared-currency gate uses.

**Stakes:** 30s clock, pot of 4, one buyable hint that dims half the innocents (never a
culprit).

**On the board:** the **errata** gate, under a foxed-paper top — the only near-neutral on the
board, so it reads as a page rather than a place. The marker is a post carrying two name plates
tilted opposite ways, the upper one in the board's alert red, which no other marker uses. Like
the lexicon gate it is a category tile; Counterfeit belongs here when it lands, and its arrival
is the point at which the signposts will have to widen into something that also covers a forged
flag.

### 2. Rosetta — finish the pair

> **Everest : Nepal :: Aconcagua : \_\_\_**

The exemplar pair is what tells you which relation is meant, so the same country can head
three different questions (_Tokyo : Japan_, _Fuji : Japan_, _Yen : Japan_) without either
being ambiguous.

**Verb:** pattern completion. It is reasoning rather than recall, and the only gate where the
player has to infer the _question_ as well as the answer.

**Data:** `lib/rosetta.ts` holds the relations — capital, highest peak, currency, leader,
landmark — each reading through the module that already owns its data (`politicalLeader`,
`currencyName`, `LANDMARKS`, `COUNTRIES`). Dealer, hint and reveal all read that one table.

Two guards make a term dealable, and the **order is load-bearing**: index every term first,
_then_ scrub. A term must (a) identify exactly one country on earth, and (b) not name its own
country. Scrubbing while indexing would drop Switzerland's "Swiss franc" for naming itself and
leave Liechtenstein holding the term alone — a "unique" answer that marks Switzerland wrong.

There is deliberately **no demonym relation**: `mentionsCountry` reads `name.demonyms` as
markers, so every demonym betrays its own country and all 193 are rejected. That is the
giveaway gate working, not a gap — _Dane : Denmark_ is not a question.

**Grading:** typed answer, plain ISO submit.

**Stakes:** 30s clock, pot of 4, one buyable hint that names the relation. Easy mode is given
the relation free — working it out from the exemplar _is_ the mode, so below easy it costs
steps or nothing.

**On the board:** the **lexicon** gate — a quill standing in an ink pot, on a vellum top.

Four attempts got there, and the failures are the useful part. A banded stele was legible and
mute: distinct from its neighbours, silent about the gate. An open book worked but said
"knowledge" rather than "naming". Two quills failed because they were built as a shaft with
something attached to it, which reads as a spatula in a pot — in a real quill the **feather is
the mass** and the nib is a detail. The shipped one is a broad swept blade extruded from a
bezier outline with the rachis curving through it, and the sweep is also what makes it survive
the board's-eye camera: a curve presents area from above where a straight lean presents none.

The tile is a category, not this mode — see below. Rosetta is its only tenant today, and
promotion costs it nothing: the capital, currency, leader and landmark tiles still deal
analogies in their own register (`ROSETTA_RELATIONS_BY_ACCESSOR`), while the lexicon tile draws
from all of them.

---

## Proposed

### 3. The Ante — pick your stake before the card

Three doors before the question loads: **Safe** (+1, easy tier) · **Standard** (+2) · **Bold**
(+4, and a miss also knocks you back). The content behind each is the difficulty tier the
dealers already compute — `flag-pick` vs `flag-twins`, icon landmark vs deep cut, `pickDecoys`
region-tight vs world-wide.

The cheapest possible fix for sameness: it re-frames every existing variant without a single
new card, and trailing players self-select into Bold, which is catch-up without rubber-banding.
`gatePot` already takes a per-variant pot; the Ante makes it per-_answer_.

### 4. Deeper — press-your-luck on a shrinking set

The gate names a set — _countries bordering Brazil_, _where Spanish is official_, _EU members_.
Name one, bank a step, and it asks again with what you've named crossed off. **Bank or climb.**
A miss or the clock loses everything banked at this gate; the walk survives.

The risk curve is intrinsic to the data — the set shrinks as you climb — rather than an
authored ramp. Reuses `lib/use-collect-set-round.ts` and every all-that-apply register the
group modes already have: `BORDERS`, `Country.languages`, `membership`, `TREATIES`,
`COMMODITY_EXPORTERS`, `MIGRATION`.

### 5. Fingerprint — three constraints, exactly one country on Earth

_Landlocked_ · _more than five land neighbours_ · _no red on the flag_. Tap the one country
that qualifies. The whole live map is the answer surface.

The dealer builds predicates over shipped data (region, `BORDERS.length`, coastline,
`identity.simplifiedColors`, `currency`, `languages`, `membership`, hemisphere, population
band, `government.independence` decade, `geography.highestPeak` band), then searches
combinations until exactly one country qualifies — and **proves it** by evaluating the set
over the whole playable pool. Unlimited never-repeating content from data already on disk.

The reveal teaches by lighting up what each constraint eliminated, in layers.

### 6. The Dossier — buy your own clues

A blanked country. Instead of the server flipping clues (stat detective's model), the _player_
picks the next question from a menu — "Which hemisphere?" · "How many neighbours?" · "What's on
the flag?" · "What do they export?" — and each one spent narrows the pot. Name the country
whenever you're ready.

Turns the hint economy from a penalty box into the game itself. `mentionsCountry` is already
the giveaway scrub, and `leaderHintFacts` the precedent for a scrubbed clue surface.

### 7. Counterfeit — the real flag among forgeries

Five flags. Four are `forgeFlag()` output — deterministic, family-weighted, palette-accurate
synthetic national flags this repo already generates and currently flies only on `/health`.
One is real.

Authenticity judgement is a verb nothing else asks for, and the fakes are **newly synthesized
data**, not another decoy drawn from the same 197-flag pool. `lib/flags/forge.ts` has 14
composition families with weights from a pixel-level study of the real 197 and `REAL_*` guards
so a forgery never quantizes to an actual flag; `lib/flags/classify.ts` parses real flags into
the same families, so the sharper cut is to seed the forgeries from the real flag's own family.

### 8. True Size — the projection lie

Greenland floats over Africa at Mercator scale. Drag it south and the outline shrinks as it
travels, because it renders in true area. _Drop Greenland where it matches the country
underneath_ — or _how many Greenlands fit in Africa?_ on a dial.

The most famous lesson in cartography, and the game has nothing that touches it. Uses
`geography.area.total`, `map.gen` outlines, `lib/outline.ts` and `projectRobinson`. **Graded**:
an area-ratio error band pays 0/1/2, which needs a real curve — `buzzFraction`'s 0.35 floor
cannot express "wrong".

### 9. The Dial — estimation with partial credit

"How many people live in Nigeria?" on a log-scale tape. Inside 10% pays the full leap, inside
2× pays one, beyond pays nothing. `DragDial.vue` already exists (Yearbook and World of Change
use it).

Every trivia game on Earth has this one and Mondiale doesn't. The best flavour is the dataset
nobody has touched: **`PYRAMIDS`** — show a country's age pyramid with the axis blanked and ask
for its median age, or invert it and let the player sculpt the pyramid's waist against the real
21-band profile.

### 10. Meridian — where is it 6pm right now?

The map goes night and the real day/night terminator sweeps at the **actual current time**. A
clock face reads 18:00. Tap a country where that's the local time now.

The only mode that reads the wall clock, so the same question is never the same question twice.
Uses `CAPITAL_FACTS.timezone` (read by nothing today) plus `countryLatLng`; the night machinery
exists in sunset blitz and city nocturne. Accepts any country in the matching offset band — the
many-right-answers posture the currency gate already has. Teaches China's single zone, India's
`:30`, the date line, Spain on Berlin time.

### 11. Chokepoint — route the cargo

_Crude petroleum, Kuwait → Rotterdam._ Tap the water it must pass through, in order — Hormuz,
Suez, Gibraltar.

Traversal is the land graph; nothing routes by sea, and `STRAITS` is used only by border
chain's hop rules. Uses `data/water.gen` (named seas and straits with projected, renderable
geometry — name that water already lights one up), `SEA_NEIGHBOURS`, `COMMODITY_EXPORTERS` for
the cargo. `GameMap` already draws bowed sailing arcs for manhunt sea passages.

### 12. The Missing Piece — jigsaw

A blanked continent with one country-shaped hole. Three outlines sit in the tray, all
plausible, all rotated wrong. Drag the right one in.

Sketch asks you to draw a shape from memory; silhouette asks you to name one. Nothing asks you
to _fit_ one, which tests adjacency and scale together.

### 13. Flashbulb — memory

Five countries light on the map for three seconds. The map goes dark. Tap them back — or the
harder cut: one lights again _changed_, and you name which.

A staple of both board games and video games, entirely absent here, and the fastest gate on
this list (12–15s), which the round barrier will thank us for. Graded by `jaccardFraction`
over the tapped set. Lighting them in _sequence_ and asking for the order back adds ordering,
which nothing does either.

### 14. Switchboard — matching pairs

Four countries down the left, four currencies (or leaders, capitals, languages, exports) down
the right. Draw the four connections.

Every existing gate resolves to one decision; this is four coupled ones, where three-right-one-
wrong is a distinct outcome the binary gate has never been able to express.

### 15. The Forecast — extrapolation

A trend line runs from 1960 and stops dead at 1995. Drag its continuation to 2025. The reveal
snaps your line onto the real one.

Trajectory match asks whose chart this is; trend duel asks which way one is going. Neither asks
the player to _project_, which is the actual skill a time series teaches — and your line ghosted
against the truth is the most legible lesson in the game. Best subjects are the ones with a
story: fertility in Iran, life expectancy in Russia through 1991, democracy in Venezuela.

### 16. City Lights — the shape settlement makes

No outline, no borders. Just a country's cities as dots, sized by population, on black.

Still naming, but from a **synthesized** subject rather than a drawn one — Australia is a ring,
Egypt is a line, Canada is a hem along one border. Teaches settlement geography, which nothing
touches. `CITY_LIGHTS` projected through `projectRobinson`; the night rendering already exists
in `FinalCityNocturne.vue`.

### 17. Customs Hall — sort into buckets

Six countries in the tray, three labelled buckets: hemispheres, or currency zones, or _treaty
party / signatory / never signed_.

Odd one out asks which one breaks a rule; this asks you to apply the rule across a whole tray
and pays for how much you got. `TREATIES.standing` is a genuinely three-valued axis the game
has never asked about, and the boundary cases (Ecuador on the equator, Montenegro using the
euro without being in the eurozone) are the lesson.

### 18. Passport Stamps — set collection across the board

Every gate you clear stamps your passport with the region of its subject. Complete a continent
and the next gate pays a bonus leap.

The first mechanic where a gate's outcome matters _after_ the gate. It gives a reason to care
which gate you land on, so the board's tile themes start doing narrative work instead of just
varying the card — and gives a losing player a second thing to play for. Wants a `stamps` field
on `Player`; public snapshot data, no secret.

### 19. The Trap — leave something for the next player

You clear a gate. Before walking on, you choose what the _next_ player to land here faces:
which of three categories, or which region the subject is drawn from.

Asynchronous cross-player rivalry with no waiting — the choice is banked on the tile and spent
whenever someone arrives. Wants a `trap` field on `Tile`, and it must name a **category only,
never an answer**: a rival reading the snapshot learns "leader question, hard tier", which is
what the UI tells them anyway. Choosing the subject or the decoys would leak the round.

### 20. The Naming — etymology

_"Land of the pure."_ · _"Place of the Pashtun."_ · _"The country of the honest people."_

Every existing gate is a picture, a shape, a number or a chart. Not one is a sentence.
`NAME_FACTS.etymology` and `CAPITAL_FACTS.etymology` are near-unused and near-complete. The
scrub is the whole build: etymologies name themselves constantly, so the dealer must reject any
entry `mentionsCountry` can't clean rather than ship a half-blanked riddle.

Its sibling shares the machinery: `ANTHEM_LYRICS` ships curated walls with `[[…]]` blanks and
`LyricSpan` already parses them, so a translated verse with the giveaways masked is a gate that
needs no audio — which sidesteps the collision problem that rules audio gates out.

---

## Verb coverage

| Verb                       | Before     | After / proposed                  |
| -------------------------- | ---------- | --------------------------------- |
| Recognize 1-of-4           | 9 variants | —                                 |
| Identify a revealed shape  | 3 variants | City Lights (synthesized subject) |
| Compare / locate           | 3 variants | —                                 |
| Detect an error            | —          | **Errata** (built)                |
| Complete a pattern         | —          | **Rosetta** (built)               |
| Choose a stake             | —          | The Ante                          |
| Recall under risk          | —          | Deeper                            |
| Constraint deduction       | —          | Fingerprint                       |
| Interrogate                | —          | The Dossier                       |
| Judge authenticity         | —          | Counterfeit                       |
| Manipulate / scale         | —          | True Size, The Missing Piece      |
| Estimate                   | —          | The Dial                          |
| Extrapolate                | —          | The Forecast                      |
| Temporal-spatial           | —          | Meridian                          |
| Route                      | —          | Chokepoint                        |
| Remember                   | —          | Flashbulb                         |
| Match many                 | —          | Switchboard                       |
| Categorize                 | —          | Customs Hall                      |
| Collect a set across turns | —          | Passport Stamps                   |
| Act on a rival             | —          | The Trap                          |
| Read                       | —          | The Naming                        |

---

## Shared work the rest of these need

1. **A graded leap curve** alongside `buzzFraction` — one that can pay 0 for "correct but way
   off". Seven of the proposals want it (True Size, The Dial, The Forecast, Flashbulb,
   Switchboard, Customs Hall, Chokepoint), and four of those grade a _set_, so
   `jaccardFraction` is already the right primitive — it just needs a route into the leap.
2. **A decision on non-ISO answers**: widen `submit-individual-challenge-answer` to a
   discriminated `answer` payload, or accept client-trust grading per the higher-lower
   precedent. Worth settling once rather than per mode.
3. **A drag primitive.** The Missing Piece, Switchboard and Customs Hall all want
   drag-and-drop, which exists only in sheet form (`lib/use-drag-sheet.ts`) and map-pin form
   (`lib/use-pin-drop.ts`). One `use-drag-pieces.ts` should land with whichever ships first.
4. **State that outlives the gate** — Passport Stamps wants `stamps` on `Player`, The Trap
   wants `trap` on `Tile`. Both are public snapshot data, but they are the first gate mechanics
   to persist and deserve one home rather than two ad-hoc fields.
5. **Tile themes are categories, never modes.** A marker can only reflect the tile's theme —
   tiles are dealt at game creation, long before any challenge is — so a tile named for one
   mode either strands its siblings on the wrong marker or forces a new tile per mode. The two
   new themes are named for a kind of thinking and each has room for tenants:

   | Theme     | Means                                | Tenants                           |
   | --------- | ------------------------------------ | --------------------------------- |
   | `errata`  | something here is wrong              | Errata; Counterfeit when it lands |
   | `lexicon` | a term and the country it belongs to | Rosetta; The Naming, Switchboard  |

   Two rules for the marker, both learned by breaking them (see the lexicon gate's four
   attempts above, and `markerPartsFor`):

   - It has to **name** the category, not merely differ from its neighbours. A blank slab is
     distinct and says nothing.
   - It has to **survive being looked down on**. The board's-eye camera is the one that
     matters, and up there broad forms read while thin, straight, leaning ones vanish. Detail
     finer than a tier or a plate is lost to the flat toon shading, so a marker has to work as
     a silhouette.

   Meridian, True Size, Chokepoint and The Forecast fit none of the existing themes cleanly.
   Either file them under `isoCode` (the catch-all) or open a category for them, which is the
   route to a marker and a gate-top wash. Passport Stamps argues for the latter: a stamp
   set is only interesting if the themes are legible on the board.

   Promotion is a typed walk. Five tables are exhaustive over the accessor union
   (`GATE_TILE_WEIGHTS`, `TILE_TOP_TINTS`, `markerPartsFor`, `INDIVIDUAL_STAT_ORIGINS`,
   `CHALLENGE_DETAILS`), so the compiler names every site. Two things it will not tell you:

   - **A board can hold fewer gates than there are themes.** A short board draws 6–10 gates
     against eight themes, so guaranteed coverage is partial by design. `gateThemes` shuffles
     the accessor list before slicing so the benched theme varies; taking them in declaration
     order silently benched the same tail on every board.
   - **Do not gate the position draw on the theme count.** `gatePositions` retries until the
     board carries `MINIMUM_GATES`, deliberately a fixed floor. Tying it to the accessor list
     filters out every rhythm sparser than the theme count — and once the list outgrows what a
     short board can hold, the fixed every-5-tiles ladder takes over entirely.

   Both are pinned in `lib/tiles.test.ts`.
