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
