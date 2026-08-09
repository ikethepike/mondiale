#!/bin/bash
# Peek at a live game blob in the Upstash instance from .env (dev/preview).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
source .env
set +a
KEY="${1:-beat-nose-month}"
curl -s "$UPSTASH_REDIS_REST_URL/get/$KEY" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" |
  python3 -c '
import json, sys, time
raw = json.load(sys.stdin)
value = raw.get("result")
if not value:
    print("KEY NOT FOUND in this Upstash instance")
    sys.exit(0)
game = json.loads(value)
now = int(time.time() * 1000)
print(f"game: {game.get(\"id\")} variant={game.get(\"variant\")} difficulty={game.get(\"difficulty\")} started={game.get(\"started\")} pendingRoundStart={game.get(\"pendingRoundStart\")}")
rounds = game.get("rounds", [])
print(f"rounds: {len(rounds)}")
for player in game.get("players", {}).values():
    print(f"  seat {player.get(\"name\")!r}: phase={player.get(\"phase\")} pos={player.get(\"currentPosition\")} walkSeq={player.get(\"walkSeq\")} resolving={player.get(\"resolving\")} moves={len(player.get(\"moves\", []))}")
if rounds:
    current = rounds[-1]
    challenge = current.get("groupChallenge", {})
    kind = challenge.get("_type", "group-challenge(ranking)")
    deadline = current.get("deadline")
    remaining = f"{(deadline - now) / 1000:.1f}s" if deadline else "unstamped"
    print(f"live round: kind={kind} Round.deadline={remaining}")
    state = challenge.get("state")
    if isinstance(state, dict):
        engine_deadline = state.get("deadline")
        engine_remaining = f"{(engine_deadline - now) / 1000:.1f}s" if engine_deadline else str(engine_deadline)
        print(f"  engine state: deadline={engine_remaining} " + " ".join(f"{k}={state.get(k)}" for k in ("turn", "beat", "revealing", "finished", "briefing") if k in state))
    answers = current.get("groupAnswers", {})
    turns = current.get("playerTurns", {})
    names = {pid: p.get("name") for pid, p in game.get("players", {}).items()}
    for pid, turn in turns.items():
        print(f"  banked {names.get(pid, pid)!r}: points={turn.get(\"points\")} answered={pid in answers} blocked={turn.get(\"blocked\")}")
'
