import fs from 'node:fs/promises';
import { quartilesFor } from '../frontend/quartil-rules.js';

const snapshotPath = process.argv[2] ?? 'data/quartil.snapshot.json';
const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));

for (const consultant of snapshot.consultants) {
  for (const point of consultant.history ?? []) point.quartiles = quartilesFor(consultant, point);
  const latest = consultant.history?.at(-1) ?? consultant;
  consultant.quartiles = quartilesFor(consultant, latest);
}

await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Snapshot atualizado: ${snapshot.consultants.length} consultores`);
