// scripts/extract-data.ts
//
// Synced from book-power/templates/mcp-server-handcrafted/extract-data.template.ts
// (canonical source per book-power/CLAUDE.md "Preferred extraction approach").
//
// When updating the structural sections (per-chapter sequential extraction with
// ids_so_far passthrough, post-extraction semantic dedup pass, prompt caching,
// cache machinery), update the template FIRST and re-sync this file from there.
// Book-specific bits (SOURCE path, DOMAINS enum, TOOLS map, system prompt
// content, Ostrom-targeted extraction) are unique to this MCP and do not
// propagate back to the template.
//
// Last sync from template: 2026-05-04 (book-power#22 / TLAC#7).

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT, 'books', 'think-like-a-commoner.md');
const DATA_DIR = join(ROOT, 'src', 'data');
const CACHE_DIR = join(ROOT, '.extraction-cache');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = 'claude-sonnet-4-6';

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
  chunk: { chapterLabel: string; text: string },
  idsSoFar: string[]
): Promise<any[]> {
  const cachePath = join(CACHE_DIR, catalog, `${slugify(chunk.chapterLabel)}.json`);

  // Restart-safety: if cached, skip the API call
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  }

  const idsContext = idsSoFar.length > 0
    ? `

ALREADY EXTRACTED FROM PRIOR CHAPTERS (DO NOT RE-EMIT THESE IDs):
${idsSoFar.join(', ')}

If this chapter expands on one of those concepts, leave its slug alone — the dedup pass will fold any new context in. Do NOT invent a new slug ("foo-as-relationalized-finance", "foo-north-america") for the same concept under a slightly different framing.`
    : '';

  const userContent = `CHAPTER: ${chunk.chapterLabel}

CONTENT:
${chunk.text}

Extract every entry from this chapter that fits the tool schema. If no entries fit, call the tool with entries: [].${idsContext}`;

  const entries = await callExtraction(TOOLS[catalog], userContent);

  mkdirSync(join(CACHE_DIR, catalog), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(entries, null, 2));
  return entries;
}

// Per-catalog extraction is sequential (not concurrent) so each chapter call
// can see the ids extracted from earlier chapters and avoid coining a new slug
// for an already-named concept. This is the load-bearing fix from book-power#22:
// without ids_so_far passthrough, the model independently re-coins slugs across
// chapters and the post-pass dedup has to clean up. Sequential is ~4x slower
// wall time but the system prompt + tool schema stay cached so cost is unchanged.
async function extractCatalog(
  catalog: Catalog,
  chunks: { chapterLabel: string; text: string; isPartDivider: boolean }[]
): Promise<any[]> {
  console.log(`\n=== Extracting ${catalog} ===`);

  const eligible = chunks.filter(c => !(SKIP_PART_DIVIDERS.has(catalog) && c.isPartDivider));
  console.log(`  ${eligible.length} chapters to process (sequential — ids_so_far passed forward)`);

  const idsSoFar: string[] = [];
  const all: any[] = [];

  for (let i = 0; i < eligible.length; i++) {
    const chunk = eligible[i];
    const entries = await extractChapter(catalog, chunk, idsSoFar);
    process.stdout.write(`  [${i + 1}/${eligible.length}] ${chunk.chapterLabel}: +${entries.length}\n`);

    // Track ids; string-equal dedup happens here too in case the model still
    // emits the same id twice across chapters despite ids_so_far guidance.
    for (const e of entries) {
      const key = e.id ?? e.term ?? `${e.number ?? ''}-${e.name ?? ''}` as string;
      if (!idsSoFar.includes(key)) {
        idsSoFar.push(key);
        all.push(e);
      }
    }
  }
  console.log(`  Total ${catalog}: ${all.length} (after string-equal dedup)`);
  return all;
}

// Catalogs eligible for the post-extraction semantic dedup pass. Excluded:
// - ostrom: fixed cardinality (8 principles), targeted extraction handles dedup natively
const DEDUP_CATALOGS: Set<Catalog> = new Set(['commons', 'enclosures', 'strategies', 'glossary', 'quotes']);

const DEDUP_TOOL: ToolSchema = {
  name: 'propose_merges',
  description: 'Propose semantic dedup merges for the catalog. Each merge picks one canonical id (keep) and lists the others to fold into it (drop).',
  input_schema: {
    type: 'object',
    properties: {
      merges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            keep: { type: 'string', description: 'The canonical id to keep' },
            drop: { type: 'array', items: { type: 'string' }, description: 'Slugs to fold into keep — same concept under different framings/regions/sub-aspects' },
            reason: { type: 'string', description: 'One sentence: what concept these all describe' },
          },
          required: ['keep', 'drop', 'reason'],
        },
      },
    },
    required: ['merges'],
  },
};

