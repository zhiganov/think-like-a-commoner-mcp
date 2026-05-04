#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { searchAll } from './search.js';
import {
  COMMONS, ENCLOSURES, STRATEGIES,
  OSTROM_PRINCIPLES, GLOSSARY, QUOTES,
} from './data/index.js';
import { isCommons } from './types.js';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'think-like-a-commoner',
    version: '0.1.0',
  });

  // === ROUTING TOOLS (2) ===

  server.registerTool('start_analysis', {
    title: 'Start TLAC Analysis',
    description: 'Branching entry-point. Pick a situation type to get a scaffold of key questions plus recommended next tools, all grounded in Bollier\'s Think Like a Commoner.',
    inputSchema: {
      situation: z.enum([
        'threatened_commons',
        'designing_commons',
        'naming_enclosure',
        'exploring',
      ]).describe('The kind of analysis you need to run.'),
    },
  }, async ({ situation }) => {
    const scaffolds: Record<string, { questions: string[]; next_tools: string[]; framing: string }> = {
      threatened_commons: {
        framing: 'A commons (or candidate commons) is under threat. Goal: name what is happening, find precedent, propose responses.',
        questions: [
          'What resource or care-wealth is at risk?',
          'Who is the community of stewards (if any) and what protocols do they have?',
          'Who or what is encroaching, and how (state-assisted? financialization? data extraction?)?',
          'What domain is this (land, water, food/seed, knowledge/digital, social, urban, money/finance, labor, energy, cultural)?',
        ],
        next_tools: ['classify_situation', 'find_enclosure_pattern', 'find_precedent_commons', 'list_response_strategies'],
      },
      designing_commons: {
        framing: 'You want to build or strengthen a commons. Goal: assess against design principles, find similar commons, design protocols.',
        questions: [
          'What care-wealth do you steward (or want to)?',
          'Who is the community? What is the boundary between members and outsiders?',
          'What domain (land, water, food/seed, knowledge/digital, etc.)?',
          'What scale (village, regional, networked-digital, etc.)?',
          'What protocols do you have already and where do you sense gaps?',
        ],
        next_tools: ['find_similar_commons', 'assess_ostrom_principles', 'suggest_commoning_protocols'],
      },
      naming_enclosure: {
        framing: 'Something is being privatized, financialized, or captured. Goal: name the enclosure pattern with Bollier\'s framing for downstream advocacy or writing.',
        questions: [
          'What was previously shared, customary, or freely accessible?',
          'Who is making the appropriation? (corporation, state, finance, platform)',
          'How is it being justified? (progress, efficiency, conservation, security)',
          'What is being lost beyond the resource itself? (memory, social fabric, sovereignty)',
        ],
        next_tools: ['classify_situation', 'find_enclosure_pattern', 'apply_ontoshift', 'find_quote'],
      },
      exploring: {
        framing: 'You want to learn or browse Bollier\'s framing without a specific case in mind.',
        questions: [
          'A theme you want to explore? (e.g., "tragedy of the commons", "OntoShift", "vernacular law")',
          'A domain to anchor in? (e.g., digital, land, water)',
          'A specific concept to define?',
        ],
        next_tools: ['get_glossary_term', 'find_quote', 'apply_ontoshift', 'find_similar_commons'],
      },
    };

    const scaffold = scaffolds[situation];
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(scaffold, null, 2) }],
    };
  });

  server.registerTool('suggest_next_step', {
    title: 'Suggest Next Tool',
    description: 'Given a brief context summary and which tools have already been called, suggest the next tool with rationale.',
    inputSchema: {
      context_summary: z.string().describe('1-3 sentences describing the user\'s situation and what has been gathered so far.'),
      tools_used_so_far: z.array(z.string()).optional().describe('Tool names already called.'),
    },
  }, async ({ context_summary, tools_used_so_far }) => {
    const ctx = context_summary.toLowerCase();
    const used = new Set(tools_used_so_far ?? []);

    type Suggestion = { tool: string; rationale: string };
    const candidates: Suggestion[] = [];

    // Heuristics: prefer tools that haven't been called.
    if (!used.has('classify_situation') && /(threat|encroach|privati|enclos|grab)/.test(ctx)) {
      candidates.push({ tool: 'classify_situation', rationale: 'Ground the situation: is this a commons, enclosure, open-access, or market/state capture?' });
    }
    if (!used.has('find_enclosure_pattern') && /(financiali|data extract|land grab|commodif|monetiz)/.test(ctx)) {
      candidates.push({ tool: 'find_enclosure_pattern', rationale: 'Match the dynamics to a named enclosure pattern with example.' });
    }
    if (!used.has('assess_ostrom_principles') && /(govern|rules|monitor|sanction|boundary|membership)/.test(ctx)) {
      candidates.push({ tool: 'assess_ostrom_principles', rationale: 'Walk through Ostrom\'s 8 design principles to find gaps.' });
    }
    if (!used.has('find_similar_commons') && /(community|steward|share|protocol|coop|trust)/.test(ctx)) {
      candidates.push({ tool: 'find_similar_commons', rationale: 'Surface analogous commons to learn protocols from.' });
    }
    if (!used.has('apply_ontoshift') && /(market|individual|rational|tragedy|economic)/.test(ctx)) {
      candidates.push({ tool: 'apply_ontoshift', rationale: 'Reframe the market/state-mind framing into a commoning-mind one.' });
    }
    if (!used.has('list_response_strategies') && (used.has('find_enclosure_pattern') || used.has('classify_situation'))) {
      candidates.push({ tool: 'list_response_strategies', rationale: 'You have a diagnosis — surface the strategies that counter it.' });
    }
    if (!used.has('find_quote')) {
      candidates.push({ tool: 'find_quote', rationale: 'Pull a grounding Bollier passage for citation or framing.' });
    }
    if (!used.has('get_glossary_term')) {
      candidates.push({ tool: 'get_glossary_term', rationale: 'Look up a specific Bollier term (commoning, OntoShift, vernacular law, etc.).' });
    }

    const top = candidates[0] ?? { tool: 'start_analysis', rationale: 'No clear signal — restart with start_analysis to pick a branch.' };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ suggested: top, alternatives: candidates.slice(1, 4) }, null, 2) }],
    };
  });

  // === DIAGNOSTIC TOOLS (4) ===

  server.registerTool('classify_situation', {
    title: 'Classify a situation against Bollier\'s framing',
    description: 'Given a description of a situation, classify it as commons / enclosure / open_access / market_state_capture and explain the reasoning. Heuristic, not a definitive judgment — see Bollier Ch. 2 on Hardin\'s confusion of open access with commons.',
    inputSchema: {
      description: z.string().describe('1-3 paragraph description of the situation.'),
    },
  }, async ({ description }) => {
    const d = description.toLowerCase();
    let classification: 'commons' | 'enclosure' | 'open_access' | 'market_state_capture' = 'open_access';
    const reasons: string[] = [];

    const hasCommunity = /(community|stewards|members|cooperative|tribe|village|crew|guild|peer)/.test(d);
    const hasProtocols = /(rule|protocol|norm|sanction|boundary|membership|governance)/.test(d);
    const hasEnclosure = /(privatiz|financiali|land grab|enclos|commodif|monetiz|patent|copyright|enclose)/.test(d);
    const hasState = /(government|state|legislat|regulat)/.test(d);
    const hasMarket = /(corporat|investor|market|profit|capital)/.test(d);

    if (hasEnclosure && hasMarket && hasState) {
      classification = 'market_state_capture';
      reasons.push('State authority and market actors are jointly converting shared wealth into private property — Bollier\'s "market/state duopoly" pattern (Ch. 2, Ch. 4).');
    } else if (hasEnclosure) {
      classification = 'enclosure';
      reasons.push('Conversion of shared / customary wealth into private property is described — see Ch. 3 (enclosures of nature) and Ch. 4 (cultural / digital enclosure).');
    } else if (hasCommunity && hasProtocols) {
      classification = 'commons';
      reasons.push('Community + care-wealth + social protocols all present — Bollier\'s "commons = community + defined body of shared wealth + set of social protocols" (Ch. 1).');
    } else if (hasCommunity || hasProtocols) {
      classification = 'open_access';
      reasons.push('Either community or protocols are missing. This is the open-access regime Hardin mistook for a commons (Ch. 2). A genuine commons MUST have both.');
    } else {
      classification = 'open_access';
      reasons.push('No community, no protocols, no enclosure pattern detected — best read as open-access pending more information.');
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        classification,
        reasoning: reasons.join(' '),
        caveat: 'Heuristic match against Bollier\'s framing, not a definitive judgment. See Ch. 2: a commons MUST have boundaries, rules, social norms, and sanctions against free riders. Open-access is "no-man\'s-land".',
        next_tool_hint: classification === 'enclosure' || classification === 'market_state_capture'
          ? 'Try find_enclosure_pattern to match the specific dynamics, then list_response_strategies.'
          : classification === 'commons'
          ? 'Try assess_ostrom_principles to walk through governance, or find_similar_commons for protocol ideas.'
          : 'Try start_analysis with situation="exploring" to gather more detail.',
      }, null, 2) }],
    };
  });

  server.registerTool('find_enclosure_pattern', {
    title: 'Find Enclosure Patterns',
    description: 'Match a situation to one or more named enclosure patterns from Bollier\'s catalog. Returns up to 3 patterns with signatures and canonical examples.',
    inputSchema: {
      domain: z.string().optional().describe('Domain hint (land, water, food/seed, knowledge/digital, urban, money/finance, etc.)'),
      signs: z.array(z.string()).optional().describe('Observed signs / dynamics, free text.'),
    },
  }, async ({ domain, signs }) => {
    const signsBlob = (signs ?? []).join(' ').toLowerCase();
    const domainKey = (domain ?? '').toLowerCase();

    const scored = ENCLOSURES.map(e => {
      let score = 0;
      if (domainKey && e.domain_examples) {
        for (const dKey of Object.keys(e.domain_examples)) {
          if (dKey.toLowerCase().includes(domainKey) || domainKey.includes(dKey.toLowerCase())) score += 3;
        }
      }
      if (signsBlob) {
        const haystack = `${e.name} ${e.signature} ${e.example}`.toLowerCase();
        for (const word of signsBlob.split(/\s+/).filter(w => w.length > 3)) {
          if (haystack.includes(word)) score += 1;
        }
      }
      return { e, score };
    }).sort((a, b) => b.score - a.score);

    const top = scored.filter(s => s.score > 0).slice(0, 3).map(s => s.e);
    if (top.length === 0) {
      const list = ENCLOSURES.map(e => `  ${e.id} — ${e.name}`).join('\n');
      return { content: [{ type: 'text' as const, text: `No clear match. Available enclosure patterns:\n${list}` }] };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(top, null, 2) }] };
  });

  server.registerTool('find_precedent_commons', {
    title: 'Find Precedent Commons',
    description: 'Surface 3-5 commons cases from Bollier that resemble a situation, by domain and what is being stewarded.',
    inputSchema: {
      domain: z.string().describe('Domain (land, water, food/seed, knowledge/digital, etc.)'),
      scale: z.string().optional().describe('Scale hint: village, regional, networked-digital, planetary.'),
      what_stewarded: z.string().optional().describe('What the commons stewards (e.g., "fishing rights", "open-source code", "irrigation water").'),
    },
  }, async ({ domain, scale, what_stewarded }) => {
    const dKey = domain.toLowerCase();
    const candidates = COMMONS.filter(c =>
      isCommons(c) &&
      (c.domain.toLowerCase().includes(dKey) || dKey.includes(c.domain.toLowerCase()))
    );

    const scored = candidates.map(c => {
      let score = 1; // domain match
      if (what_stewarded) {
        const blob = `${c.brief} ${c.care_wealth}`.toLowerCase();
        for (const word of what_stewarded.toLowerCase().split(/\s+/).filter(w => w.length > 3)) {
          if (blob.includes(word)) score += 2;
        }
      }
      if (scale) {
        const blob = `${c.brief} ${c.community}`.toLowerCase();
        if (blob.includes(scale.toLowerCase())) score += 1;
      }
      return { c, score };
    }).sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 5).map(s => s.c);
    if (top.length === 0) {
      return { content: [{ type: 'text' as const, text: `No commons in domain "${domain}". Available domains: ${[...new Set(COMMONS.map(c => c.domain))].join(', ')}` }] };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(top, null, 2) }] };
  });

  server.registerTool('list_response_strategies', {
    title: 'List Response Strategies',
    description: 'Surface commoning strategies (parallel polis, federation, decommodification, vernacular law, etc.) that respond to a given enclosure or operate in a given domain.',
    inputSchema: {
      enclosure_id: z.string().optional().describe('Specific enclosure ID to find counters for.'),
      domain: z.string().optional().describe('Domain hint.'),
    },
  }, async ({ enclosure_id, domain }) => {
    let strategies = STRATEGIES;
    if (enclosure_id) {
      strategies = strategies.filter(s => s.problem_enclosure_ids.includes(enclosure_id));
      if (strategies.length === 0) {
        const ids = STRATEGIES.flatMap(s => s.problem_enclosure_ids);
        return { content: [{ type: 'text' as const, text: `No strategies tagged for "${enclosure_id}". Tagged enclosure IDs across all strategies: ${[...new Set(ids)].join(', ')}` }] };
      }
    }
    if (domain) {
      const dKey = domain.toLowerCase();
      strategies = strategies.filter(s => {
        const exampleCommons = s.example_commons_ids.map(id => COMMONS.find(c => c.id === id)).filter(Boolean);
        return exampleCommons.some(c => c!.domain.toLowerCase().includes(dKey));
      });
    }
    if (strategies.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No matching strategies. Use list_all (planned) or call without filters to see all.' }] };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(strategies, null, 2) }] };
  });

  // === DESIGN TOOLS (3) ===

  server.registerTool('assess_ostrom_principles', {
    title: 'Assess Against Ostrom\'s 8 Design Principles',
    description: 'Returns all 8 of Ostrom\'s design principles with diagnostic questions, formatted as a fillable rubric. The agent walks through the questions with the user.',
    inputSchema: {
      commons_description: z.string().optional().describe('Optional 1-3 paragraph description of the commons being assessed. If provided, surfaces examples that resemble it.'),
    },
  }, async ({ commons_description }) => {
    const examples_by_principle: Record<number, string[]> = {};
    for (const p of OSTROM_PRINCIPLES) {
      examples_by_principle[p.number] = p.example_commons_ids
        .map(id => COMMONS.find(c => c.id === id))
        .filter(Boolean)
        .map(c => `${c!.id} (${c!.name})`);
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        instructions: 'Walk through each of Ostrom\'s 8 design principles below with the user. For each, ask the diagnostic_questions and record whether the commons embodies, partially embodies, or lacks the principle. At the end, summarize gaps.',
        principles: OSTROM_PRINCIPLES.map(p => ({
          number: p.number,
          name: p.name,
          description: p.description,
          diagnostic_questions: p.diagnostic_questions,
          example_commons_in_book: examples_by_principle[p.number],
        })),
        commons_description_received: commons_description ?? '(none)',
      }, null, 2) }],
    };
  });

  server.registerTool('find_similar_commons', {
    title: 'Find Similar Commons (and Their Protocols)',
    description: 'Like find_precedent_commons but framed for design — returns commons in the same domain along with the protocols they use, to learn from.',
    inputSchema: {
      domain: z.string().describe('Domain (land, water, food/seed, knowledge/digital, social/mutual_aid, urban, money/finance, labor, energy, cultural).'),
      what_stewarded: z.string().describe('What the commons stewards.'),
      scale: z.string().optional().describe('Scale hint: village, regional, networked-digital, planetary.'),
    },
  }, async ({ domain, what_stewarded, scale }) => {
    const dKey = domain.toLowerCase();
    const wKey = what_stewarded.toLowerCase();
    const scored = COMMONS.filter(isCommons).map(c => {
      let score = 0;
      if (c.domain.toLowerCase().includes(dKey) || dKey.includes(c.domain.toLowerCase())) score += 3;
      const blob = `${c.brief} ${c.care_wealth}`.toLowerCase();
      for (const word of wKey.split(/\s+/).filter(w => w.length > 3)) {
        if (blob.includes(word)) score += 2;
      }
      if (scale) {
        if (`${c.brief} ${c.community}`.toLowerCase().includes(scale.toLowerCase())) score += 1;
      }
      return { c, score };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 5).map(s => ({
      id: s.c.id,
      name: s.c.name,
      domain: s.c.domain,
      brief: s.c.brief,
      community: s.c.community,
      protocols: s.c.protocols,
      source_chapter: s.c.source_chapter,
    }));

    if (top.length === 0) {
      return { content: [{ type: 'text' as const, text: `No matches. Available domains: ${[...new Set(COMMONS.map(c => c.domain))].join(', ')}` }] };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(top, null, 2) }] };
  });

  server.registerTool('suggest_commoning_protocols', {
    title: 'Suggest Commoning Protocols',
    description: 'Surface protocol patterns (boundary, monitoring, sanctions, conflict-resolution, polycentric layering) by category, with case examples from Bollier.',
    inputSchema: {
      domain: z.string().describe('Domain hint.'),
      problems: z.array(z.string()).optional().describe('Specific problems you\'re trying to solve (e.g., "free riders", "cross-scale coordination").'),
      max_per_category: z.number().int().min(1).max(10).optional().describe('Max protocols per category (default 4, hard cap 10). Lower values keep responses small.'),
    },
  }, async ({ domain, problems, max_per_category }) => {
    const dKey = domain.toLowerCase();
    const matchingCommons = COMMONS.filter(c => c.domain.toLowerCase().includes(dKey) || dKey.includes(c.domain.toLowerCase()));
    const cap = Math.min(max_per_category ?? 4, 10);

    // Group protocols by simple keyword categorization
    const categories: Record<string, { protocol: string; commons_id: string; commons_name: string }[]> = {
      boundary: [],
      monitoring_and_sanctions: [],
      conflict_resolution: [],
      polycentric_or_nested: [],
      other: [],
    };

    const categorize = (proto: string): keyof typeof categories => {
      const p = proto.toLowerCase();
      if (/(boundar|member|access|entitle|outsider)/.test(p)) return 'boundary';
      if (/(monitor|sanction|punish|enforce|fine|expel)/.test(p)) return 'monitoring_and_sanctions';
      if (/(dispute|resolv|conflict|mediat|arbitra)/.test(p)) return 'conflict_resolution';
      if (/(layer|nest|federat|polycen|coordinat across)/.test(p)) return 'polycentric_or_nested';
      return 'other';
    };

    for (const c of matchingCommons) {
      for (const p of c.protocols) {
        const cat = categorize(p);
        categories[cat].push({ protocol: p, commons_id: c.id, commons_name: c.name });
      }
    }

    // If problems mentioned free-riding etc., bias toward sanctions
    let highlight: string | null = null;
    if (problems && problems.some(pr => /(free.?rid|shirk|cheat|defect)/.test(pr.toLowerCase()))) {
      highlight = 'monitoring_and_sanctions';
    }
    if (problems && problems.some(pr => /(scale|cross.?scale|regional|coordinat)/.test(pr.toLowerCase()))) {
      highlight = 'polycentric_or_nested';
    }

    // Cap protocols per category to keep responses tractable.
    // Highlighted category gets 2x the cap so the focal area still has range.
    const capped: Record<string, { protocol: string; commons_id: string; commons_name: string }[]> = {};
    const totals: Record<string, number> = {};
    for (const [cat, items] of Object.entries(categories)) {
      const limit = cat === highlight ? cap * 2 : cap;
      capped[cat] = items.slice(0, limit);
      totals[cat] = items.length;
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        domain,
        problems_received: problems ?? [],
        highlighted_category: highlight,
        max_per_category: cap,
        total_protocols_by_category: totals,
        protocols_by_category: capped,
        note: 'Protocols are extracted from real commons in Bollier\'s book. Adapt them — Bollier (Ch. 1) emphasizes that commons are like DNA: under-specified so they can adapt to local conditions. Pass max_per_category to widen or narrow the surface.',
      }, null, 2) }],
    };
  });

  // === REFERENCE TOOLS (3) ===

  server.registerTool('apply_ontoshift', {
    title: 'Apply OntoShift (Market-mind → Commoning-mind reframe)',
    description: 'Given a market/state-mind framing of a problem, return the commoning-mind reframe with a grounding Bollier passage. The OntoShift is one of Bollier\'s central moves.',
    inputSchema: {
      market_framing: z.string().describe('A market/state-mind framing of a problem. E.g., "the tragedy of the commons", "we need to monetize this resource".'),
    },
  }, async ({ market_framing }) => {
    const m = market_framing.toLowerCase();

    // Find a relevant quote
    const candidateQuotes = QUOTES.filter(q => {
      const blob = `${q.text} ${q.themes.join(' ')}`.toLowerCase();
      return q.themes.some(t => /(ontoshift|tragedy|relational|commoning|reframe)/.test(t.toLowerCase()))
        || /(commoning|relational|ontoshift)/.test(blob);
    }).slice(0, 1);

    // Heuristic reframes (extend over time as glossary grows)
    let reframe = '';
    if (/(tragedy of the commons|tragedy)/.test(m)) {
      reframe = `Bollier (Ch. 2) reframes "tragedy of the commons" as a misnomer: Hardin described an open-access regime, not a commons. A commons MUST have boundaries, rules, social norms, and sanctions. The real tragedy is the *tragedy of the market* — heedless individual maximization indifferent to collective good. Commoning replaces "rational actor" with "another version of me," collapsing the collective-action problem.`;
    } else if (/(monetiz|commodif|sell|price|market)/.test(m)) {
      reframe = `Bollier (Ch. 3-4) reframes pricing/monetization as enclosure: it strips care-wealth from its relational context and converts it to inert commodity. The commoning-mind alternative: treat the resource as a *social organism* — community + care-wealth + protocols — and design protocols that decommodify it (land trust, peer-production, gift economy, polycentric stewardship).`;
    } else if (/(individual|self.?interest|rational)/.test(m)) {
      reframe = `Bollier (Ch. 7) reframes individualism as an unexamined inheritance from market culture. The commoning-mind alternative is *relational* — selves are entangled and intraconnected. Collective action is not difficult or improbable when commoners see each other as "another version of me" rather than as isolated rational utility-maximizers.`;
    } else if (/(efficien|optim|growth|progress)/.test(m)) {
      reframe = `Bollier (Ch. 4, conclusion) reframes growth/efficiency/progress as the cover story for enclosure. The commoning-mind alternative: sufficiency and care, "islands of coherence" outside the market/state system — not anti-modern, but post-extractivist.`;
    } else {
      reframe = `No specific reframe heuristic matched. General OntoShift: from market-mind (resource, transaction, individual, scarcity, growth) → to commoning-mind (care-wealth, protocol, relational entanglement, sufficiency, regeneration). See Ch. 7 ("The Commons as a Relational Organism").`;
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        market_framing,
        commoning_reframe: reframe,
        grounding_quote: candidateQuotes[0] ?? null,
      }, null, 2) }],
    };
  });

  server.registerTool('get_glossary_term', {
    title: 'Get Glossary Term',
    description: 'Look up a Bollier vocabulary term: commoning, Commonsverse, care-wealth, vernacular law, parallel polis, OntoShift, peer production, polycentric governance, etc.',
    inputSchema: {
      term: z.string().describe('The term to look up.'),
    },
  }, async ({ term }) => {
    const tKey = term.toLowerCase().trim();
    const exact = GLOSSARY.find(g => g.term.toLowerCase() === tKey);
    if (exact) {
      return { content: [{ type: 'text' as const, text: JSON.stringify(exact, null, 2) }] };
    }
    const partial = GLOSSARY.filter(g => g.term.toLowerCase().includes(tKey) || tKey.includes(g.term.toLowerCase()));
    if (partial.length > 0) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ note: `No exact match for "${term}". Closest:`, matches: partial }, null, 2) }] };
    }
    const list = GLOSSARY.map(g => g.term).join(', ');
    return { content: [{ type: 'text' as const, text: `Term "${term}" not found. Available: ${list}` }] };
  });

  server.registerTool('find_quote', {
    title: 'Find a Bollier Quote on a Theme',
    description: 'Returns up to 3 verbatim Bollier passages on a theme. For citation in writeups. Each result includes attribution.',
    inputSchema: {
      theme: z.string().describe('Theme keyword (e.g., "enclosure", "financialization", "OntoShift", "tragedy", "commoning").'),
      max_results: z.number().optional().describe('Max results (default 3, hard cap 3 for fair-use discipline).'),
    },
  }, async ({ theme, max_results }) => {
    const cap = Math.min(max_results ?? 3, 3);
    const tKey = theme.toLowerCase();
    const matches = QUOTES.filter(q =>
      q.themes.some(t => t.toLowerCase().includes(tKey) || tKey.includes(t.toLowerCase()))
      || q.text.toLowerCase().includes(tKey)
    ).slice(0, cap);

    if (matches.length === 0) {
      const themes = [...new Set(QUOTES.flatMap(q => q.themes))].sort();
      return { content: [{ type: 'text' as const, text: `No quotes on theme "${theme}". Available themes: ${themes.join(', ')}` }] };
    }
    const attribution_note = 'Each quote is from Bollier, *Think Like a Commoner* 2nd ed. (2024), CC BY-NC-SA 4.0. Cite full attribution per `source_attribution` field. https://thinklikeacommoner.com/second-edition/';
    return { content: [{ type: 'text' as const, text: JSON.stringify({ matches, attribution_note }, null, 2) }] };
  });

  return server;
}

// === START SERVER (dual stdio / HTTP) ===

async function startHttpServer() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', name: 'think-like-a-commoner', version: '0.1.0' });
  });

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  app.all('/mcp', async (req, res) => {
    const existingSessionId = req.headers['mcp-session-id'] as string | undefined;

    if (existingSessionId && sessions.has(existingSessionId)) {
      const transport = sessions.get(existingSessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    const sessionServer = createServer();
    await sessionServer.connect(transport);

    await transport.handleRequest(req, res, req.body);

    const newSessionId = res.getHeader('mcp-session-id') as string | undefined;
    if (newSessionId) {
      sessions.set(newSessionId, transport);
      transport.onclose = () => sessions.delete(newSessionId);
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.error(`Think Like a Commoner MCP Server running on HTTP port ${port}`);
  });
}

async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Think Like a Commoner MCP Server running on stdio');
}

const isHttp = !!process.env.PORT;
(isHttp ? startHttpServer() : startStdioServer()).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
