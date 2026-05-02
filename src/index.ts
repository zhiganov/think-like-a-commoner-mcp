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
      c.domain.toLowerCase().includes(dKey) || dKey.includes(c.domain.toLowerCase())
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

  return server;
}

// === START SERVER (stdio for now; HTTP added in Task 9) ===
async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Think Like a Commoner MCP Server running on stdio');
}

startStdioServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
