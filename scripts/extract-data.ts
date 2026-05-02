// scripts/extract-data.ts
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');
const SOURCE = join(ROOT, 'books', 'think-like-a-commoner.md');
const DATA_DIR = join(ROOT, 'src', 'data');
const CACHE_DIR = join(ROOT, '.extraction-cache');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = 'claude-sonnet-4-6';
const CONCURRENCY = 4;

type Catalog =
  | 'commons' | 'enclosures' | 'strategies'
  | 'ostrom' | 'glossary' | 'quotes';

// Domain enum mirrored here for the extraction prompt + tool schema validation
const DOMAINS = [
  'land', 'water', 'food/seed', 'knowledge/digital',
  'social/mutual_aid', 'urban', 'money/finance',
  'labor', 'energy', 'cultural',
] as const;

// System prompt is the same across ALL calls — eligible for prompt caching.
// Made deliberately rich so it crosses the 1024-token cache minimum for Sonnet.
const SYSTEM_PROMPT = `You are extracting structured catalog entries from David Bollier's "Think Like a Commoner: A Short Introduction to the Life of the Commons" (Second Edition, 2024, New Society Publishers, CC BY-NC-SA 4.0) for an MCP server that helps practitioners apply Bollier's framing to real situations.

Domain audience: commons stewards/organizers and movement strategists. Tools that consume your output will help users diagnose enclosures, design commons, and reframe market-mind problems in commoning-mind terms.

Apply these conventions on every extraction:

EXTRACTION DISCIPLINE
- Stay close to Bollier's voice. Don't invent terminology he wouldn't use. Don't soften his framing — if he calls something "enclosure" or "neo-extractivism," keep that.
- Use stable kebab-case IDs that capture the essence (e.g., "erakulapally-seed-sharing", "wolfpak-surfers", "land-grab-customary-rights-gap", "financialization-of-nature").
- A given commons or pattern may be referenced across multiple chapters. Use the same ID; the de-dup pass will handle merging.
- For source_chapter, use short forms: "Preface", "Introduction", "Ch. 1", "Ch. 2", ... "Conclusion", "Tools Appendix", or for Part dividers "Part I", "Part II", "Part III".
- Quote sparingly. Source quotes must be ≤200 words and verbatim. Skip the source_quote field if no especially strong passage applies.

MODAL MARKERS
Use MUST / SHOULD / MUST NOT in protocol descriptions, strategy descriptions, and Ostrom diagnostic questions when Bollier states:
- A hard rule (e.g., "a commons MUST have boundaries, rules, social norms, and sanctions" — Ch. 2)
- A strong default (e.g., "monitoring SHOULD be done by community members, not external authorities")
- An explicit anti-pattern (e.g., "a commons MUST NOT be confused with open-access — that is Hardin's mistake")

Forces specificity. Don't waffle.

ANTI-PATTERN SURFACING
Bollier names many anti-patterns: commons-washing, financialization-of-nature, neo-extractivism, market/state duopoly, "tragedy of unmanaged open access" misnamed as commons. When extracting Enclosures, surface at least one anti-pattern callout in the signature field.

DOMAIN ENUM (use exactly one per entry)
- "land" — territory, real estate, public lands
- "water" — fresh water, oceans, groundwater, rivers
- "food/seed" — agriculture, seeds, food systems, fisheries
- "knowledge/digital" — software, knowledge, data, internet, AI, IP
- "social/mutual_aid" — gift economies, mutual aid, blood/organ donation, community support
- "urban" — neighborhoods, public space, housing, urban infrastructure
- "money/finance" — currency, banking, credit, financialization
- "labor" — work, cooperatives, platform labor
- "energy" — electricity, fuels, climate
- "cultural" — language, traditions, music, festival, religious commons

If something fits multiple domains, pick the most central one for that case.

OUTPUT
You must call the provided tool with structured arguments. Do not narrate, do not output prose. If a chapter has no entries that fit the schema, call the tool with an empty array.`;

// Tool schemas — used as Anthropic tools (input_schema) for forced structured output.
type ToolSchema = { name: string; description: string; input_schema: any };

function entriesArray(itemSchema: any): any {
  return {
    type: 'object',
    properties: {
      entries: { type: 'array', items: itemSchema },
    },
    required: ['entries'],
  };
}

