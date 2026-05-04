# Think Like a Commoner — MCP Server

An MCP server embedding David Bollier's commons framing from *Think Like a Commoner: A Short Introduction to the Life of the Commons* (2nd edition, 2024).

> Build for: commons stewards, organizers, and movement strategists. Use it inside Claude Desktop, Claude Code, or any MCP-compatible client to apply Bollier's framing to a real situation — name an enclosure, find precedent commons, design social protocols, or reframe a market-mind problem.

## License

Dual-licensed. **Source code:** MIT. **Embedded book content** (catalogs, quotes, glossary): CC BY-NC-SA 4.0 (attribution to David Bollier required, non-commercial only). See [LICENSE](LICENSE).

Source book: https://thinklikeacommoner.com/second-edition/ — read it free, or order from New Society Publishers.

## Tools (12)

**Routing:** `start_analysis`, `suggest_next_step`
**Diagnostic:** `classify_situation`, `find_enclosure_pattern`, `find_precedent_commons`, `list_response_strategies`
**Design:** `assess_ostrom_principles`, `find_similar_commons`, `suggest_commoning_protocols`
**Reference:** `apply_ontoshift`, `get_glossary_term`, `find_quote`

## Use it (remote)

Add to your Claude Desktop / Claude Code MCP config:

```json
{
  "mcpServers": {
    "think-like-a-commoner": {
      "url": "https://think-like-a-commoner-mcp-production.up.railway.app/mcp",
      "transport": "http"
    }
  }
}
```

The Railway deploy is public, no auth, and does not require an API key.

## Use it (local)

```bash
git clone https://github.com/zhiganov/think-like-a-commoner-mcp.git
cd think-like-a-commoner-mcp
npm install
npm run build
```

Then add to MCP config:

```bash
claude mcp add-json think-like-a-commoner '{"command":"node","args":["<absolute-path>/dist/index.js"],"type":"stdio"}' -s local
```

## Workflows

**Strategist (naming an enclosure):**
1. `start_analysis(situation: "naming_enclosure")` → get scaffold
2. `classify_situation(...)` → ground in Bollier's framing
3. `find_enclosure_pattern(...)` → match to a named pattern
4. `list_response_strategies(...)` → surface commoning counters
5. `find_quote("financialization of nature")` → for the writeup

**Steward (designing a commons):**
1. `start_analysis(situation: "designing_commons")` → get scaffold
2. `find_similar_commons(...)` → learn from precedent
3. `assess_ostrom_principles(...)` → walk the 8-principle rubric
4. `suggest_commoning_protocols(...)` → protocol patterns by category

## Development

Source: TypeScript ESM, `@modelcontextprotocol/sdk`, `zod`. Stack documented in [CLAUDE.md](CLAUDE.md).

Catalogs are extracted from the source markdown via `npm run extract` (requires `ANTHROPIC_API_KEY` in `.env`). Re-runs are idempotent in shape; IDs may drift slightly across runs.

## Related

Sibling commons-themed MCPs in development: Plurality (Weyl & Tang), Governable Spaces (Schneider). All under the [book-power](https://github.com/zhiganov/book-power) umbrella.
