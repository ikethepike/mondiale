# Clean Sweep — the contested checklist

Design for issue #41. The pitch was cooperative: one huge shared checklist, one shared clock,
each name lights up for the whole room once, score = a table completion bonus plus your personal
find count. This document keeps that skeleton and **rotates it competitive**: a name any player
types is not merely lit, it is **claimed** — theirs, exclusively, for the rest of the round.

The change is small on paper and total in play. A shared checklist where finds are attributed is
a scoreboard you can read at a glance, and every name is a slot somebody else wanted. The
issue's communal final gasp — _"who knows the last two?!"_ — survives intact, because the
table completion bonus survives intact; what changes is that the last two are now worth
_racing_ for, and everyone can see who got there first.

---

## Diagnosis: what the roster already has, and what it doesn't

Twenty-nine round kinds. Six of them are collect-a-set (`river-run`, `shared-shores`,
`highlands`, `mother-tongue`, `neighbour-blitz`, `no-mans-land`) and **all six are solitaire**:
every player types against a private copy of the same list, and the only thing the room shares
is the clock. `useCollectSetRound` encodes exactly that — a local `guesses` ref, local tinting,
a local self-submit. `blitzScore` grades each seat's list in isolation.

The room-shared modes, meanwhile, are all turn-based or secret-keeping:

| Mode             | What the room shares                         | Interaction         |
| ---------------- | -------------------------------------------- | ------------------- |
| `border-chain`   | one chain, one seat on the clock             | turns               |
| `atlas`          | one chain, one seat on the clock             | turns               |
| `timeline`       | one line, one seat on the clock              | turns               |
| `manhunt`        | one hidden despot, hidden markers            | turns               |
| `unique-or-bust` | one letter — answers **hidden until reveal** | simultaneous, blind |
| `heritage-hunt`  | one photo per beat, hidden pins              | simultaneous, blind |

**Nothing in the game is simultaneous, open, and contested.** Every mode where players act at
the same time hides what they do until the reveal (that hiding is load-bearing in both cases:
seeing a rival's word lets you dodge Unique or Bust's duplicate; seeing a rival's pin hands you
the answer). Clean Sweep is the first mode where the correct design is the opposite — the claim
**must** be public and instant, because watching the pool drain is the entire experience.

That is the gap this mode fills, and the reason it does not feel like a seventh blitz.

---

## Rules

**The prompt.** One enumerable set with a crisp membership rule — _the EU's 27_, _every country
that uses the euro_, _every country the Equator crosses_. Between 8 and 30 members; the dealer
guards the band.

**The board.** N slots, face-down. Type a member's name and the slot flips to **your** colour
with your pawn on it. Nobody can take it again.

**Tempo is the currency.** A wrong name doesn't cost a point — it **benches you** for
`SWEEP_LOCKOUT_MS`. Your input goes dead while rivals keep eating the pool. In a contested
checklist a lockout is a far sharper punishment than `blitzScore`'s `− wrong`, because the thing
it takes is the only scarce resource in the round: time in front of a shrinking board.

Naming a slot somebody already holds is not a wrong answer — it's a **collision**. No bench, no
cost, but the room hears about it (below), and you've spent the seconds.

**The pot, three ways** (`sweepPots`, mirroring `empirePots`):

| Share | Weight | Who gets it                                                                              |
| ----- | ------ | ---------------------------------------------------------------------------------------- |
| Claim | 0.60   | your claims measured against a **fair share** (`poolSize / seats`), clamped to the pot   |
| Sweep | 0.30   | **every seat**, if the table cleared the board — scaled by clock left via `buzzFraction` |
| Close | 0.10   | the seat that claimed the **final** member                                               |

Fair-share normalization is what makes both halves of the issue's brief land: carrying the team
pays (you beat your share), and getting carried is not robbery (the sweep bonus is flat and
everyone banks it). The closer bonus is the final gasp, priced.

**Why 2 players minimum.** `MINIMUM_TABLE_BY_KIND['clean-sweep'] = 2`. Solo, exclusivity is
vacuous and the mode degenerates into `river-run`.

**Why a briefing.** In a mode where tempo is the currency, a fair start is a _correctness_
property, not polish: a seat still reading the prompt while another types has already lost
slots. The click-away rules card (manhunt / unique-or-bust pattern, `BRIEFING_CAP_MS`) is the
gate, and no clock runs until the table is ready.

