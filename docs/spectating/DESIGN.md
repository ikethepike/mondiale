# Spectating

The race is fun to watch — the victory screen already proves it with its live
"The Race Continues" rail. Spectating turns that into a first-class surface:
a live broadcast booth over the world map, available to anyone the game lets
watch.

Screenshots live next to this file: the current victory/atlas flow
(`current-*.png`) and the spectator system (`spectate-*.png`).

## Who can spectate

Two doors into the same view:

1. **Finishers.** A player whose `phase` is `victory` while others race is
   already receiving every broadcast — the report card just doesn't show it.
   A "Watch the race live" button on the victory report flips a client-side
   flag (`gameStore.spectating`) and swaps to the spectator view. No server
   involvement; the return button restores the report.

2. **Latecomers.** Someone opening the room URL after `game.started` is today
   met by `game-already-started` and a closed socket. When the host has opened
   the spectator door (`game.allowSpectators`, **default off**), the join
   handler instead admits them as a `Spectator` — in the socket room, never in
   `game.players`, never owning a pawn.

## The model

Spectators are watchers, not competitors, so they live beside — not inside —
the player map (`types/game.types.ts`):

```ts
export interface Spectator {
  id: string
  joinedAtRound: number // "arrived round 4" flavour + future analytics
}

interface Game {
  /** Host toggle: let latecomers watch a started game. Absent = off. */
  allowSpectators?: boolean
  /** Watchers, not competitors — never in `players`, never own a pawn. */
  spectators?: { [spectatorId: string]: Spectator }
}
```

Both fields are optional, so every game stored before this feature stays valid
(`isValidGame` untouched) and the default is genuinely _off_.

Being in the socket room is what makes spectating live: every broadcast is a
room broadcast, so spectators receive the same whole-game snapshots, live
guesses and cheers as players, with zero new sync machinery.

## The toggle

One dedicated event, `set-spectator-access` (host-only), instead of a field on
`GameConfiguration`: configuration is frozen at `start-game` (it regenerates
tiles), while the spectator door must swing **any time** — the common ask is
"my friend wants to watch" mid-game.

- **Lobby**: a row in the challenge-settings page ("Spectators · on/off").
- **Mid-game / victory**: the host's victory report footer carries the same
  toggle, so a finished host can open the door for the endgame audience.
