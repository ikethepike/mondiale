# Five group modes from OpenStreetMap

Thirty-five group kinds ship today and they are inventive — hidden roles, turn elimination,
duplicate-cancel scoring, a world that falls apart on a schedule. But they are all asked at
one scale, from one shelf of data. This document diagnoses that, says what OSM holds that
nothing else on the shelf does, and proposes five modes built on it.

Each proposal is judged on the three things that matter: it must teach something real, it must
be fun in a room of people, and the reveal must be worth sitting through.

---

## Diagnosis

**One scale.** Every subject in the roster is a country, a capital, a named physical feature or
a single photographed place. Nothing in the game is at street scale, and nothing anywhere asks
about the built environment — what people actually made where they live. A player finishes a
full game knowing where Ouagadougou is and nothing about what it looks like from ten metres up.

**Nine verbs, and one shape of answer.** `MECHANIC_BY_KIND` sorts the roster into typed, pin,
choice, buzz, collect, turns, draw, order and match. Two gaps stand out:

- **No magnitude.** Nothing asks a player to name a number. `DragDial` exists and is used twice,
  both in the gauntlet, both for years. A whole-table estimate — everyone's guess landing on one
  axis, the truth sliding in among them — is the single most group-shaped beat the game does not
  have, and it costs one component and one grading curve.
- **Every question answers with a place.** Which country, which city, which sea, which empire.
  Nothing asks _what is this_ — what activity, what system, what rule produced the picture. That
  is a different kind of thinking and the roster has none of it.

**Adjacency is always geographic.** Traversal, Border Chain and Hot & Cold all read the same
graph: who touches whom. Real connectivity — who can actually reach whom, and how much longer
than the crow flies — is a separate map, and the difference between the two is most of what
transport geography is about.

## What OSM has that our shelf does not

We already ship outlines (Natural Earth), cities (GeoNames), curated places and heritage sites
(Wikidata/UNESCO), and thirty tables of national statistics. All of it is _about_ places. OSM is
the only source that is a census of the things _in_ them:

| Held by OSM                                                              | What it makes askable                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| The street network, geometry and classification, everywhere               | Urban form: grid, medieval, radial, superblock, cul-de-sac   |
| `name` on ~30M ways, plus `name:xx` in every language a mapper knew       | Toponymy, script, colonial naming, block-address systems     |
| A tag-typed census of things — saunas, tea houses, cricket pitches, huts  | Cultural geography as a global distribution, not a statistic |
| Rail with `gauge`, `electrified`, `usage`; route relations with `ref`     | Infrastructure as a fossil of empire and of fear             |
| Border crossings, barriers, ferry terminals as mapped objects             | How closed a border actually is                              |
| A routable road graph                                                     | Circuity — geography against connectivity                    |

---

## Cross-cutting constraints

Read these before building any of the five. Two of them are load-bearing.

### 1. Mapper bias is the design hazard, not a footnote

OSM density measures **mappers**, not the world. A 2km tile of Antwerp carries footpaths, bench
positions and every kerb; the same tile of N'Djamena may carry six roads. A mode that reads
density as a fact about a place will teach a falsehood, confidently, to a room.

Three rules follow, and they constrain what may be asked far more than the licence does:

- **Prefer shape to count.** _What does this network look like_ survives thin mapping; _how many
  pharmacies are there_ does not.
- **Every pool needs a coverage floor.** A city enters Grid Lock's pool only when its network
  passes a completeness check against an independent length estimate; a country enters Break of
  Gauge's only when tagged track exceeds a share of its known route-km.
- **Never phrase a question whose true answer is "nobody mapped it".** Where the gap _is_ the
  interesting fact, say so in the reveal — that is the Missing Maps lesson and it is a good one.
  Never let it be the scored answer.

### 2. Licence: ODbL, and which side of the line each mode sits on

OSM is ODbL-1.0. A **Produced Work** — a rendered tile, an image, a drawn network — needs
attribution and nothing more. A **Derived Database** — a table of per-country gauges, a list of
street names, counts by amenity class — carries share-alike, and four of the five below produce
one. This is not a blocker: the repo already ships an ODbL source (`polity`), and publishing the
generator's output under the same terms is the normal answer.