---

## The set register — one home, no re-derivation

`lib/clean-sweep.ts` owns `SWEEP_SETS`: the mode's single source for what a set _is_, what it
_contains_, how it is _phrased_, and where the truth _came from_.

Every resolver reads through an existing single source. The mode adds **no new membership
test, no new pool derivation, no new generated data**:

| Family    | Resolver reads                                                    | Example set                          | Typical N  |
| --------- | ----------------------------------------------------------------- | ------------------------------------ | ---------- |
| Clubs     | `isMemberOf` (`lib/odd-one-out.ts`)                               | the EU's 27, OPEC, CSTO              | 6–30       |
| Currency  | `countriesSpending` (`lib/currency.ts`)                           | every country that spends the euro   | 8–20       |
| Treaty    | `TREATIES[id][iso].standing === 'party'` via `lib/odd-one-out.ts` | parties to the Ottawa Treaty         | 8–30       |
| Commodity | `COMMODITY_EXPORTERS[id].top` (`data/commodity-exporters.gen`)    | the world's top cocoa exporters      | 8–20       |
| Marriage  | `MARRIAGE_RIGHTS` (`data/marriage-rights.gen`)                    | every country with same-sex marriage | ~38 → gate |

Every candidate is filtered through `playableCountries(rules)` — the mode never derives a pool
locally (`lib/game-rules.ts` is the one home), so continental variants get their local wing of a
club automatically and micro-nation gating is inherited rather than re-implemented.

Each `SWEEP_SETS` entry declares:

```ts
{
  id: 'eu',
  family: 'club',
  /** "All 27 EU members" — the prompt. */
  prompt: string
  /** The reveal's teaching line: why these and not others. */
  qualifier: string
  /** For the ⓘ — enforced against DATASETS by attribution.test.ts. */
  dataset: DataSetId
  /** Hard-only, or every difficulty. */
  hardOnly?: boolean
  members: (rules: GameRules) => ISOCountryCode[]
}
```

**Deliberate exclusions.** River basins, official-language sets and neighbour rings are _already
other modes' answer sets_. Dealing them here would make Clean Sweep a reskin and the round mix
would read as repetitive even though `MECHANIC_BY_KIND` was doing its job. The families above are
the ones no existing mode enumerates.

### Sizing the set to the table

A 27-slot board at a two-player table is a different round from the same board at six. The
dealer scales: `SWEEP_TUNING[difficulty]` gives the size band and the clock, and the band's
floor rises with `contenders` so a big table never runs out of board in fifteen seconds. Sets
too large for the band (marriage rights at ~38) are **windowed by an ordering the set itself
supplies** — earliest adopters, largest exporters — never randomly, so the prompt stays honest
("the first 20 countries to legalise it", not "20 of the countries that did").

---

## Engine — a stamp, not a timer

Clean Sweep is single-beat, whole-table, server-clocked, with **shared mutable state mutated
mid-round**. Classic rounds (`classic-rounds.ts`) cannot host it: they assume each seat's answer
is independent and lands once. So it rides the engine primitives directly, exactly as its five
siblings do — `lib/events/server/sweep-beats.ts` built on `round-engine.ts`
(`scheduleEngineTask`, `scheduleDeadlineTask`, `scheduleRevealTask`, `settleRoundScores`) and
the beats in `round-beats.ts`. It is structurally `unique-beats.ts` **minus the secret blob**,
which makes it the simplest engine in the set.

**No redis side-key.** Unique or Bust hides its answer sheet under `uniqueKey` because seeing a
rival's word lets you dodge the duplicate. Clean Sweep's claims carry exactly the information
the mode wants broadcast, so `state.claims` rides the snapshot. The player-secret pattern is
correctly _not_ used here, and the type comment says why.

```ts
export interface CleanSweepState {
  briefing?: boolean
  ready: string[]
  /** Epoch ms the writing window closes; 0 while the briefing holds. */
  deadline: number
  order: string[]
  /** The board's resolution: slot → who took it, in claim order. */
  claims: { isoCode: ISOCountryCode; playerId: string; at: number }[]
  /** Wrong names the table tried, capped — the reveal's collective blush. */
  strays: { isoCode: ISOCountryCode; playerId: string }[]
  /** Epoch ms each benched seat's input reopens. A STAMP, never a timer. */
  benched: { [playerId: string]: number }
  finished?: boolean
}
```

