import fs from 'node:fs/promises';
import { demoFiles } from '../tests/fixtures.mjs';
await fs.mkdir('output/demo', { recursive: true });
for (const f of demoFiles()) await fs.writeFile(`output/demo/${f.name}`, f.buffer);
console.log('CSVs fictícios gerados em output/demo. Importe na interface e selecione o domínio indicado em cada nome.');