const TOOLS: Record<Catalog, ToolSchema> = {
  commons: {
    name: 'save_commons',
    description: 'Save extracted commons cases (Bollier examples of community + care-wealth + protocols).',
    input_schema: entriesArray({
      type: 'object',
      properties: {
        id: { type: 'string', description: 'kebab-case stable ID' },
        name: { type: 'string' },
        domain: { type: 'string', enum: [...DOMAINS] },
        brief: { type: 'string', description: '1-2 sentence description' },
        community: { type: 'string', description: 'Who stewards it' },
        care_wealth: { type: 'string', description: 'What is stewarded' },
        protocols: { type: 'array', items: { type: 'string' }, description: '2-5 social rules / norms / practices, with MUST/SHOULD where Bollier is prescriptive' },
        source_chapter: { type: 'string' },
        source_quote: { type: 'string', description: 'Optional verbatim grounding passage, ≤200 words' },
      },
      required: ['id', 'name', 'domain', 'brief', 'community', 'care_wealth', 'protocols', 'source_chapter'],
    }),
  },
  enclosures: {
    name: 'save_enclosures',
    description: 'Save extracted enclosure patterns (the dynamics by which shared wealth is privatized/captured).',
    input_schema: entriesArray({
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        signature: { type: 'string', description: 'Recognition heuristics; surface at least one anti-pattern explicitly' },
        example: { type: 'string', description: 'Canonical case from the book' },
        domain_examples: {
          type: 'object',
          description: 'Map of Domain → array of example case names (1-3 per domain). Use the Domain enum keys.',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
        response_strategy_ids: { type: 'array', items: { type: 'string' }, description: 'Strategy IDs that counter this enclosure (kebab-case). Empty if none surfaced yet.' },
        source_chapter: { type: 'string' },
      },
      required: ['id', 'name', 'signature', 'example', 'domain_examples', 'response_strategy_ids', 'source_chapter'],
    }),
  },
  strategies: {
    name: 'save_strategies',
    description: 'Save extracted commoning strategies (parallel polis, federation, decommodification, vernacular law, etc.).',
    input_schema: entriesArray({
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string', description: '2-4 sentences with MUST/SHOULD where Bollier is prescriptive' },
        problem_enclosure_ids: { type: 'array', items: { type: 'string' }, description: 'IDs of enclosures this strategy counters' },
        example_commons_ids: { type: 'array', items: { type: 'string' }, description: 'IDs of commons that exemplify this strategy' },
        source_chapter: { type: 'string' },
      },
      required: ['id', 'name', 'description', 'problem_enclosure_ids', 'example_commons_ids', 'source_chapter'],
    }),
  },
  ostrom: {
    name: 'save_ostrom_principles',
    description: "Save Elinor Ostrom's 8 design principles for durable commons. Exactly 8 entries expected, numbered 1-8.",
    input_schema: entriesArray({
      type: 'object',
      properties: {
        number: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7, 8] },
        name: { type: 'string' },
        description: { type: 'string' },
        diagnostic_questions: { type: 'array', items: { type: 'string' }, description: '3-5 yes/no or short-answer questions to assess whether a commons embodies this principle. Use MUST where Bollier/Ostrom is prescriptive.' },
        example_commons_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['number', 'name', 'description', 'diagnostic_questions', 'example_commons_ids'],
    }),
  },
  glossary: {
    name: 'save_glossary',
    description: "Save Bollier vocabulary terms (commoning, Commonsverse, care-wealth, vernacular law, parallel polis, OntoShift, etc.).",
    input_schema: entriesArray({
      type: 'object',
      properties: {
        term: { type: 'string' },
        definition: { type: 'string', description: "Bollier's framing, ≤120 words" },
        see_also: { type: 'array', items: { type: 'string' }, description: 'Related terms (lowercase)' },
        source_quote: { type: 'string' },
        source_chapter: { type: 'string' },
      },
      required: ['term', 'definition', 'see_also'],
    }),
  },
  quotes: {
    name: 'save_quotes',
    description: 'Save themed verbatim quotes from Bollier for citation grounding.',
    input_schema: entriesArray({
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string', description: 'Verbatim, ≤200 words' },
        themes: { type: 'array', items: { type: 'string' }, description: 'Lowercase tags like "enclosure", "financialization", "ontoshift", "tragedy", "commoning"' },
        source_chapter: { type: 'string' },
        source_attribution: { type: 'string', description: 'e.g., "Bollier, Think Like a Commoner 2nd ed. (2024), Ch. 2"' },
      },
      required: ['id', 'text', 'themes', 'source_chapter', 'source_attribution'],
    }),
  },
};

