"""Peek at a live game blob via the Upstash REST API (creds from .env)."""

import json
import os
import sys
import time
import urllib.request

key = sys.argv[1] if len(sys.argv) > 1 else 'beat-nose-month'

env = {}
with open('.env') as handle:
    for line in handle:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            name, _, value = line.partition('=')
            env[name.strip()] = value.strip().strip('"').strip("'")

url = env['UPSTASH_REDIS_REST_URL'].rstrip('/')
token = env['UPSTASH_REDIS_REST_TOKEN']

request = urllib.request.Request(f'{url}/get/{key}', headers={'Authorization': f'Bearer {token}'})
with urllib.request.urlopen(request, timeout=15) as response:
    raw = json.load(response)

value = raw.get('result')
if not value:
    print('KEY NOT FOUND in this Upstash instance')
    sys.exit(0)

game = json.loads(value) if isinstance(value, str) else value
now = int(time.time() * 1000)

print(
    f"game: {game.get('id')} variant={game.get('variant')} "
    f"difficulty={game.get('difficulty')} started={game.get('started')} "
    f"pendingRoundStart={game.get('pendingRoundStart')}"
)
rounds = game.get('rounds', [])
print(f'rounds: {len(rounds)}')
names = {pid: p.get('name') for pid, p in game.get('players', {}).items()}
for player in game.get('players', {}).values():
    print(
        f"  seat {player.get('name')!r}: phase={player.get('phase')} "
        f"pos={player.get('currentPosition')} walkSeq={player.get('walkSeq')} "
        f"resolving={player.get('resolving')} moves={len(player.get('moves') or [])}"
    )
if rounds:
    current = rounds[-1]
    challenge = current.get('groupChallenge') or {}
    kind = challenge.get('_type', 'group-challenge(ranking)')
    deadline = current.get('deadline')
    remaining = f'{(deadline - now) / 1000:.1f}s' if deadline else 'unstamped'
    print(f'live round: kind={kind} Round.deadline={remaining}')
    state = challenge.get('state')
    if isinstance(state, dict):
        engine_deadline = state.get('deadline')
        engine_remaining = (
            f'{(engine_deadline - now) / 1000:.1f}s' if engine_deadline else str(engine_deadline)
        )
        flags = ' '.join(
            f'{field}={state.get(field)}'
            for field in ('turn', 'beat', 'revealing', 'finished', 'briefing')
            if field in state
        )
        print(f'  engine state: deadline={engine_remaining} {flags}')
    answers = current.get('groupAnswers') or {}
    for pid, turn in (current.get('playerTurns') or {}).items():
        print(
            f"  banked {names.get(pid, pid)!r}: points={turn.get('points')} "
            f"answered={pid in answers} blocked={turn.get('blocked')}"
        )