- Turning it **off ejects current spectators**: it's the only eviction lever a
  host has against a lurker. The handler drops `game.spectators`, broadcasts
  the snapshot, then removes those sockets from the room server-side (a
  misbehaving client can't keep listening). Ejected clients land on the same
  dead-end screen a closed-door latecomer sees.

## The join flow

In `join.event.ts`, the started-game rejection becomes a fork:

```
game started, playerId not in players
├── allowSpectators + under cap → upsert into game.spectators, join room,
│                                 bind socket, broadcast 'player-joined'
├── allowSpectators + at cap     → 'game-already-started', disconnect
└── otherwise                    → 'game-already-started', disconnect
```

The upsert (`??=`) makes spectator joins idempotent, exactly like player
joins — reconnects re-enter cleanly. Everything below the fork (rejoin
healing, phase repair) still runs only for real players.

`MAX_SPECTATORS` (20) caps the watcher set: spectator records ride every
broadcast snapshot, so an unbounded set would inflate the payload for the
whole room. Returning watchers (already in the set) are never turned away.

**Spectators are pruned on disconnect.** `pruneSpectatorOnDisconnect` (in
`socket.server.ts`, on the per-game queue) removes a dropped watcher from
`game.spectators` and rebroadcasts, so the "N watching" count stays honest.
Players are the deliberate exception — their records persist across
disconnects for reconnect healing, so the prune skips anyone in
`game.players`.

### Impersonation: why a public id is not enough

`playerId` is the PUBLIC identifier — it keys every client render and rides
in every snapshot. Before spectators, only players saw those ids; now anyone
admitted through the door does. So the id can no longer double as the bearer
token that binds a socket to an identity, or a spectator could read a racer's
id off the wire and act as them.

The fix (`lib/player-secret.ts`) splits the two roles. Each client also holds
a private **secret** (uuid in `localStorage`), sent only in the handshake
auth — never in an event payload, never in a snapshot. Secrets live under a
separate `${gameId}:secrets` redis key that is physically outside the `Game`
object, so they cannot ride a broadcast. Both bind points verify it:

- the `join` handler, before binding `socket.data.playerId`;
- the handshake fast-path in `socket.server.ts`, for reconnect rebinding.

`verifyPlayerSecret(recorded, presented)` returns `claim` (first join —
record it), `ok` (match — bind), `reject` (a secret is on file and the
presented one is missing or wrong — an impersonation attempt), or `open` (no
secret either side — a cached pre-secret client; bind unverified so it keeps
working). Critically, once a secret is on file, _omitting_ one rejects — an
attacker can't sidestep the check by sending nothing.

**Migration.** Games already in flight at deploy have no secrets on file, so
the first secret each client presents is claimed. A narrow window exists
where, before an offline owner reconnects, an attacker who already knows that
game's ids could claim a slot first; it closes per-player as each reconnects
and fully drains within the 2-day game TTL. Live games are not invalidated.

Beyond binding, the honesty caveat players already live with still holds:
snapshots carry round answers, so a spectator colluding with a player over a
phone call was never preventable — the door toggle (default off) and the
spoiler control are the practical defences there.

## The spectator view

`ViewSpectate.vue` — a broadcast booth over the live world map:

- **Header**: a LIVE badge, round number and mode ("Round 4 · silhouette"),
  who the camera is following and why (pinned or auto director), and the
  watcher count.
- **The race rail**: one row per player — pawn, name, live status (from
  `getPlayerStatus`, the same labels the in-game panel uses), points chip for
  the current round, and a tile-progress bar toward the finish. Tapping a row
  pins the camera to that racer (🎥); tapping again hands control back to the
  auto director.
- **Live guesses**: the existing `GuessTicker` fed by the `player-guessing`
  relay — spectators watch answers land in real time, under the same
  redaction policy players get (presence-only rounds stay presence-only).
- **Cheering**: spectators are a crowd, so they can cheer. The
  `player-cheering` relay already authenticates the sender and validates the
  target; the toast falls back to "A spectator" for senders outside
  `players`. This is the one interaction spectators have — enough to be felt,
  never enough to touch state.
- **Past rounds**: the board's `RoundHistoryDrawer`, reused as-is.
- **Footer**: finishers get "Back to your report"; latecomers get a home
  link. When the last racer finishes, the header flips to "Race complete —
  final standings" and the rail becomes the final order.

## Follow mode: the centre stage

The booth is a dashboard; the **stage** is the camera. `lib/spectate.ts`
holds the logic, `components/spectate/` the two surfaces:

- **The auto director** (`pickDirectorTarget`) cuts to the most watchable
  moment: walking pawns beat the final gauntlet, which beats challenge gates,
  which beat quiet thinking; ties go to the race leader. Pinning a rail row
  overrides it; `stageForPhase` then maps the followed racer's phase to a
  stage.
- **Question stage** (group rounds): a lower-third card with the round's task
  as the racers see it (`roundStory` — for ranking rounds it shows the
  followed player's actual dealt hand of flags), plus per-player answered
  ticks. The card carries the **audience secret**: the answer, framed as
  dramatic irony ("It's Chad — will anyone see it?"). Racers never see this;
  watchers hold no pawn, and room snapshots carry the data regardless.
- **Scores stage**: the round's scorecard the moment it settles, with the
  reveal headline.
- **Board stage**: the real 3D board (`SpectateBoard` mounts `Board3D` with
  the followed racer as the scene's "own pawn"), so the entry framing,
  follow-cam, path preview and gate knocks all track them. Spectators can
  grab and orbit the camera like any player.
- **Gate / gauntlet stages**: the actual question at the followed player's
  gate (`gateStory`), banked steps, and for the final gauntlet a cleared/lives
  progress bar (`finalStory` per question type). Each variant mirrors what the
  racer actually sees rather than the accessor phrasing: flag gates render the
  candidate flags ("Which flag belongs to Brazil?"), photo gates show the
  skyline/landmark/portrait, and "name the hidden country" gates (silhouette,
  zoom-out, outline-reveal) keep the country in the spoiler-gated secret
  instead of the prompt. Where the answer is one of the shown choices, its
  flag is ticked — but only when spoilers are shown; the choices themselves
  are the question, so they render either way (a hidden-spoiler spectator can
  still play along).
- **The map is the stage's backdrop**: each story's focus countries glow and
  the camera frames them (the optimal traversal route, the mystery country,
  the gauntlet's subject); with nothing to point at it falls back to the
  game's atlas glow. Repaints are keyed on the focus set (and the spoiler
  flag), so the 500ms walk snapshots never thrash the camera, and painting
  preserves the live-guess ticker across its `clearBoard`.

### Every card shows its real prompt

A spectator card must never _describe_ an asset it doesn't _show_ — a flag gate
that says "which flag?" with no flag, a silhouette round that says "name the
outline" with no outline. Every challenge type now mirrors what the racer
actually sees:

- **Flags** — flag-pick/flag-twins/leader-pick/odd-one-out/border-detective,
  the min/max and trend-race choice sets: the candidate flags render as a row;
  the correct one is ticked only when spoilers are shown (the choices are the
  question, so they render either way).
- **Photos** — capital skylines, landmarks, leader portraits, heritage sites.
- **Silhouettes** — the country's mainland outline (`mainlandOutline`), for the
  silhouette round and the outline-reveal gate.
- **Colour swatches** — flag-palette's hex swatches.
- **Fact lists** — two-truths' three claims (with values) and the
  stat-detective dossier (topics).

Anything genuinely map-driven (hot & cold probes, flashpoint dots, water
features) or subject-named (traversal, neighbour-blitz, mother-tongue) is
self-contained narration that points at nothing it doesn't render. A test
(`spectate.test.ts`) enumerates **every** round kind, gate variant and final
question type and fails if any prompt references an unshown asset — the
regression net for this invariant.

### The spoiler control

The secrets, pre-settle reveal headlines and answer-focus map glow are the
spectator's dramatic irony — but a watcher's screen might be glanced at by
someone in the room, and a pinned fast player reaches the scores stage while
others are still answering. A **"Spoilers shown / hidden"** toggle in the
booth (`spectateHideSpoilers`, default _shown_ — the engaging default) hides
all three at once: the secret card, the pre-race scores headline, and the map
focus glow (which falls back to the atlas). Prompts, dealt hands, answered
ticks and the board are never spoilers, so they stay.

Client plumbing is deliberately thin: an `isSpectator` getter
(`started && spectators[me] && !players[me]`) routes the room page to
`ViewSpectate` before any `player`-dependent branch, and the layout gets a
`phase-spectating` class so the map shows at full scale (it hides on
`phase-undefined` today, which is what a spectator would otherwise be).

## Edge cases

| Case                                    | Behaviour                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Latecomer, door closed                  | Unchanged: `game-already-started` dead end                                                     |
| Latecomer, door open, under cap         | Admitted as spectator, room notified                                                           |
| Latecomer, door open, at cap (20)       | Refused: `game-already-started` dead end                                                       |
| Spectator reconnects                    | Idempotent re-join (same upsert path); prune + re-add blips the count                          |
| Spectator disconnects                   | Pruned from `game.spectators`, count rebroadcast (players never pruned)                        |
| Door closed mid-watch                   | Spectators ejected: state dropped, sockets leave the room, dead-end screen                     |
| Spectator forges another id             | Rejected at bind: secret mismatch → `game-already-started`, disconnect                         |
| Spectator sends its own gameplay events | No-op: not in `players`, handlers resolve sender via `players`                                 |
| Finisher spectates, race ends           | Rail shows final order; return button back to the report                                       |
| Pre-feature games in Redis              | `allowSpectators`/`spectators` absent ⇒ off/empty — old snapshots stay valid                   |
| In-flight game at deploy                | No secrets on file yet — first presented secret is claimed (see Migration)                     |
| Host quits after finishing              | Door state persists in the snapshot; toggle needs the host present (future: transferable host) |

## Future directions

- **Named spectators**: reuse the naming card so cheers carry a name; needs a
  `set-name` variant that writes `spectators` instead of `players`.
- **Door toggle in the status panel**: let the host flip spectator access
  mid-race without waiting for their victory screen.
- **Spectator link**: a `?spectate` URL that skips the player path even in the
  lobby (stream overlays, projectors).
- **Mounting the real challenge views read-only**: rejected for now. The
  challenge components (`View*.vue`) read the _local_ player via
  `useGroupChallenge`, run _local countdown timers started at mount_, own the
  shared `gameStore.map.*`, and submit on their own timers. A `readonly` flag
  would mean threading a followed-player override + emit/timer suppression
  through ~25 gameplay components (high regression risk), and — because the
  reveal timing isn't in the snapshot for most modes — it would still only
  produce a _desynced local replay_, not the racer's real progress. The
  isolated card (spectator code that can't touch gameplay or emit) is the safer
  architecture; the fidelity gap was motion, addressed below. The two
  snapshot-driven modes (border-chain, heritage-hunt) are the only ones a
  read-only mount could genuinely sync — a possible future exception.
- **Cut animations**: a brief "camera cut" wipe when the auto director
  switches subjects, and a ticker of director decisions ("cutting to Vera —
  final gauntlet").

### Asset motion

The rendered assets animate in, echoing the racer's own reveal — on the
spectator's clock, since the timing isn't in the snapshot (it's ambience, not
a synced game timer). The silhouette / outline-reveal border **strokes itself
in** (GSAP over `getTotalLength`), then the fill washes up under it; facts,
swatches and option flags **flip in one at a time** (a CSS `stagger-in` keyed
on index). All of it is `prefers-reduced-motion` safe — assets appear at rest.

## Addendum — August 2026: the fidelity rework

The story-card architecture this document designed is largely retired. The
booth now mounts the REAL challenge views read-only through a seat override
(`gameStore.seatId`, written only by the booth) with a central write gate in
`update()`, an `inert` mount boundary (`SpectateMount`), and a SpoilerVeil for
reveal states reached early. The original objections to mounting real views
(§ "Mounting the real challenge views read-only") were answered one by one —
see the PR chain #96–#101 and `MOUNTABLE_KINDS` in `lib/spectate.ts`.

What survives of this document's design: the door/join model, the auto
director (now with shot memory — `nextDirectorShot`), hide-spoilers (as the
veil), and story cards for exactly three kinds the booth cannot mount
honestly: the two audio rounds (a local play tap is required, and the inert
boundary rightly blocks it) and sketch (the canvas is local-only). Booth
chrome consolidated into `SpectateBar`.
