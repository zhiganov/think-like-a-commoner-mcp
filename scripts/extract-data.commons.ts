// =============================================================================
// extract-data.commons.ts
// -----------------------------------------------------------------------------
// Commons-domain config + reference instance for the extraction pipeline.
// Pairs with extract-core.ts (which contains the book-agnostic infrastructure).
//
// This file is reusable across any commons-themed book (Bollier's *Think Like
// a Commoner*, Bauwens & Kostakis on P2P commons, Helfrich's *Patterns of
// Commoning*, etc.) — they share the same Catalog set (commons / enclosures /
// strategies / ostrom / glossary / quotes), the same DOMAINS enum, and a
// substantially similar SYSTEM_PROMPT structure.
//
// To use this for a commons-themed book MCP:
//   1. Copy this file to book-power-output/mcp/<name>/scripts/extract-data.commons.ts
//      (also copy extract-core.ts as scripts/extract-core.ts).
//   2. Customize per-book bits:
//      - SOURCE: path to your book's source markdown
//      - SYSTEM_PROMPT: replace the *Think Like a Commoner* references with
//        your book/author/edition; keep the structural sections intact
//        (extraction discipline, modal markers, anti-pattern surfacing,
//        domain enum, inclusion criteria, target sizes, kind discriminator,
//        output rules)
//      - extractTargetedFixedCardinality: replace the Ostrom-targeted call
//        with your book's equivalent (or drop it if no fixed-cardinality
//        catalog exists)
//   3. Update package.json's "extract" script to point at this file.
//
// For non-commons domains (JTBD, governance, technical, etc.), copy this file
// as a structural starting point but expect to rewrite Catalog / TOOLS /
// FILE_HEADERS entirely — they encode commons taxonomy.
//
// Reference instance: book-power-output/mcp/think-like-a-commoner/scripts/extract-data.commons.ts
// =============================================================================

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type ToolSchema,
  type ExtractConfig,
  entriesArray,
  chapterChunks,
  callTool,
  extractCatalog,
  dedupCatalog,
} from './extract-core.js';

// === BOOK-SPECIFIC CONFIG ===
// Adjust these for each commons book.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT, 'books', 'think-like-a-commoner.md'); // CUSTOMIZE: per-book source path
const DATA_DIR = join(ROOT, 'src', 'data');
const CACHE_DIR = join(ROOT, '.extraction-cache');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = 'claude-sonnet-4-6';

// === COMMONS-DOMAIN CONFIG ===
// Reusable across any commons-themed book.

type Catalog =
  | 'commons' | 'enclosures' | 'strategies'
  | 'ostrom' | 'glossary' | 'quotes';

// Care-wealth domains common to commons-shaped books. If your book emphasizes
// a different axis (e.g., explicitly cultural commons only, or specific
// industries), adjust this enum.
const DOMAINS = [
  'land', 'water', 'food/seed', 'knowledge/digital',
  'social/mutual_aid', 'urban', 'money/finance',
  'labor', 'energy', 'cultural',
] as const;

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