const FILE_HEADERS: Record<Catalog, string> = {
  commons: `import type { Commons } from '../types.js';\n\nexport const COMMONS: Commons[] = `,
  enclosures: `import type { Enclosure } from '../types.js';\n\nexport const ENCLOSURES: Enclosure[] = `,
  strategies: `import type { Strategy } from '../types.js';\n\nexport const STRATEGIES: Strategy[] = `,
  ostrom: `import type { OstromPrinciple } from '../types.js';\n\nexport const OSTROM_PRINCIPLES: OstromPrinciple[] = `,
  glossary: `import type { GlossaryTerm } from '../types.js';\n\nexport const GLOSSARY: GlossaryTerm[] = `,
  quotes: `import type { Quote } from '../types.js';\n\nexport const QUOTES: Quote[] = `,
};

// Catalogs that should skip part-divider chapters (lightweight content, low yield)
const SKIP_PART_DIVIDERS: Set<Catalog> = new Set(['commons', 'enclosures', 'strategies']);

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function chapterChunks(source: string): { chapterLabel: string; text: string; isPartDivider: boolean }[] {
  const lines = source.split('\n');
  const chunks: { chapterLabel: string; text: string; isPartDivider: boolean }[] = [];
  let currentLabel = 'Frontmatter';
  let currentLines: string[] = [];
  for (const line of lines) {
    if (/^# [^#]/.test(line)) {
      if (currentLines.length) {
        chunks.push({
          chapterLabel: currentLabel,
          text: currentLines.join('\n'),
          isPartDivider: /^Part\s/i.test(currentLabel),
        });
      }
      currentLabel = line.replace(/^# /, '').trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length) {
    chunks.push({
      chapterLabel: currentLabel,
      text: currentLines.join('\n'),
      isPartDivider: /^Part\s/i.test(currentLabel),
    });
  }
  return chunks;
}

async function callExtraction(
  tool: ToolSchema,
  userContent: string
): Promise<any[]> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    // Cache the system prompt — same across every call in the run
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } } as any],
    // Cache the tool schema — same for all 18 calls within a single catalog (5-min TTL)
    tools: [{ ...tool, cache_control: { type: 'ephemeral' } } as any],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: userContent }],
  });

  const toolUse = response.content.find((b: any) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    console.error('  No tool_use in response:', JSON.stringify(response.content).slice(0, 300));
    return [];
  }
  const input = toolUse.input as { entries?: any[] };
  return Array.isArray(input.entries) ? input.entries : [];
}

async function extractChapter(
  catalog: Catalog,
  chunk: { chapterLabel: string; text: string }
): Promise<any[]> {
  const cachePath = join(CACHE_DIR, catalog, `${slugify(chunk.chapterLabel)}.json`);

  // Restart-safety: if cached, skip the API call
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  }

  const userContent = `CHAPTER: ${chunk.chapterLabel}

CONTENT:
${chunk.text}

Extract every entry from this chapter that fits the tool schema. If no entries fit, call the tool with entries: [].`;

  const entries = await callExtraction(TOOLS[catalog], userContent);

  mkdirSync(join(CACHE_DIR, catalog), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(entries, null, 2));
  return entries;
}

async function processConcurrent<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function next(): Promise<void> {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

async function extractCatalog(
  catalog: Catalog,
  chunks: { chapterLabel: string; text: string; isPartDivider: boolean }[]
): Promise<any[]> {
  console.log(`\n=== Extracting ${catalog} ===`);

  const eligible = chunks.filter(c => !(SKIP_PART_DIVIDERS.has(catalog) && c.isPartDivider));
  console.log(`  ${eligible.length} chapters to process (concurrency=${CONCURRENCY})`);

  let done = 0;
  const perChapter = await processConcurrent(eligible, CONCURRENCY, async (chunk) => {
    const entries = await extractChapter(catalog, chunk);
    done++;
    process.stdout.write(`  [${done}/${eligible.length}] ${chunk.chapterLabel}: +${entries.length}\n`);
    return entries;
  });

  // Flatten + dedupe by ID/term
  const all: any[] = [];
  const seen = new Set<string>();
  for (const arr of perChapter) {
    for (const e of arr) {
      const key = e.id ?? e.term ?? `${e.number ?? ''}-${e.name ?? ''}` as string;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(e);
      }
    }
  }
  console.log(`  Total ${catalog}: ${all.length}`);
  return all;
}