Wiring, per the rules in CLAUDE.md: one new `openstreetmap` entry in `PROVIDERS`, one `SOURCES`
entry per generated file naming the extract's date (OSM has no vintage year — the planet dump's
timestamp is the vintage), and a `DATASETS` claim for every `data/*.gen.ts` the work adds, which
`attribution.test.ts` enforces. Routing adds a second provider (OSRM or Valhalla), since the road
distance is the engine's output rather than OSM's data.

### 3. Nothing calls OSM at runtime

Overpass for point and small-area extracts, a Geofabrik regional PBF for anything continental, a
self-hosted OSRM for routes. All of it at generator time under `generators/vendors/osm/`, output
baked into `data/*.gen.ts` and `public/`, exactly as every other vendor works today. Overpass is
a shared public service — the generators must be polite, cached and resumable, because a
re-run that hammers it will simply be cut off.

### 4. Geometry ships as path data, not GeoJSON

The map already ships as `d` strings. A street tile simplified to ~1,500 points renders in one
`<path>` per class, draws itself with the existing `stroke-draw` keyframe, and costs a fraction
of the equivalent GeoJSON. Tiles live one file per slug, the way `public/landmarks` does.

### 5. The giveaway scrub already exists

Street Signs and Points of Interest both risk handing the answer over in a label. `mentionsCountry`
(`lib/country.ts`, fed by `name.demonyms`) is the one gate for that, and both dealers must pass
every rendered string through it — the same posture the flashpoint hint ladder takes.

---

## 1. Grid Lock — four cities, no labels, one scale bar

Four street networks, each a 2km square cut around a city's centre, drawn as bare line work at
**identical metres-per-pixel** so block size is a real clue rather than a rendering accident.
Four city names sit under them. Drag each name onto its city.

**Why it is new.** The subject has no precedent in the game: this is the first thing the roster
asks about the built environment. The verb is `match`, which government and Pyramid Scheme
already ride, so it decays against them in the mix and needs no new interaction work.

**Why it teaches.** Urban form is legible and almost nobody has been shown how to read it. Four
tiles side by side make the differences impossible to miss: the Roman grid still under Turin, the
medieval spiral of Fez, Barcelona's chamfered Eixample octagons, Haussmann's radials, the Soviet
microdistrict's superblocks with nothing but access roads inside, the American cul-de-sac subdivision
that connects to exactly one arterial. Each one is a decision somebody made, and the reveal is
where the player learns whose and why.

**The round.** Deal picks four cities from a curated, coverage-floored pool, spread across form
families — never four grids. 45 seconds, everyone drags at once, score is placements correct with
the clock as the tie-break. Below hard, one tile is a gimme (Manhattan, central Paris).

**The reveal.** Each tile keeps its position and gains its name, its country's flag, and one line
naming the form and its cause — _"Eixample, 1859: Cerdà chamfered every corner so trams could
turn"_. The scale bar stays. Then the four tiles zoom out together to their real positions on the
world map, which is the moment the shapes attach to places.

**Files under.** Group `cities`; mechanic `match`; `ANSWER_SHAPE_BY_KIND` `sequence` — position
is the claim, exactly as Pyramid Scheme's is. Weight ~0.045. `revealHoldMs` 6000: the caption
line is the whole payload and a 0 hold would bury it, the mistake `terra-incognita` and
`flashpoint` both had to fix.

**Data.** Overpass per city: `highway` in the drivable and walkable classes inside the bbox,
projected locally, simplified, split into three weights (arterial / street / path) and written as
path data. Roughly 40–80KB per tile before compression. A curated pool of ~120 cities is enough
for years of play and small enough for a human to have looked at every tile — which is the only
real defence against mapper bias here.

**Risk.** Recognition, not reasoning, for anyone who has seen Manhattan. Mitigated by never
dealing more than one famous tile and by cutting tiles off-centre from the landmark core.

---

## 2. Street Signs — five names, one country

