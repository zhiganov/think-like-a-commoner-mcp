# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**think-like-a-commoner-mcp** — Public MCP server embedding David Bollier's *Think Like a Commoner* (2nd ed., 2024). 12 tools across 4 groups (routing, diagnostic, design, reference). Dual-licensed: MIT code + CC BY-NC-SA 4.0 embedded content.

## Commands

```bash
npm run build          # Compile TypeScript (tsc)
npm run dev            # Run directly with tsx (no build step)
npm start              # Run compiled server (dist/index.js)
npm run extract        # Re-run Claude-extraction over books/think-like-a-commoner.md (requires ANTHROPIC_API_KEY)
npm run typecheck      # tsc --noEmit
```

## Architecture

```
src/
├── index.ts           # MCP server — 12 tool registrations + handlers + dual transport
├── search.ts          # Substring search across all 6 catalogs
├── types.ts           # Commons, Enclosure, Strategy, OstromPrinciple, GlossaryTerm, Quote
└── data/
    ├── index.ts       # Re-exports
    ├── commons.ts     # ~50 commons cases
    ├── enclosures.ts  # ~15 enclosure patterns
    ├── strategies.ts  # ~10 commoning strategies
    ├── ostrom.ts      # 8 design principles
    ├── glossary.ts    # ~30 Bollier vocabulary terms
    └── quotes.ts      # ~30-60 themed grounding passages

scripts/
└── extract-data.ts    # Claude-powered chapter-by-chapter extraction
```

## Tool groups (12 total)

**Routing (2):** `start_analysis`, `suggest_next_step`
**Diagnostic (4):** `classify_situation`, `find_enclosure_pattern`, `find_precedent_commons`, `list_response_strategies`
**Design (3):** `assess_ostrom_principles`, `find_similar_commons`, `suggest_commoning_protocols`
**Reference (3):** `apply_ontoshift`, `get_glossary_term`, `find_quote`

## Key design decisions

- Hybrid: server provides framing scaffolding; Claude in conversation does analytical work (no LLM calls in server)
- All data embedded as TypeScript constants — no DB, no vector search
- Substring search for cross-catalog discovery
- Branching entry-point (`start_analysis`) routes to one of 4 workflows: threatened_commons, designing_commons, naming_enclosure, exploring
- Dual transport: stdio (local dev) / StreamableHTTP (Railway). **No auth** — public, by design (book is CC BY-NC-SA, framing is for movement-building)
- `classify_situation` is intentionally heuristic and surfaces caveat: a commons MUST have community + care-wealth + protocols (Bollier Ch. 1)
- `find_quote` capped at 3 results × ~200 words each, per CC BY-NC-SA fair-use discipline; each response includes attribution

## Stack

TypeScript strict ESM, `@modelcontextprotocol/sdk` v1.27+, `zod` v4, `express`. Extraction script uses `@anthropic-ai/sdk`.

## Deployment

Railway (public, no auth), service `tlac-book-mcp` under the **Book Power** Railway project. Live at https://tlac-book-mcp-production.up.railway.app. GitHub auto-deploy from `main` is wired via Railway's GitHub app on `zhiganov/think-like-a-commoner-mcp`.

## Related

Sibling MCPs from the same book-power umbrella: jtbd-knowledge (Moesta + Kalbach), facilitating-deliberation (White, Hunter, Greaves), Plurality (Weyl + Tang, queued), Governable Spaces (Schneider, queued).

Design doc: `book-power/docs/plans/2026-05-02-think-like-a-commoner-mcp-design.md`. Tracked as book-power issue #15.
