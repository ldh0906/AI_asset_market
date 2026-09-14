import { expect, it } from 'vitest';
import { parseExtraction } from '../src/ai/intent';
const response = (text: object) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ budget: null, environment: null, ...text }) }] }] });
it('accepts structured requirements without inventing missing formats', () => {
  const extracted = parseExtraction(response({ capabilities: ['code-review'], input: 'code', output: null, questions: ['결과 형식을 선택하세요.'] }));
  expect(extracted.output).toBeNull(); expect(extracted.capabilities).toEqual(['code-review']);
});
it('rejects unsupported capabilities and unexpected model-generated fields', () => {
  expect(() => parseExtraction(response({ capabilities: ['shell-execution'], input: 'code', output: 'json', questions: [] }))).toThrow();
  expect(() => parseExtraction(response({ capabilities: ['report'], input: 'json', output: 'markdown', questions: [], price: 100 }))).toThrow();
});
it('does not turn refusals or incomplete output into recommendations', () => {
  expect(() => parseExtraction({ status: 'incomplete', output: [] })).toThrow();
  expect(() => parseExtraction({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] })).toThrow();
});
it('preserves an explicit zero budget and unsupported requested environment', () => {
  expect(parseExtraction(response({ capabilities: ['report'], input: 'json', output: 'markdown', budget: '0', environment: 'My custom agent', questions: ['지원 환경을 확인하세요.'] }))).toMatchObject({ budget: '0', environment: 'My custom agent' });
});
it('rejects currency conversions, negative budgets and malformed environment values', () => {
  for (const budget of ['-1', '100 USD', 100, '1.5']) expect(() => parseExtraction(response({ capabilities: ['report'], input: 'json', output: 'markdown', budget, questions: [] }))).toThrow();
  expect(() => parseExtraction(response({ capabilities: ['report'], input: 'json', output: 'markdown', environment: '', questions: [] }))).toThrow();
});
