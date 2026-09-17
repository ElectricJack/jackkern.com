"""Capture Matter's settled ECS transforms through its published agent protocol.

Run against the dedicated VillaGoldTreasury editor session. This does not simulate
or invent placements: play/pause drive the editor's native Box3D physics.
"""
import json
import sys
import time
import uuid
from pathlib import Path

control = Path(sys.argv[1])
output = Path('docs/design/gold-treasury')
output.mkdir(parents=True, exist_ok=True)
command_file = control / 'commands-raster.txt'
result_file = control / 'results-raster.jsonl'
result_file.touch(exist_ok=True)

def send(lines):
    with command_file.open('a') as stream:
        stream.write('\n'.join(lines) + '\n')

def request_many(command, arguments):
    ids = [str(uuid.uuid4()) for _ in arguments]
    send(['agent ' + json.dumps(dict(version=1, request_id=id, command=command,
          args=args, timeout_ms=30000)) for id, args in zip(ids, arguments)])
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        records = {}
        for line in result_file.read_text().splitlines():
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if record.get('request_id') in ids:
                records[record['request_id']] = record
        if len(records) == len(ids):
            rows = [records[id] for id in ids]
            for row in rows:
                if not row.get('ok'):
                    raise RuntimeError(row)
            return rows
        time.sleep(.2)
    raise TimeoutError(command)

listing = request_many('scene.list_objects', [dict(kinds=['entity'], limit=200)])[0]
objects = [row for row in listing['result']['objects'] if row['name'].get('value', '').startswith(('bar-', 'coin-'))]
assert len(objects) == 128, f'Expected 26 bars and 102 coins, found {len(objects)}'
assert not any('PhysicsError' in row['components'] for row in objects)
(output / 'native-listing.json').write_text(json.dumps(listing, indent=2) + '\n')

def snapshot(name):
    rows = []
    for start in range(0, len(objects), 24):
        rows.extend(request_many('scene.get_object', [dict(object=row['object']) for row in objects[start:start+24]]))
    (output / (name + '.json')).write_text(json.dumps(rows, indent=2) + '\n')
    return rows

snapshot('before')
send(['timescale 2', 'play'])
print('Native Matter simulation running', flush=True)
time.sleep(30)
send(['pause', 'wait_frames 2'])
first = snapshot('settled-first')
send(['play'])
time.sleep(10)
send(['pause', 'wait_frames 2'])
second = snapshot('settled-final')
def matrices(rows):
    return [row['result']['placement']['world_matrix'] for row in rows]
delta = max(abs(x-y) for a,b in zip(matrices(first), matrices(second)) for x,y in zip(a,b))
assert delta < .0001, f'Piles still moving: maximum native matrix change {delta}'
(output / 'settle-check.json').write_text(json.dumps(dict(engine='MatterEditor 2026-09-16-r2 ECS / Box3D', scale=10,
    objects=len(objects), maxMatrixChange=delta, settled=True), indent=2) + '\n')
print('Native settle verified:', len(objects), 'objects; matrix change', delta, flush=True)
