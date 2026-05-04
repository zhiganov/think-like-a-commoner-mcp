import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = new URL(process.argv[2] ?? 'https://tlac-book-mcp-production.up.railway.app/mcp');
const transport = new StreamableHTTPClientTransport(url);
const client = new Client({ name: 'smoke-fixes-prod', version: '0.0.1' });
await client.connect(transport);

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
}

console.log(`URL: ${url}`);

// Fix #1a
{
  const res = await client.callTool({ name: 'find_precedent_commons', arguments: { domain: 'knowledge/digital' } });
  const data = JSON.parse(res.content[0].text);
  const ids = data.map(d => d.id);
  const antiHits = ids.filter(id => /-anti-?pattern$|-anticommons$/.test(id));
  check('find_precedent_commons filters anti-patterns', antiHits.length === 0, `top ids: ${ids.join(', ')}`);
}

// Fix #1b
{
  const res = await client.callTool({ name: 'find_similar_commons', arguments: { domain: 'knowledge/digital', what_stewarded: 'open knowledge' } });
  const data = JSON.parse(res.content[0].text);
  const ids = data.map(d => d.id);
  const antiHits = ids.filter(id => /-anti-?pattern$|-anticommons$/.test(id));
  check('find_similar_commons filters anti-patterns', antiHits.length === 0, `top ids: ${ids.join(', ')}`);
}

// Fix #2
{
  const res = await client.callTool({ name: 'suggest_commoning_protocols', arguments: { domain: 'knowledge/digital' } });
  const text = res.content[0].text;
  const data = JSON.parse(text);
  check('suggest_commoning_protocols default response < 10KB', text.length < 10000, `bytes=${text.length}`);
  check('max_per_category echoed in response', data.max_per_category === 4, `got=${data.max_per_category}`);
  check('total_protocols_by_category surfaced', !!data.total_protocols_by_category, '');
}

console.log(`\n${pass} pass, ${fail} fail`);
await client.close();
process.exit(fail > 0 ? 1 : 0);
