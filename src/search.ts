import type { SearchResult } from './types.js';
import {
  COMMONS, ENCLOSURES, STRATEGIES,
  OSTROM_PRINCIPLES, GLOSSARY, QUOTES,
} from './data/index.js';

export function searchAll(query: string, maxResults: number = 10): SearchResult[] {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const c of COMMONS) {
    const searchable = `${c.name} ${c.brief} ${c.community} ${c.care_wealth} ${c.protocols.join(' ')}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({ type: 'commons', id: c.id, name: c.name, excerpt: c.brief });
    }
  }

  for (const e of ENCLOSURES) {
    const searchable = `${e.name} ${e.signature} ${e.example}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({ type: 'enclosure', id: e.id, name: e.name, excerpt: e.signature });
    }
  }

  for (const s of STRATEGIES) {
    const searchable = `${s.name} ${s.description}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({ type: 'strategy', id: s.id, name: s.name, excerpt: s.description });
    }
  }

  for (const p of OSTROM_PRINCIPLES) {
    const searchable = `${p.name} ${p.description} ${p.diagnostic_questions.join(' ')}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({ type: 'ostrom', id: `ostrom-${p.number}`, name: `Principle ${p.number}: ${p.name}`, excerpt: p.description });
    }
  }

  for (const g of GLOSSARY) {
    const searchable = `${g.term} ${g.definition} ${g.see_also.join(' ')}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({ type: 'glossary', id: g.term.toLowerCase().replace(/\s+/g, '-'), name: g.term, excerpt: g.definition });
    }
  }

  for (const qt of QUOTES) {
    const searchable = `${qt.text} ${qt.themes.join(' ')}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({ type: 'quote', id: qt.id, name: qt.themes.slice(0, 2).join(', '), excerpt: qt.text.slice(0, 200) });
    }
  }

  return results.slice(0, maxResults);
}
