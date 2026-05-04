import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'] });
const client = new Client({ name: 'smoke-fixes', version: '0.0.1' });
await client.connect(transport);

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
}

// Fix #1: find_precedent_commons must NOT surface anti-patterns
{
  const res = await client.callTool({ name: 'find_precedent_commons', arguments: { domain: 'knowledge/digital' } });
  const text = res.content[0].text;
  const data = JSON.parse(text);
  const ids = data.map(d => d.id);
  const antiHits = ids.filter(id => /-anti-?pattern$/.test(id));
  check('find_precedent_commons filters anti-patterns', antiHits.length === 0, `top ids: ${ids.join(', ')}`);
}

// Fix #1b: find_similar_commons must NOT surface anti-patterns
{
  const res = await client.callTool({ name: 'find_similar_commons', arguments: { domain: 'knowledge/digital', what_stewarded: 'open knowledge' } });
  const text = res.content[0].text;
  const data = JSON.parse(text);
  const ids = data.map(d => d.id);
  const antiHits = ids.filter(id => /-anti-?pattern$/.test(id));
  check('find_similar_commons filters anti-patterns', antiHits.length === 0, `top ids: ${ids.join(', ')}`);
}

// Sanity: anti-patterns still visible via search.ts (we didn't break the catalog)
{
  const res = await client.callTool({ name: 'find_precedent_commons', arguments: { domain: 'knowledge/digital' } });
  const data = JSON.parse(res.content[0].text);
  check('domain still returns multiple precedents', data.length >= 3, `count=${data.length}`);
}

// Fix #2: suggest_commoning_protocols default cap shrinks output
{
  const res = await client.callTool({ name: 'suggest_commoning_protocols', arguments: { domain: 'knowledge/digital' } });
  const text = res.content[0].text;
  const data = JSON.parse(text);
  const sizes = Object.fromEntries(Object.entries(data.protocols_by_category).map(([k, v]) => [k, v.length]));
  const overCap = Object.entries(sizes).filter(([k, n]) => n > 4 && k !== data.highlighted_category);
  check('default response under cap', overCap.length === 0, `sizes: ${JSON.stringify(sizes)}`);
  check('default response < 10KB', text.length < 10000, `bytes=${text.length} (was 52721 pre-fix)`);
  check('totals_by_category present', !!data.total_protocols_by_category, '');
  check('max_per_category echoed', data.max_per_category === 4, `got=${data.max_per_category}`);
}

// Fix #2: max_per_category override works
{
  const res = await client.callTool({ name: 'suggest_commoning_protocols', arguments: { domain: 'knowledge/digital', max_per_category: 1 } });
  const data = JSON.parse(res.content[0].text);
  const sizes = Object.entries(data.protocols_by_category).map(([k, v]) => [k, v.length]);
  const overCap = sizes.filter(([k, n]) => n > 1 && k !== data.highlighted_category);
  check('max_per_category=1 honoured', overCap.length === 0, `sizes: ${JSON.stringify(Object.fromEntries(sizes))}`);
}

// Fix #2: oversize max_per_category is bounded — either rejected by zod
// at the MCP boundary (returned as error content) or clamped by the handler.
{
  let bounded = false, detail = '';
  try {
    const res = await client.callTool({ name: 'suggest_commoning_protocols', arguments: { domain: 'knowledge/digital', max_per_category: 99 } });
    const text = res.content[0].text;
    if (/validation|too_big|less.than.or.equal/i.test(text)) {
      bounded = true; detail = `validation rejected: ${text.slice(0, 80)}`;
    } else {
      const data = JSON.parse(text);
      bounded = data.max_per_category <= 10;
      detail = `handler clamped: echoed=${data.max_per_category}`;
    }
  } catch (e) {
    bounded = /validation|too_big|less.than.or.equal/i.test(e.message);
    detail = `threw: ${e.message.slice(0, 80)}`;
  }
  check('oversize max_per_category bounded', bounded, detail);
}

console.log(`\n${pass} pass, ${fail} fail`);
await client.close();
process.exit(fail > 0 ? 1 : 0);
