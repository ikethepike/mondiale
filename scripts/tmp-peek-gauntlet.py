"""Peek a seat's gauntlet payload (lives/turn/questions) — knockout-loop check."""

import json
import os
import sys
import urllib.request

room = sys.argv[1] if len(sys.argv) > 1 else 'toy-crew-weather'

env = {}
with open('.env') as fh:
    for line in fh:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            key, _, value = line.partition('=')
            env[key.strip()] = value.strip().strip('"')

url = env.get('UPSTASH_REDIS_REST_URL') or env.get('REDIS_REST_URL')
token = env.get('UPSTASH_REDIS_REST_TOKEN') or env.get('REDIS_REST_TOKEN')
request = urllib.request.Request(f'{url}/get/{room}', headers={'Authorization': f'Bearer {token}'})
payload = json.loads(urllib.request.urlopen(request).read())['result']
game = json.loads(payload)

for pid, player in game['players'].items():
    line = f"seat '{player.get('name', pid)}': phase={player['phase']} pos={player['currentPosition']}"
    move = (player.get('moves') or [None])[0]
    challenge = (move or {}).get('challenge') or {}
    if challenge.get('_type') == 'final-challenge':
        line += (
            f" | gauntlet: lives={challenge.get('lives')} turn={challenge.get('turn')}"
            f" correct={challenge.get('answeredCorrect')}/{challenge.get('totalCount')}"
            f" questionsLeft={len(challenge.get('challenges') or [])}"
            f" head={((challenge.get('challenges') or [{}])[0] or {}).get('_type')}"
        )
    print(line)