// Special case: Ostrom's 8 principles live almost entirely in Ch. 2 (with Ch. 1 setup).
// One targeted call against those two chapters is faster, cheaper, and more reliable
// than running the 18-chapter loop and de-duping.
async function extractOstromTargeted(chunks: { chapterLabel: string; text: string }[]): Promise<any[]> {
  console.log(`\n=== Extracting ostrom (targeted: Ch. 1 + Ch. 2) ===`);
  const cachePath = join(CACHE_DIR, 'ostrom', 'targeted.json');
  if (existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
    console.log(`  cache hit (${cached.length} principles)`);
    return cached;
  }

  const ch1 = chunks.find(c => /rediscovery of the commons/i.test(c.chapterLabel));
  const ch2 = chunks.find(c => /tragedy/i.test(c.chapterLabel));
  const combinedText = [ch1?.text ?? '', ch2?.text ?? ''].join('\n\n---\n\n');

  const userContent = `CHAPTERS: Ch. 1 (The Rediscovery of the Commons) and Ch. 2 (The Tyranny of the "Tragedy" Myth)

CONTENT:
${combinedText}

Extract Elinor Ostrom's 8 design principles for durable commons (introduced in Ch. 2). There are exactly 8. For each principle: include 3-5 diagnostic questions an MCP user could answer to assess whether their commons embodies it, plus 2-4 example_commons_ids drawn from this book (use kebab-case IDs you'd assign — e.g., "erakulapally-seed-sharing", "wolfpak-surfers", "torbel-alpine-commons", "huerta-irrigation-spain", "linux-kernel-development").`;

  const entries = await callExtraction(TOOLS.ostrom, userContent);
  mkdirSync(join(CACHE_DIR, 'ostrom'), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(entries, null, 2));
  console.log(`  ${entries.length} principles extracted (expected 8)`);
  return entries;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('FATAL: ANTHROPIC_API_KEY not set. Add it to .env or export it.');
    process.exit(1);
  }
  console.log(`Source: ${SOURCE}`);
  console.log(`Cache:  ${CACHE_DIR} (delete to force re-extraction)`);

  const source = readFileSync(SOURCE, 'utf-8');
  const chunks = chapterChunks(source);
  console.log(`Chunked source into ${chunks.length} chapters`);
  console.log(`Part dividers: ${chunks.filter(c => c.isPartDivider).map(c => c.chapterLabel).join(', ')}`);

  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  const t0 = Date.now();

  // Run catalogs sequentially — within each catalog, chapters run 4-way concurrent.
  // (Sequential across catalogs keeps the cache breakpoints clean and predictable.)
  const heavyCatalogs: Catalog[] = ['commons', 'enclosures', 'strategies', 'glossary', 'quotes'];
  const results: Record<Catalog, any[]> = {} as any;

  for (const cat of heavyCatalogs) {
    results[cat] = await extractCatalog(cat, chunks);
  }
  results.ostrom = await extractOstromTargeted(chunks);

  // Write data files
  for (const cat of ['commons', 'enclosures', 'strategies', 'ostrom', 'glossary', 'quotes'] as Catalog[]) {
    const filePath = join(DATA_DIR, `${cat}.ts`);
    writeFileSync(filePath, FILE_HEADERS[cat] + JSON.stringify(results[cat], null, 2) + ';\n');
    console.log(`Wrote ${filePath} (${results[cat].length} entries)`);
  }

  // Write data/index.ts re-exports
  const indexContent = `export { COMMONS } from './commons.js';
export { ENCLOSURES } from './enclosures.js';
export { STRATEGIES } from './strategies.js';
export { OSTROM_PRINCIPLES } from './ostrom.js';
export { GLOSSARY } from './glossary.js';
export { QUOTES } from './quotes.js';
`;
  writeFileSync(join(DATA_DIR, 'index.ts'), indexContent);
  console.log(`Wrote ${join(DATA_DIR, 'index.ts')}`);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${dt}s`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
