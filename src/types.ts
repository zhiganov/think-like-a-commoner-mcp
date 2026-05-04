export type Domain =
  | "land"
  | "water"
  | "food/seed"
  | "knowledge/digital"
  | "social/mutual_aid"
  | "urban"
  | "money/finance"
  | "labor"
  | "energy"
  | "cultural";

export const DOMAINS: Domain[] = [
  "land", "water", "food/seed", "knowledge/digital",
  "social/mutual_aid", "urban", "money/finance",
  "labor", "energy", "cultural",
];

export interface Commons {
  id: string;
  name: string;
  domain: Domain;
  brief: string;            // 1-2 sentence description
  community: string;        // who stewards
  care_wealth: string;      // what is stewarded
  protocols: string[];      // social rules / norms / practices
  source_chapter: string;   // e.g., "Ch. 1"
  source_quote?: string;    // optional grounding passage
  // Heavy upgrade only (#16): ostrom_principles_present?: number[];
}

// Catalog convention: anti-pattern entries are tagged via id suffix.
// `-anti-pattern` / `-antipattern` are explicit cautionary entries.
// `-anticommons` covers Heller-style "tragedy of the anti-commons" cases.
// Bollier surfaces these as warnings, not exemplars — exclude them from
// precedent / similar-commons surfaces, but keep them in the underlying catalog
// (search.ts and protocol mining still benefit from their MUST NOT rules).
export function isAntiPattern(c: Commons): boolean {
  return /-anti-?pattern$|-anticommons$/.test(c.id);
}

export interface Enclosure {
  id: string;
  name: string;
  signature: string;                                      // recognition heuristics
  example: string;                                        // canonical case from book
  domain_examples: Partial<Record<Domain, string[]>>;
  response_strategy_ids: string[];
  source_chapter: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  problem_enclosure_ids: string[];
  example_commons_ids: string[];
  source_chapter: string;
}

export interface OstromPrinciple {
  number: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  name: string;
  description: string;
  diagnostic_questions: string[];
  example_commons_ids: string[];
}

export interface GlossaryTerm {
  term: string;
  definition: string;
  see_also: string[];
  source_quote?: string;
  source_chapter?: string;
}

export interface Quote {
  id: string;
  text: string;
  themes: string[];          // e.g., ["enclosure", "financialization"]
  source_chapter: string;
  source_attribution: string; // "Bollier, Think Like a Commoner 2nd ed. (2024), Ch. X"
}

export type SearchResultType =
  | "commons" | "enclosure" | "strategy"
  | "ostrom" | "glossary" | "quote";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  name: string;
  excerpt: string;
}
