# CODING RULES

- NEVER redefine logic, definitions or types. Always use centralized, consolidated types where possible.
- Skip verbose comments

## Single sources of truth

Core logic lives in exactly one place. Before writing a helper, check this map — if a
home exists, import from it; if the logic is new but shared, add it to the right module
and wire every caller through it. Never inline a second copy "just for this view".

| Concern | The one home |
| --- | --- |
| Typed-answer normalization (case/diacritics/articles), edit distance, title/sentence case | `lib/strings.ts` (`normalizeAnswer`, `editDistance`, `titleCase`, `sentenceCase`) |
| Random pick / sample / weighted pick / shuffle | `lib/arrays.ts` (`sample`, `sampleMany`, `weightedPick`, `shuffleArray`) — never inline `Math.floor(Math.random() * …)` |
| Clamp, number/amount/distance formatting | `lib/number.ts` (`clamp`, `clamp01`, `formatNumber`, `formatAmount`, `formatOrdinal`, `formatKm`) |
| Score clamping, buzz/blitz/pin/attempt curves, set-overlap scoring | `lib/scoring.ts` (`clampScore`, `jaccardFraction`, `buzzScore`, `blitzScore`, …) |
| Difficulty config, micro-nation gate, playable/unplayable pools | `lib/game-rules.ts` — never re-derive a pool or gate locally |
| Country lookup, names, flags, fuzzy country search, size-biased pick | `lib/country.ts` (`getCountry`, `countryName`, `normalizeCountryName`, `searchCountriesByName`, `pickSizedCountry`) |
| Player display names ("You"/"Anonymous"), standings, board progress | `lib/player.ts` (`playerDisplayName`, `seatLabel`, `compareStandings`, `boardProgress`) |
| Political-leader selection and leader-name matching | `lib/leaders.ts` (`politicalLeader`, `leaderNamesOverlap`) — quiz and reveal MUST select through the same function |
| The live round and `_type` narrowing | `lib/rounds.ts` (`latestRound`, `isChallengeOfType`, `latestChallengeOfType`, `expectChallengeType`) |
| Group-round view scaffolding (interstitial, countdown, clock fractions, guess ticker, submit-once) | `lib/useGroupChallenge.ts` (incl. `remainingFraction`/`elapsedFraction` — never divide `secondsLeft/duration` in a view) |
| Server-owned deadline shot clocks in views | `lib/use-deadline-clock.ts` |
| Live map camera (viewBox) reading, map→screen-percent projection, world frame size | `lib/use-map-viewbox.ts` + `WORLD_BOX` in `lib/geo.ts` |
| Foreign-SVG sanitization before DOM insertion | `lib/svg.ts` (`sanitizeSvg`) — security boundary, no component may parse SVG itself |
| Server round-engine rhythm (queued timers, deadline slack, reveal hold, whole-table settlement) | `lib/events/server/round-engine.ts` + `lib/events/server/turn-timing.ts` |
| Re-entering the movement phase | `scheduleMovementPhase` in `enter-movement-phase.handler.ts` |
| Redis game-state TTL | `setWithGameTtl` / `GAME_STATE_TTL_SECONDS` in `lib/events/server-side.ts` |
| Motion tokens, reduced-motion, dwell times | `lib/motion.ts` (`MOTION`, `EASE`, `DWELL`, `prefersReducedMotion`) — never raw `matchMedia` for reduced motion |
| Viewport breakpoints | `lib/use-viewport.ts` (`PHONE_MAX_PX`, `useIsPhone`, `useIsCoarsePointer`) — never a hardcoded `640px` in script |
| Region-variant labels | `lib/variant.ts` (`REGION_LABELS`) |
| Hand-drawn region maps (per variant) | `components/map/RegionMap.vue` + `REGION_MAP_COMPONENTS` in `components/map/region-maps.ts` — REAL imports; `resolveComponent` only resolves literal names, a dynamic name renders inert elements |
| Outline geometry (rings, area, centroid, resampling) | `lib/outline.ts` (`ringArea`, `ringCentroid`, …) |
| Small-option-table guess rounds (spent picks, attempt cap, per-attempt pay) | `lib/use-attempt-options.ts` |
| Collect-a-set blitz rounds (guess list, tinting, dupe bounce, early finish) | `lib/use-collect-set-round.ts` |
| The dark-blue ink and its washes | `ink($alpha, $lightness?)` in `assets/scss/rules/_ink.scss` — never a raw `hsla(215.7, …)`. NOTE: Sass does not evaluate functions inside custom-property values; write `--token: #{ink()}`, and JS strings need the literal color |
| Night-mode palette (City Nocturne / Sunset Blitz) | `--night-page`, `--night-land`, `--night-stroke`, `--night-amber` in `_palette.scss` |
| Shared keyframes (`chip-in`, `row-land`, `bar-grow`, `stroke-draw`, …) | `assets/scss/rules/_animations.scss` — scoped blocks reference them by name |
| Player identity edge (colour border on owned rows/cards) | `.player-accent` in `assets/scss/templates/_player-accent.scss` + inline `--player-color` |
| SCSS breakpoints | `$tablet`/`$laptop`/`$desktop` in `rules/_breakpoints.scss` — never a raw `640px` media query |

## Principles

- **Both sides of the wire share one function.** Anything the client computes and the
  server verifies (answer matching, scoring, guess policy) imports the same lib module —
  two implementations WILL drift.
- **Dealers and reveals agree by construction, not by convention.** If a quiz selects a
  subject (a leader, an empire, a stat), the reveal resolves it through the same
  exported selector — never a private mirror kept in sync by comments.
- **A constant used twice is a token.** Timings, thresholds, breakpoints and TTLs live
  in a named export next to their domain; call sites never re-declare `2000`, `640`,
  `0.2` or `172800`.
- **Views hold interaction state only.** Countdown math, normalization, formatting,
  scoring and map projection come from lib; a view that grows a generic helper is a
  signal that the helper belongs in lib.
- **New challenge modes start from the shared engines.** Client: `useGroupChallenge` +
  `useDeadlineClock`. Server: `round-engine.ts` (`scheduleDeadlineTask`,
  `scheduleRevealTask`, `settleRoundScores`) — never copy an existing engine file.
