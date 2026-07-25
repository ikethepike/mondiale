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
(`isValidGame` untouched) and the default is genuinely *off*.

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
├── allowSpectators → upsert into game.spectators, join room, bind socket,
│                     broadcast 'player-joined' (room sees "2 watching")
└── otherwise       → 'game-already-started' to that socket, disconnect
```

The upsert (`??=`) makes spectator joins idempotent, exactly like player
joins — reconnects re-enter cleanly. Everything below the fork (rejoin
healing, phase repair) still runs only for real players.

Security posture is unchanged: the socket-to-player binding chokepoint in
`socket.server.ts` applies to spectators too, and every gameplay handler
resolves the sender through `game.players` — a spectator emitting
`submit-*` is a no-op. The one relay open to them by design is
`player-cheering` (see below). Note the same honesty caveat players already
live with: snapshots carry round answers, so a spectator colluding with a
player over a phone call was never preventable — the door toggle (and its
default off) is the actual defence.

## The spectator view

`ViewSpectate.vue` — a broadcast booth over the live world map (the map
renders at full scale behind it, tinted with every country the game has
visited so far, exactly like the victory atlas glow):

- **Header**: a LIVE badge, round number and mode ("Round 4 · silhouette"),
  and how many players have answered. The reveal headline ("The mystery
  country was Chad") only appears once every racer has answered — spectators
  see the drama, not the answer key, while a round is still open.
- **The race rail**: one row per player — pawn, name, live status (from
  `getPlayerStatus`, the same labels the in-game panel uses), points chip for
  the current round, and a tile-progress bar toward the finish. Finished
  players get their crown order.
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

Client plumbing is deliberately thin: an `isSpectator` getter
(`started && spectators[me] && !players[me]`) routes the room page to
`ViewSpectate` before any `player`-dependent branch, and the layout gets a
`phase-spectating` class so the map shows at full scale (it hides on
`phase-undefined` today, which is what a spectator would otherwise be).

## Edge cases

| Case | Behaviour |
| --- | --- |
| Latecomer, door closed | Unchanged: `game-already-started` dead end |
| Latecomer, door open | Admitted as spectator, room notified |
| Spectator reconnects | Idempotent re-join (same upsert path) |
| Door closed mid-watch | Spectators ejected: state dropped, sockets leave the room, dead-end screen |
| Spectator sends gameplay events | No-op: not in `players`, handlers resolve sender via `players` |
| Finisher spectates, race ends | Rail shows final order; return button back to the report |
| Pre-feature games in Redis | `allowSpectators`/`spectators` absent ⇒ off/empty — old snapshots stay valid |
| Host quits after finishing | Door state persists in the snapshot; toggle needs the host present (future: transferable host) |

## Future directions

- **Named spectators**: reuse the naming card so cheers carry a name; needs a
  `set-name` variant that writes `spectators` instead of `players`.
- **Door toggle in the status panel**: let the host flip spectator access
  mid-race without waiting for their victory screen.
- **Spectator link**: a `?spectate` URL that skips the player path even in the
  lobby (stream overlays, projectors).
- **Camera following**: drive `board.spectateTargetId` from the rail so a
  spectator's 3D board camera chases the leader.