INCLUSION CRITERIA (decide what's worth a distinct entry)

- **Commons:** a *named, distinct* commons (or candidate commons) — must have community + care-wealth + protocols. Do NOT extract: generic patterns described abstractly without a community ("the principle of stewardship"); sub-aspects of a commons that share community + care-wealth + protocols with their parent (do NOT split CSA farms by region; do NOT create separate "X as relationalized property" + "X as relationalized finance" entries for the same X); conceptual moves Bollier describes (those go in glossary, not commons).
- **Enclosures:** a *recognized pattern* of how shared wealth gets captured. Do NOT extract specific instances when the pattern they exemplify is already in the catalog — one entry per pattern, not per instance. The "market/state duopoly" framing is ONE pattern, not five.
- **Strategies:** a *named commoning move* with a clear practitioner action. Do NOT extract defensive applications of one strategy across many domains as separate strategies — "defend net neutrality", "defend academic commons", "defend cultural commons" are all the same strategy (defensive litigation/advocacy), one entry. Same for "vernacular law as informal governance" / "as living commons law" / "as legal hacks" — one entry.
- **Glossary:** a *Bollier-coined or Bollier-emphasized* term, named explicitly in the book as a defined concept. Do NOT extract standard English nouns or phrases that aren't actual technical vocabulary.
- **Quotes:** a *strong, citation-worthy passage* on a distinct theme. Do NOT extract more than 3-5 quotes per chapter; aim for thematic coverage, not exhaustive.

TARGET SIZES (across the whole book — soft hints, not caps)

- commons: ~50 distinct cases
- enclosures: ~15 distinct patterns
- strategies: ~10 distinct moves
- ostrom: exactly 8 (Bollier explicitly enumerates them in Ch. 2)
- glossary: ~30-40 distinct terms
- quotes: ~30-60 distinct passages

If you find yourself extracting much more than these targets in a single chapter, you are likely splitting one concept across multiple slugs. Re-evaluate before emitting.

ENTRY KIND DISCRIMINATOR (commons catalog only)

Each commons entry MUST include a \`kind\` field:
- "commons" — exemplary cases to learn from (Wikipedia, Spanish huerta, makerspaces, Erakulapally seed-sharing). The default if Bollier holds the entry up positively.
- "enclosure" — a specific historical or contemporary enclosure event/case Bollier documents in the commons context (Microsoft OS, MLK estate copyright, Bayh-Dole, English Enclosure Movement). Use for entries that name a *specific* captured-commons rather than the *pattern* of capture (the latter belongs in the enclosures catalog).
- "anti-pattern" — broader cautionary concepts/framings (commons-washing, homo economicus, tragedy myth, financialization-of-nature). Use for conceptual warnings rather than specific events.

If you're tagging something as "enclosure" or "anti-pattern" in the commons catalog, ALSO consider whether it belongs in the enclosures catalog instead. Most enclosure-kind entries in commons.ts are there because Bollier specifically frames them as "captured commons" — keep that framing.

OUTPUT
You must call the provided tool with structured arguments. Do not narrate, do not output prose. If a chapter has no entries that fit the schema, call the tool with an empty array.`;

const TOOLS: Record<Catalog, ToolSchema> = {
  commons: {
    name: 'save_commons',
    description: 'Save extracted commons cases (Bollier examples of community + care-wealth + protocols).',
    input_schema: entriesArray({
      type: 'object',
      properties: {
        id: { type: 'string', description: 'kebab-case stable ID' },
        name: { type: 'string' },
        kind: { type: 'string', enum: ['commons', 'enclosure', 'anti-pattern'], description: 'Discriminator per the ENTRY KIND section of the system prompt. "commons" = exemplary case; "enclosure" = specific captured-commons event; "anti-pattern" = cautionary concept/framing.' },
        domain: { type: 'string', enum: [...DOMAINS] },
        brief: { type: 'string', description: '1-2 sentence description' },
        community: { type: 'string', description: 'Who stewards it' },
        care_wealth: { type: 'string', description: 'What is stewarded' },
        protocols: { type: 'array', items: { type: 'string' }, description: '2-5 social rules / norms / practices, with MUST/SHOULD where Bollier is prescriptive' },
        source_chapter: { type: 'string' },
        source_quote: { type: 'string', description: 'Optional verbatim grounding passage, ≤200 words' },
      },
      required: ['id', 'name', 'kind', 'domain', 'brief', 'community', 'care_wealth', 'protocols', 'source_chapter'],
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

const SKIP_PART_DIVIDERS: Set<Catalog> = new Set(['commons', 'enclosures', 'strategies']);
const DEDUP_CATALOGS: Set<Catalog> = new Set(['commons', 'enclosures', 'strategies', 'glossary', 'quotes']);

const config: ExtractConfig<Catalog> = {
  client,
  model: MODEL,
  systemPrompt: SYSTEM_PROMPT,
  cacheDir: CACHE_DIR,
  tools: TOOLS,
  skipPartDividers: SKIP_PART_DIVIDERS,
  dedupCatalogs: DEDUP_CATALOGS,
};

// === BOOK-SPECIFIC TARGETED EXTRACTION ===
// Ostrom's 8 principles live almost entirely in Bollier's Ch. 2 (with Ch. 1
// setup). One targeted call against those two chapters is faster, cheaper,
// and more reliable than running the 18-chapter loop and de-duping.
// For a different book without an equivalent fixed-cardinality catalog,
// drop this function entirely.
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
  if (!ch1 || !ch2) {
    throw new Error(`Ostrom targeted extraction needs Ch.1 + Ch.2; matched: ch1=${!!ch1} ch2=${!!ch2}. Available labels: ${chunks.map(c => c.chapterLabel).join(' | ')}`);
  }
  const combinedText = [ch1.text, ch2.text].join('\n\n---\n\n');

  const userContent = `CHAPTERS: Ch. 1 (The Rediscovery of the Commons) and Ch. 2 (The Tyranny of the "Tragedy" Myth)

CONTENT:
${combinedText}

Extract Elinor Ostrom's 8 design principles for durable commons (introduced in Ch. 2). There are exactly 8. For each principle: include 3-5 diagnostic questions an MCP user could answer to assess whether their commons embodies it, plus 2-4 example_commons_ids drawn from this book (use kebab-case IDs you'd assign — e.g., "erakulapally-seed-sharing", "wolfpak-surfers", "torbel-alpine-commons", "huerta-irrigation-spain", "linux-kernel-development").`;

  const result = await callTool(config, TOOLS.ostrom, userContent);
  const entries = Array.isArray(result?.entries) ? result.entries : [];
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

  const heavyCatalogs: Catalog[] = ['commons', 'enclosures', 'strategies', 'glossary', 'quotes'];
  const results: Record<Catalog, any[]> = {} as any;

  for (const cat of heavyCatalogs) {
    results[cat] = await extractCatalog(config, cat, chunks);
    if (DEDUP_CATALOGS.has(cat)) {
      results[cat] = await dedupCatalog(config, cat, results[cat]);
    }
  }
  results.ostrom = await extractOstromTargeted(chunks);

  for (const cat of ['commons', 'enclosures', 'strategies', 'ostrom', 'glossary', 'quotes'] as Catalog[]) {
    const filePath = join(DATA_DIR, `${cat}.ts`);
    writeFileSync(filePath, FILE_HEADERS[cat] + JSON.stringify(results[cat], null, 2) + ';\n');
    console.log(`Wrote ${filePath} (${results[cat].length} entries)`);
  }

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
