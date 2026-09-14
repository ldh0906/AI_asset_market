import { parentPort, workerData } from 'node:worker_threads';
import { testPipeline, scan } from './engine.mjs';
try {
  const { texts, kinds } = workerData;
  const security = texts.map((text, i) => scan(text, kinds[i] === 'workflow' ? 'skill' : 'document'));
  const skillTexts = texts.filter((_, i) => kinds[i] === 'workflow');
  const result = skillTexts.length === texts.length ? testPipeline(skillTexts.map(text => JSON.parse(text))) : null;
  parentPort.postMessage({ result, security });
} catch (e) { parentPort.postMessage({ error: e.message }); }