**The race is already solved.** Two seats type "Belgium" 40ms apart. Every mutation runs inside
the per-game queue (`scheduleGameTask` / the dispatcher's promise chain), so the handler is
serialized by construction: the first submit claims, the second re-reads fresh state, finds the
claim, and resolves as a collision. No new locking, no new machinery.

**The loser learns from the snapshot, not a targeted emit.** The view keeps its in-flight pick
and reconciles against the next `sweep-updated` snapshot: if the slot came back held by someone
else, the view announces the collision locally. One re-emit the room already needs, zero new
server→client events.

**The lockout needs no timer at all.** The server stamps `benched[playerId]`; the submit handler
gates on it; the view renders the countdown through `secondsOnDeadline` — the one
deadline→seconds math (`lib/use-deadline-clock.ts`). Nothing to arm, nothing to re-arm, nothing
to lose in a restart. `SWEEP_LOCKOUT_MS` lives in `lib/round-beats.ts` beside `TRAP_HOLD_MS`, so
the server that stamps it and the view that draws it read the same number.

**Two server-owned exits, both re-armable.** The briefing cap and the writing deadline —
`scheduleSweepTimeout` branches on state exactly like `scheduleUniqueTimeout`, `rearmCleanSweep`
joins the sweep in `rearm-round.ts`, and the early finish (board cleared) resolves through the
same path as the deadline. The settle re-derives scores from `state.claims` already on the
snapshot — never from anything with an independent TTL — so a settle recovered long after a
crash cannot bank zeros under a full board (the `uniqueScoresFromResults` lesson, inherited by
construction rather than by comment).

### One bounded consolidation: the briefing gate

Four modes now open on a click-away rules card. Today that is **three near-identical handlers**
(`chain-ready`, `manhunt-ready`, `unique-ready`), three copies of the ready-list mutation, and
four copies of the same markup. Adding a fourth of each is precisely what the coding rules
forbid.

- `lib/events/server/briefing-gate.ts` — `applyBriefingReady(ctx, game, state, playerId, begin)`:
  the idempotent ready push, the all-ready test, the save-and-emit. The three existing engines
  call it; Clean Sweep calls it.
- One `round-ready` client event, dispatched per live round kind, replacing the three. The old
  names stay as thin aliases for one release — and the briefing cap is the backstop that already
  covers a client that never sends anything at all.
- `components/challenge/RoundBriefing.vue` — the rules list + the pawn ready-row + the button,
  over the existing `.briefing-card` template. Four views stop hand-rolling it.

Deferrable, but it is the single highest-value cleanup this feature touches, and it gets
_cheaper_ to do now than after a fourth copy lands.

---

## Ephemeral messaging

The room already has three ephemeral rails, and they share a discipline worth restating: they
write **no permanent state**, they re-derive trust server-side (the authenticated socket id, the
policy from the round, the role from the challenge), they never echo free text, they are
token-bucketed, and they expire by timestamp filter rather than a timer per message.

| Rail              | Carries                        | Redaction                    |
| ----------------- | ------------------------------ | ---------------------------- |
| `player-guessing` | guess chips → `GuessTicker`    | `guessPolicyFor` server-side |
| `player-cheering` | emoji at a pawn → `CheerToast` | emoji whitelist              |
| `manhunt-taunt`   | an index into `MANHUNT_TAUNTS` | role from the round          |

**The design rule for this mode: the ephemeral layer says only what the durable layer cannot.**
A claim is durable and attributed and already animates on the board — a ticker chip for it would
be noise duplicating state. So the ticker carries the two things the board can't show:

- **`wrong`** — a name that isn't in the set, named, with the reason: _"Ada — Norway isn't in the
  EU"_. Under `GuessPolicy: 'label'`, because in a ~195-country field a wrong name is
  anti-information, and the miss is the round's teaching beat _and_ its schadenfreude beat.
- **`taken`** (the one new `GuessKind`) — a collision: _"Ada — Belgium, already Ben's"_. This is
  the mode's signature message. It tells you the pool is thinning, who is eating it, and that
  your rival just burned two seconds on a dead slot.

One new enum member in the existing union, one new arm in `GuessTicker`'s `guessText` switch, one
new border colour. **No new relay, no new socket event, no new component, no new pruner** —
`useGroupChallenge.announce` already broadcasts, redacts, chips and expires.

### Two dramatic beats that are derived, not messaged

The loudest moments in this mode need no wire at all, because they are functions of state the
room already has:

- **Last call.** `unclaimed.length <= SWEEP_LAST_CALL` flips the shell: the counter goes large,
  an ember rim comes up (`_pulse.scss`), the remaining slots pulse. The final-gasp beat, derived
  client-side from the snapshot — so it cannot drift, cannot be spoofed, and costs nothing.
- **On a tear.** Consecutive claims by one seat, read off `state.claims`, badge that seat in the
  live standings rail. Attribution and streak are both already in the array.

A message that can be derived from the snapshot **should** be derived from the snapshot. That is
the smart part: the mode looks chatty and sends almost nothing.

---

## UX & UI

### Two surfaces, both existing machinery

**The world map is the stage, and it is being carved up.** `gameStore.map.countryGroupings`
already paints per-group country fills in arbitrary colours (`CountryColorGrouping { color,
countries }` — ViewManhunt paints its trail with it, ViewAtlas its chain). Clean Sweep paints one
grouping **per claimant, in that player's own colour**. The round's picture is territory
changing hands: a continent filling in, streak by streak, in six colours. No new map vocabulary
— `MapTint`'s verdict palette is deliberately untouched, because these fills mean _ownership_,
not _correctness_.

**The roster docks beside it.** A map cannot say "10 left", and the shrinking count is the
tension. `.side-stage` (`templates/_side-stage.scss`) is the existing recipe for a study surface
docked beside a map answer surface, narrow-repark included. Inside it: N slots, face-down.

- **Unclaimed** — a blank card. The question is the shape of the empty slots.
- **Claimed** — flips to a `CountryChip` (flag + name: a chosen-country label wears its flag, by
  law) with the claimant's pawn, edged via `.player-accent` + inline `--player-color`. The flip
  rides `chip-in` / `row-land` from `_animations.scss`.

At 27 slots on a phone the grid densifies to flag + pawn and drops the name; the wide layout
keeps it. Slots never reflow on claim — a board that reshuffles under your eyes while you race
it is unreadable.

### The console

`CountryGuessInput` (countries get the country register's input, never `SuggestInput`), in a
`> footer` wearing `.suggest-berth`, prompted through `.ghost-placeholder` — never a
`placeholder` attribute, which Safari reads for contact AutoFill. Round-start focus is
`focus({ auto: true })` (desktop-only); mid-round refocus after a lockout lifts is bare
`focus()`, which is exactly the case that distinction exists for.

The clock is `ChallengeTimerRadial` inside `ChallengeConsole`, fed by
`useDeadlineClock(state.deadline)` — the server owns the clock, the view repaints it, and
`begin()` is deliberately never called (it would arm a second, local countdown off
`durationSeconds`; ViewUniqueOrBust documents the same trap).

**The bench.** While `benched[me]` is live the input is replaced by the bench state: its own
radial on the lockout stamp, an ember wash (`flame()`), and the board still visible behind it
taking claims. The punishment has to be _watchable_ — that is the whole mechanic. When the stamp
lapses, the input returns and refocuses itself.

### The prompt and the live scoreboard

`ChallengePrompt` carries the set's phrasing and a live sub: _"17 of 27 claimed — 10 left"_.
Under it, two rows:

1. **The standings rail** — pawn, name, claim count, sorted, own seat accented. This is the
   competitive scoreboard **during** play, which no existing mode has: the blitz family has
   nothing to compare mid-round and the turn modes have a queue instead. It is chips and pawns,
   no new grammar.
2. **`GuessTicker`** — the `wrong` and `taken` chips, expiring on their own.

---

## Reveal cards: the audit, and where this mode's summary goes

Every reveal in the repo answers _one_ of three questions, and each has a settled form:

| Question                                          | Form                                                                          | Examples                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Was I right?** (one seat, one answer)           | `ChallengeResult` — one card: verdict head, hairline, fact body, stamp        | every buzz and pick round                                                              |
| **What was the full answer?** (one seat vs truth) | `AnswerLedger` — truth rows each carrying Found/Missed, strays below the rule | the blitz family, mother tongue, empire                                                |
| **What happened at the table?**                   | a bespoke grid, ranked take strip on top                                      | `UniqueRevealGrid`, `ChainReveal`, `ManhuntReveal`, `TimelineReveal`, `PlaceReveal` |

The table-level cards converge on the same grammar: a **take strip** of ranked pawns with their
banked points, then the **evidence** — the collision grid, the closed doors, the trail, the
finished line. Every one of them puts the teaching payload in the evidence, not the strip.

Clean Sweep is a table-level round with a per-seat stake, so it needs **both layers**, and the
existing components almost cover it.

### Layer 1 — `SweepRevealCard.vue`: the table's summary

Shown in-view at `finished` (the round's own reveal beat) and reprised as a `.ranking` section in
`ViewGroupScores`, exactly as `StatDetectiveReveal` and `ConflictProfileCard` already are — one
component, two hosts, no second copy.

1. **The take strip.** Pawns ranked by claims, each with `+points`. Badges: **Closed it** on the
   final claimer, **Top of the board** on the leader. Then the table's verdict in one line —
   _"Swept with 0:14 left — everyone banks the sweep bonus"_ or _"9 left on the board — no sweep
   bonus"_. The co-op result and the competitive result, side by side, which is precisely the
   round's two-sided scoring made legible.
2. **The board, resolved.** Every slot face-up. Claimed slots wear their claimant's pawn and
   colour edge — the finished map of who took what.
3. **The unclaimed band.** The slots **nobody** got, in their own section under the rule. This is
   the payload. `AnswerLedger` already has the instinct ("Missed" rows teach best) but only
   per-seat; here it is table-wide, and it is the thing everyone shouts about. _"Nobody had
   Slovakia?"_
4. **The qualifier + ⓘ.** The set's one-line teaching sentence (_"The EU's 27 — the UK left in
   2020"_) with `SourceInfo` / `attributionLine` over the entry's declared `dataset`.
5. **The strays**, if the table left any: `CountryChip`s in a rail. Collective embarrassment is a
   feature.

### Layer 2 — the per-seat scorecard, made honest by one prop

`ViewGroupScores` routes set-shaped rounds through `AnswerLedger`, which marks any truth row the
seat didn't submit as **Missed**. On a contested pool that is a **lie**: you did not miss
Belgium, Ben took it before you could.

The fix is one small, general extension to the one ledger component rather than a parallel
component:

```ts
/** Contested-pool rounds only: rows a RIVAL claimed read "Taken by ⟨pawn⟩" rather
 *  than "Missed" — the seat did not miss what it was never allowed to have. */
claimedBy?: { [isoCode in ISOCountryCode]?: string }
players?: Record<string, Player>
```

Every other mode passes nothing and is byte-for-byte unchanged. Clean Sweep passes the claim map
and the seat's scorecard finally reads true: **"you claimed 6 of 27 · 18 went to rivals · 3
nobody found."** That tally line is the mode's per-seat story in one sentence, and it is a
`tallyLine` variant, not a new surface.

`ANSWER_SHAPE_BY_KIND['clean-sweep'] = 'set'` and the round banks real lists (`submitted` = your
claims, `correct` = the set), so the round-history drawer and `victory-stats` get real data
instead of the empty-payload treatment the reveal-through-own-beat modes take.

---

## Wiring checklist

The issue's list, with the compile-enforced entries marked — most of this feature announces its
own missing pieces as type errors, which is the design working.

**Types & taxonomy**

- [ ] `CleanSweepChallenge` + `CleanSweepState` in `types/challenges/group-modes.type.ts`, added to `GroupModeChallenge`
- [ ] `'clean-sweep'` in `RoundChallengeKind` + `roundChallengeKind`'s switch (`traversal-challenge.type.ts`)
- [ ] `CHALLENGE_GROUP_BY_KIND` — **recommended `culture`** (its subjects are clubs, currencies and treaties; `navigation` reads wrong for a membership question, and the accurate homes — `economy`, `society` — are `hidden` and therefore un-toggleable) ⟵ _compile-enforced_
- [ ] `ANSWER_SHAPE_BY_KIND` = `'set'` ⟵ _compile-enforced_
- [ ] `MINIMUM_TABLE_BY_KIND['clean-sweep'] = 2`
- [ ] **Not** in `WRONG_COSTS_A_POINT` — the cost is tempo, and a "−2" would be a lie (the set that exists precisely to stop that lie)

**Mode module** — `lib/clean-sweep.ts`

- [ ] `SWEEP_SETS` + `SWEEP_TUNING`, resolvers reading `isMemberOf` / `countriesSpending` / `TREATIES` / `COMMODITY_EXPORTERS` / `MARRIAGE_RIGHTS` through `playableCountries`
- [ ] `sweepPots` (mirroring `empirePots`) and `sweepScore`, reusing `clampScore` + `buzzFraction` from `lib/scoring.ts` — no second curve
- [ ] `sweepClaimedBy`, `sweepUnclaimed`, `sweepStandings`, `sweepScoresFromClaims` — the pure snapshot readers both the view and the settle use

**Round rhythm**

- [ ] `ROUND_BEATS['clean-sweep'] = engine({ briefingCapMs: BRIEFING_CAP_MS })` ⟵ _compile-enforced_
- [ ] `SWEEP_LOCKOUT_MS`, `SWEEP_LAST_CALL` in `lib/round-beats.ts`
- [ ] `ROUND_WEIGHTS['clean-sweep'] = 0.07`, `MECHANIC_BY_KIND = 'collect'` ⟵ _compile-enforced_

**Server**

- [ ] `lib/events/server/sweep-beats.ts` — `scheduleSweepTimeout`, `applySweepClaim`, `resolveSweepBoard`, `rearmCleanSweep`
- [ ] `submit-sweep-claim.handler.ts`; `round-ready` (or `sweep-ready`) via the shared briefing gate
- [ ] `rearmCleanSweep` in `rearm-round.ts`; the round-1 `FORCE_ROUND_TYPE` seam in `close-tutorial.handler.ts`
- [ ] `'sweep-updated'` in `ServerEventData`; `'taken'` added to `GuessKind`
- [ ] `guessPolicyFor` → `'label'` in `BASE_POLICY` ⟵ _compile-enforced_

**Client**

- [ ] `ViewCleanSweep.vue` on `useGroupChallenge` + `useDeadlineClock` (never `begin()`)
- [ ] `SweepRevealCard.vue`; `AnswerLedger`'s `claimedBy` prop; `GuessTicker`'s `taken` arm
- [ ] `GROUP_VIEWS` in `components/view/dispatch.ts` ⟵ _compile-enforced_
- [ ] `KIND_MOUNTABLE` in `lib/spectate.ts` = `true` (no local gesture gates it) ⟵ _compile-enforced_
- [ ] `roundChallengeHeadline` — _"The EU's 27 — the table found 24"_
- [ ] `KIND_LABELS` + `SUPERLATIVE_TITLES` in `lib/victory-stats.ts` ⟵ _compile-enforced_; a `visitedCountries` arm for the set's members

---

## Verification

- **Unit** — `lib/clean-sweep.test.ts`: every `SWEEP_SETS` entry resolves non-empty inside the
  size band on every difficulty and variant; no entry duplicates another mode's answer set;
  `sweepScore` pays a fair share, a flat sweep bonus, and the closer bonus, and never exceeds the
  pot; windowed sets window by their declared ordering.
- **Engine** — `sweep-beats` tests: two claims on one slot serialize (second is a collision, not
  a double-claim); a benched seat's claim is refused and does not consume the pool; the board
  clearing resolves early; `rearmCleanSweep` revives a lost briefing cap and a lost deadline; a
  double settle is a no-op through the `groupAnswers` latch.
- **Suites that will fail to compile until wired** — `round-mix.test.ts`, `round-beats.test.ts`,
  `spectate.test.ts`, `challenge-groups.test.ts`, `round-advance.test.ts` (the escapability
  matrix), `emit-breadth.test.ts`, `attribution.test.ts` (every `dataset` id must be claimed).
- **In the app** — `FORCE_ROUND_TYPE=clean-sweep` for a real round on a two- and a five-seat
  table (the fair-share divisor and the size band both move with the table); `/test-views` for
  the briefing, the live board, the bench, last call and the reveal without dealing a game.