Five street names from one city flip up one at a time, in the script they are signed in, with a
transliteration under each. Type the country. The earlier you buzz, the more it pays.

**Why it is new.** The language group is entirely audio — an anthem, a language spoken aloud.
This is written language, on the ground, and it is the only mode where the evidence is a naming
_system_ rather than a word.

**Why it teaches.** Street names are a compressed national history and they are readable with no
prior knowledge at all:

- **Who is honoured.** Saints across Iberia and Latin America, independence dates in the Maghreb
  (_Rue du 20 Août_), 1918 and 1989 across central Europe, Lenin still holding thousands of
  Central Asian corners.
- **What the words are.** `-gata`, `-straße`, `-vej`, `Jalan`, `Ulitsa`, `Sokak`, `Rua`, `Calle`,
  `Đường`. The suffix names the empire, the trade route or the migration that put it there.
- **What is missing.** In most of Japan, residential streets have no names at all — addresses run
  by block. A deal where four of the five slots come up empty is the single best fact in the mode,
  and OSM is where you can see it rather than be told it.

**The round.** Deal picks a city with a coverage floor, samples five distinct named ways weighted
toward the ordinary (never the five most famous), and scrubs every one through `mentionsCountry`
plus a demonym and capital-name check. One clue every 6 seconds, buzz at any point, `buzzScore`
prices it — the exact ladder Stat Detective and Ghosts of Empires already ride.

**The reveal.** The city names itself on the map, and each of the five names gains a one-line
gloss: what it means, who it honours, and when it was probably named. Where a country renamed
its streets wholesale — post-1991 across the Baltics, post-apartheid in South Africa — the reveal
says so, because that is a fact about power and it is written on the corner of every street.

**Files under.** Group `language`; mechanic `buzz`; answer shape `set`. Weight ~0.05.
`revealHoldMs` 7000, matching its audio siblings — five glosses need reading time.

**Data.** Overpass per city for `highway[name]`, plus `name:xx` variants where the local script
differs from the Latin rendering. A derived database, so ODbL share-alike applies to the extract.
Transliteration must be generated and then reviewed, not trusted: a mangled Thai or Amharic
rendering is worse than showing the script alone.

**Risk.** Ambiguity between countries sharing a naming system — a Spanish street name could be
almost anywhere in Latin America. Solved the way `tongue-buzz` already solves it: the answer is a
**set** of acceptable countries, and the reveal explains why the set is large. That is the lesson,
not a defect.

---

## 3. Detour — the crow's flight against the road

Two cities on the map, the straight line drawn between them with its distance labelled. Everyone
dials in how long the actual drive takes. The truth slides in among the guesses and the real
route draws itself across the map.

**Why it is new.** The first magnitude estimate in the game, and the first round where the whole
table's answers are visible on one axis at reveal — the most naturally social scoring shape there
is, and a stakes curve the roster currently cannot express. It needs a new `estimate` mechanic in
`RoundMechanic` and a grading curve on log-ratio error, plus a relative slice for beating the
table, the way Heritage Hunt already mixes absolute and relative pay.

**Why it teaches.** Circuity — road distance over straight-line distance — is the number that
exposes everything geography hides:

- **Terrain.** Norwegian fjord towns 15km apart across water and 130km apart by road; Alpine and
  Andean valleys that only connect over a pass that closes in winter.
- **Politics.** Yerevan to Kars is 200km and the border has been shut since 1993, so the drive
  goes through Georgia and takes ten hours. Kinshasa and Brazzaville sit 4km apart across the
  Congo and no road connects them at all.
- **Absence.** The Darién Gap: the Pan-American Highway runs from Alaska to Patagonia except for
  106km of roadless swamp, and no route exists to compute.

**The round.** Deal picks a pair from a pre-computed route table, mixing honest pairs with two or
three traps per game. 30 seconds on the dial, everyone commits, no take-backs. Score tapers on
how far the guess is from the truth in ratio terms — a 20% error pays well, a factor of two pays
almost nothing — plus a slice for the closest at the table.