// Post-extraction semantic dedup pass: given the full catalog, ask Sonnet to
// surface groups of semantic duplicates that survived the per-chapter
// ids_so_far passthrough. Apply by unioning protocols (where applicable) and
// dropping the merged-out entries.
async function dedupCatalog(catalog: Catalog, entries: any[]): Promise<any[]> {
  if (entries.length < 10) {
    console.log(`  [dedup] ${catalog}: ${entries.length} entries, skipping (too few)`);
    return entries;
  }

  console.log(`\n=== Deduping ${catalog} (${entries.length} entries) ===`);

  const cachePath = join(CACHE_DIR, catalog, '_dedup.json');
  let merges: Array<{ keep: string; drop: string[]; reason: string }>;

  if (existsSync(cachePath)) {
    merges = JSON.parse(readFileSync(cachePath, 'utf-8'));
    console.log(`  cache hit (${merges.length} merges proposed)`);
  } else {
    const summaries = entries.map(e => {
      const id = e.id ?? e.term ?? `${e.number ?? ''}-${e.name ?? ''}`;
      const blurb = (e.brief ?? e.description ?? e.definition ?? e.text ?? e.signature ?? '').slice(0, 140).replace(/\s+/g, ' ');
      return `${id} | ${e.name ?? e.term ?? id} | ${blurb}`;
    }).join('\n');

    const userContent = `Below is a flat list of all "${catalog}" entries extracted from David Bollier's *Think Like a Commoner* (2nd ed.), one per line: id | name | brief.

Identify groups of semantically duplicate entries — same concept under different slugs, framings, regions, or sub-aspects. For each group:
- Pick the cleanest/canonical id as the primary ("keep")
- List the other ids to merge into it ("drop")
- One-sentence reason naming what concept the group all describe

ONLY merge entries that genuinely describe the same concept. Common examples to merge:
- Same case under different names ("wikipedia-knowledge-commons" + "wikipedia-digital-knowledge-commons")
- Same concept under different framings ("X-as-relationalized-property" + "X" + "X-as-relationalized-finance")
- Sub-aspect entries that overlap fully with a parent entry
- "(Concept)" + "(Framework)" pairs

DO NOT merge entries that describe distinct cases, even if they share a name pattern:
- Different geographic instances of the same model (Bangla-Pesa vs BerkShares are both local currencies but distinct cases — keep both)
- Different sub-spheres Bollier deliberately distinguishes (Triad of Commoning's three spheres are intentional, not duplicates)

If no duplicates are present, return an empty merges array. Don't force merges to look productive.

Entries:
${summaries}`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } } as any],
      tools: [{ ...DEDUP_TOOL, cache_control: { type: 'ephemeral' } } as any],
      tool_choice: { type: 'tool', name: DEDUP_TOOL.name },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolUse = response.content.find((b: any) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      console.warn(`  [dedup] ${catalog}: no tool_use in response, skipping`);
      return entries;
    }
    merges = (toolUse.input as { merges?: any[] }).merges ?? [];

    mkdirSync(join(CACHE_DIR, catalog), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(merges, null, 2));
  }

  if (merges.length === 0) {
    console.log(`  no merges proposed`);
    return entries;
  }

  // Apply: union protocols (where applicable), drop merged entries
  const dropSet = new Set<string>();
  const protoUnions = new Map<string, string[]>();

  const idOf = (e: any): string => e.id ?? e.term ?? `${e.number ?? ''}-${e.name ?? ''}`;
  const byId = new Map<string, any>(entries.map(e => [idOf(e), e]));

  for (const m of merges) {
    const kept = byId.get(m.keep);
    if (!kept) {
      console.warn(`  WARNING: keep "${m.keep}" not in catalog — skipping`);
      continue;
    }

    if (Array.isArray(kept.protocols)) {
      const union = [...kept.protocols];
      const seen = new Set(union);
      for (const dropId of m.drop) {
        const dropped = byId.get(dropId);
        if (!dropped) continue;
        for (const p of (dropped.protocols ?? [])) {
          if (!seen.has(p)) {
            union.push(p);
            seen.add(p);
          }
        }
      }
      if (union.length > kept.protocols.length) {
        protoUnions.set(m.keep, union);
      }
    }

    for (const dropId of m.drop) {
      if (byId.has(dropId)) dropSet.add(dropId);
    }
    console.log(`  merge: ${m.keep} ← ${m.drop.join(', ')}`);
  }

  const final = entries
    .filter(e => !dropSet.has(idOf(e)))
    .map(e => protoUnions.has(idOf(e)) ? { ...e, protocols: protoUnions.get(idOf(e)) } : e);

  console.log(`  After dedup: ${final.length} (was ${entries.length}, -${entries.length - final.length})`);
  return final;
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
  if (!ch1 || !ch2) {
    throw new Error(`Ostrom targeted extraction needs Ch.1 + Ch.2; matched: ch1=${!!ch1} ch2=${!!ch2}. Available labels: ${chunks.map(c => c.chapterLabel).join(' | ')}`);
  }
  const combinedText = [ch1.text, ch2.text].join('\n\n---\n\n');

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
    if (DEDUP_CATALOGS.has(cat)) {
      results[cat] = await dedupCatalog(cat, results[cat]);
    }
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