**The reveal.** Every player's dial lands on one axis with their colour, the truth drops in among
them, and the real route draws itself over the straight line. One caption says what made the
difference: _"the border has been closed for thirty years"_, _"the only bridge is 200km upstream"_.
On a trap pair, the reveal is the whole point.

**Files under.** Group `navigation`; new mechanic `estimate`; answer shape `set` (one number, and
the ledger marks rather than sorts). Weight ~0.05. `revealHoldMs` 6000 — the axis and the drawn
route are the payload.

**Data.** A generated table of ~800 city pairs with straight-line km, road km, drive time and a
simplified route polyline, computed once against a self-hosted OSRM over a planet extract. The
routing engine is a second provider in `attribution.ts`; the underlying network is OSM's.
Unroutable pairs are kept deliberately, flagged, and dealt as the trap class — `Infinity` is a
legitimate answer and the dial needs a stop for it.

**Risk.** The dial's scale. Linear kilometres make every guess cluster; the axis has to be
logarithmic, which needs a real design pass so the numbers stay readable under a thumb.

---

## 4. Break of Gauge — tap every country that runs on this track

A gauge is named and drawn to scale — **1,520mm, Russian** — and the world map goes blank. Tap
every country whose network runs on it. Scored on set overlap, exactly as No Man's Land is.

**Why it is new.** The first mode about infrastructure as a system. It is a `collect` on the map,
so it costs almost nothing to build, and the subject is one that nobody meets by accident.

**Why it teaches.** Rail gauge is a fossil and the map of it is a map of nineteenth-century power:

- **1,520mm** across the whole former Soviet space, plus Finland and Mongolia — a Russian standard
  that outlived the empire that set it and still forces every freight train from Poland to be
  lifted onto new bogies at Brest.
- **1,668mm Iberian**, which kept Spain and Portugal off the European network for a century — and
  the twist that Spain's high-speed lines are standard gauge, so the country runs two networks at
  once and the reveal gets to say why.
- **1,067mm Cape gauge** across southern Africa, Japan, Indonesia, New Zealand and Queensland — a
  cheap colonial gauge for difficult terrain, and a permanent ceiling on what those networks can
  carry.
- **The blanks.** Countries with no railway at all are a real answer to a real question, and the
  reveal is where a player learns that the absence has causes.

**The round.** Deal picks a gauge and its true country set from the generated table. 40 seconds,
everyone taps at once, `jaccardFraction` scores it — over-tapping costs, exactly as it should.

**The reveal.** The map fills in: the gauge's countries in one colour, the missed ones cold, and
the break points marked where two gauges meet. The caption names the year the standard was set
and what it was for — the Russian one, whether or not to defend against invasion, is a story worth
the hold.

**Files under.** Group `navigation`, unless a second rail mode ever lands, at which point an
`infrastructure` group is the honest home. Mechanic `collect`; answer shape `set`. Weight ~0.02 —
the roster is six or seven gauges and each is one-shot learnable, so this is a `ghost-state`
rarity, not a staple. Dealing it at a staple's rate burns the whole mode inside two sessions.

**Data.** Aggregate `railway=rail` way length by `gauge` per country from a planet extract, take
the dominant gauge above a share threshold, and keep the secondary where a country genuinely runs
two. Tagging coverage is uneven — this must be cross-checked against an independent list before a
country enters the pool, and countries that fail the check stay out rather than being guessed at.

**Risk.** Thin roster, addressed by the weight. The second risk is dryness: this is the most
technical subject in the roster and it lives or dies on the reveal caption being genuinely good.

---

## 5. Points of Interest — what are we looking at?

The world goes dark and dots begin to appear — every one of a single tagged thing on Earth,
drawn at its true position, region by region. Name what is being mapped. Then, in a second beat,
name the country that holds the most of them.

**Why it is new.** It is the only round in the game whose answer is not a place. Every other kind
asks _which country / city / sea / empire_; this one asks what human activity makes this pattern,
which is a different act of reasoning and the one that transfers best outside the game.

**Why it teaches.** A global dot distribution is an argument about climate, religion, empire and
money, made in one image and readable in three seconds once you know how to look:

- **Vineyards** draw two clean bands between 30° and 50° in each hemisphere — the wine belt, and a
  climate lesson that needs no words.
- **Cricket pitches** trace the British Empire almost exactly, and stop dead at its edges.
- **Ski lifts** name the Alps, the Rockies, Scandinavia, Japan and almost nothing else.
- **Places of worship, one denomination at a time**, draw the religious frontiers of the Balkans
  and the Sahel more sharply than any choropleth.
- **Windmills, hot springs, tea houses, mountain huts, lighthouses, ferry terminals** — each one
  is a different overlay on the same world.

**The round.** Beat one: dots appear in waves, buzz early for more, typed against a closed
vocabulary through `SuggestInput`. Beat two: with the answer known, name the country holding the
most — which keeps the whole table scoring even if the buzz went early to one player, the same
two-beat structure Ghosts of Empires uses.

**The reveal.** The dot field stays and gains its explanation: what the pattern is, why it falls
where it does, and — this one is not optional — **where the map is lying**. Finland's saunas are a
real phenomenon _and_ a mapping artefact, and the reveal is exactly the right place to teach that
a map of a thing is always partly a map of who bothered to record it. That is the most valuable
single idea in this entire document, and this is the mode that can teach it honestly.

**Files under.** Group `society` — this is how people live, and the religion accessors already sit
there. Mechanic `buzz`; answer shape `set` (both beats). Weight ~0.045.
`revealHoldMs` 7000. Renders on the existing nocturne stack: `useNocturne` for the dark world,
`ConflictDotField`'s wave draw for the dots.

**Data.** One global count-and-position extract per tag class from a planet PBF, thinned to a few
thousand representative points per class for rendering, plus true per-country counts and
per-capita rates for beat two. A derived database. ~30 curated tag classes, each of which a human
has looked at as a rendered field before it enters the pool — a class whose picture is really a
picture of European mappers gets dealt only when the reveal is _about_ that.

**Risk.** The one to watch is the places-of-worship class. It belongs in the pool — religious
geography is a real subject and the game already handles it under `society` — but it needs the
same sober framing the conflict content gets, and it must never be phrased as a competition.

---

## Also considered

- **Terminus** — name every country a named corridor crosses (Trans-Siberian, AH1, E40,
  Pan-American). Superb subject, but mechanically it is River Run with a road, and the Darién Gap
  is a better reveal caption inside Detour than a mode of its own.
- **Last Stop** — a turn chain over the rail network instead of the border graph. Cheap, since
  `chain-engine` takes a thin spec and this would be its third, and the lesson (infrastructure
  adjacency is not geographic adjacency) is real. Worth doing; it is an addition to Border Chain's
  family rather than a novel mode, which is why it is not in the five.
- **Same Place, Other Names** — one city in six languages at once (Wien / Bécs / Dunaj / Vídeň).
  Strong, but it collides with the gauntlet's `endonym-challenge` and with Street Signs' buzz.
- **Hard Border** — how many road crossings between this pair of countries. Real and surprising
  (two between India and Pakistan, hundreds between France and Belgium), but it is either a
  ranking or an estimate, and both verbs are spoken for.
- **Kilometre Zero** — the missing map as its own mode. Rejected as a mode and kept as a rule: it
  belongs in Points of Interest's reveal, where it is a lesson rather than a scored question.

## Shared work if more than one lands

- `generators/vendors/osm/` with a polite, cached, resumable Overpass client and a PBF reader —
  written once, used by all five.
- The `openstreetmap` provider and its `SOURCES`/`DATASETS` entries in `lib/attribution.ts`, plus
  the extract timestamp standing in for a vintage year.
- A **coverage floor** helper: given a city or country and a class of feature, does OSM know
  enough here for a question to be fair. Every pool in every one of these modes calls it, and it
  is the one piece of shared work that is not optional.
- `estimate` added to `RoundMechanic`, with a log-ratio scoring curve in `lib/scoring.ts` and a
  whole-table guess axis component. Detour needs it; Hard Border and half the rejected list want it.
- A tile renderer that turns projected way geometry into class-split path data, shared by Grid
  Lock and any later street-scale mode.
