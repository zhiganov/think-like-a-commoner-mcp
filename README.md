# Think Like a Commoner — MCP Server

An MCP server embedding David Bollier's commons framing from *Think Like a Commoner: A Short Introduction to the Life of the Commons* (2nd edition, 2024).

> Built for: commons stewards, organizers, and movement strategists. Use it inside Claude Desktop, Claude Code, or any MCP-compatible client to apply Bollier's framing to a real situation — name an enclosure, find precedent commons, design social protocols, or reframe a market-mind problem.

The server is hosted publicly. No account, no API key, no install required — just point your Claude client at the URL.

---

## Quickstart — Claude Desktop

If you use the Claude Desktop app:

**1. Open your Claude Desktop config file.**

| Your OS | File location |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

If the file doesn't exist, create it.

**2. Add this entry.** If you already have other `mcpServers`, add `"think-like-a-commoner"` alongside them; otherwise paste the whole block:

```json
{
  "mcpServers": {
    "think-like-a-commoner": {
      "url": "https://tlac-book-mcp-production.up.railway.app/mcp",
      "transport": "http"
    }
  }
}
```

**3. Quit and restart Claude Desktop.** (Fully quit — closing the window doesn't reload MCP servers.)

**4. Verify it's connected.** Open a new conversation and type:

> What MCP tools do you have available?

Claude should mention 12 tools whose names start with `start_analysis`, `find_enclosure_pattern`, `find_quote`, etc. If not, the config file probably has a syntax error or the wrong path — see [troubleshooting](#troubleshooting) below.

## Quickstart — Claude Code

Run this once from your terminal:

```bash
claude mcp add --transport http -s user think-like-a-commoner https://tlac-book-mcp-production.up.railway.app/mcp
```

Then restart your Claude Code session and check `claude mcp list` — you should see `think-like-a-commoner ... ✓ Connected`. The 12 tools become available with names like `mcp__think-like-a-commoner__start_analysis`.

---

## What's in the catalog

Bollier's tripartite definition of a commons — *community + care-wealth + protocols* — shapes the data:

- **Commons cases** — exemplary commons (Wikipedia, Spanish huerta, makerspaces, Erakulapally seed-sharing, etc.), plus specific historical enclosure events and broader anti-patterns. Each entry names its **community** (who stewards it), its **care-wealth** (what's stewarded), and 2–5 **protocols** — concrete imperative rules with MUST / SHOULD / MUST NOT modal markers, drawn directly from Bollier's framing. The protocols are what distinguish a commons from open-access.
- **Enclosure patterns** — recognition heuristics for how shared wealth gets captured (commons-washing, financialization-of-nature, market/state duopoly, etc.) with response strategies cross-referenced.
- **Strategies** — named commoning moves that counter enclosures (parallel polis, vernacular law, decommodification, federated commons, etc.).
- **Ostrom's 8 design principles** — Elinor Ostrom's empirical rubric for evaluating commons durability, with 3–5 diagnostic questions per principle.
- **Glossary** — Bollier's vocabulary (OntoShift, commoning, care-wealth, vernacular law, etc.).
- **Quotes** — verbatim passages indexed by theme, with full attribution to Bollier built into every response that surfaces them (per the CC BY-NC-SA license).

Example of what a "protocol" looks like — from the Wikipedia entry:

> - "Content MUST remain openly accessible and freely editable by volunteers under open licensing"
> - "Governance SHOULD be democratic and community-driven rather than corporate or state-controlled"
> - "The platform MUST NOT be operated for profit or under investor-driven governance"

---

## What you can ask it to do

You don't call the tools directly. You talk to Claude in plain English, and Claude decides which tools to use. Two common starting points:

### Naming an enclosure

You're trying to write up, advocate against, or just *understand* a situation where something shared is being captured — a paywall on public research, a platform monopoly, a "commons-washing" corporate rebrand, a privatization of public infrastructure. The MCP helps Claude walk Bollier's diagnostic ladder with you.

> **You:** Help me write up the App Store as an enclosure. Apple takes 30% from every developer and controls who can publish to iPhone users — that used to be a more open space. I want to ground this in real framing, not just complain.
>
> **Claude:** [calls `start_analysis(situation: "naming_enclosure")`] Bollier suggests four diagnostic questions for naming an enclosure: What was previously shared, customary, or freely accessible? Who is making the appropriation? How is it being justified? What is being lost beyond the resource itself?
>
> Let me match this to a named pattern... [calls `find_enclosure_pattern`] The closest fit is "proprietary platform enclosure of digital commons" — Bollier explicitly cites Apple and big-tech platform monopolies as canonical cases. The structural move is wrapping a network commons in proprietary control while charging a "rent" on participation.
>
> [calls `list_response_strategies`] Bollier's response strategies for this kind of enclosure include: federated alternatives, regulatory antitrust pressure, open-protocol advocacy, and movement-building around developer cooperatives. [calls `find_quote("platform monopoly")`] Here are two grounding passages from the book you can quote in the writeup...

### Designing a commons

You're building, growing, or stewarding a community resource — a tool library, a community land trust, an open-source project, a neighborhood mutual-aid network — and want to design it with the durable patterns Bollier extracts from Ostrom's fieldwork.

> **You:** I'm helping start a tool library in our neighborhood — a place where people can borrow drills, ladders, tents, etc. instead of each household owning one. What does Bollier say about designing this kind of commons well?
>
> **Claude:** [calls `start_analysis(situation: "designing_commons")`] Good frame. Bollier asks: what care-wealth do you steward? Who's the community, with what boundaries? What protocols do you have or want?
>
> [calls `find_similar_commons(domain: "urban", what_stewarded: "shared tools")`] Two precedent cases worth learning from: makerspaces (shared workshops, governance via membership and contribution norms) and Boston's snow-parking commons (vernacular norms for scarce shared resources).
>
> [calls `assess_ostrom_principles`] Let me walk Ostrom's 8 design principles for your situation, with diagnostic questions for each... [continues]

### Other things to try

- "Reframe X in commons terms" — pulls in Bollier's OntoShift move
- "What does Bollier mean by commoning?" — uses the glossary
- "Find me a Bollier passage on financialization of nature" — surfaces verbatim quotes with citations
- "Is what this corporation is doing actual commoning, or commons-washing?" — surfaces anti-pattern signals

---

## Troubleshooting

**Claude doesn't list any TLAC tools after restart.**
Most often a JSON typo or wrong file path. On macOS: `cat ~/Library/Application\ Support/Claude/claude_desktop_config.json` should print your config — if not, the file is in the wrong place or has malformed JSON. Run the file's contents through a JSON validator (paste into https://jsonlint.com).

**Claude Code says "Connection failed".**
Confirm the URL works directly: `curl https://tlac-book-mcp-production.up.railway.app/health` should return `{"status":"ok",...}`. If yes, the server is up — check `claude mcp list` to see what scope and URL Claude Code recorded.

**Tools work but responses feel generic.**
The MCP scaffolds Bollier's framing; the depth comes from how specifically you describe your situation. Vague prompts get vague tool calls. Lead with the concrete case ("Apple App Store", "neighborhood tool library") and let Claude route from there.

---

## All 12 tools (for reference)

You don't usually call these directly — Claude picks them based on your prompt — but here's the surface:

- **Routing:** `start_analysis`, `suggest_next_step`
- **Diagnostic:** `classify_situation`, `find_enclosure_pattern`, `find_precedent_commons`, `list_response_strategies`
- **Design:** `assess_ostrom_principles`, `find_similar_commons`, `suggest_commoning_protocols`
- **Reference:** `apply_ontoshift`, `get_glossary_term`, `find_quote`

---

## Run it locally (advanced)

If you'd rather host the MCP yourself (offline, custom catalog, learning, contributing):

```bash
git clone https://github.com/zhiganov/think-like-a-commoner-mcp.git
cd think-like-a-commoner-mcp
npm install
npm run build
```

Then add it to Claude Code as a local stdio server. The path you need is the absolute path to `dist/index.js` — run `pwd` inside the cloned directory and append `/dist/index.js`:

```bash
claude mcp add-json think-like-a-commoner '{"command":"node","args":["<absolute-path>/dist/index.js"],"type":"stdio"}' -s local
```

(For Claude Desktop, the equivalent JSON in your config file uses `"command"` and `"args"` instead of `"url"`.)

---

## License

Dual-licensed.

- **Source code:** MIT.
- **Embedded book content** (catalogs, quotes, glossary): CC BY-NC-SA 4.0. Attribution to David Bollier required, non-commercial only. See [LICENSE](LICENSE).

Source book: https://thinklikeacommoner.com/second-edition/ — read it free, or order from New Society Publishers.

## Development

Source: TypeScript ESM, `@modelcontextprotocol/sdk`, `zod`. Stack documented in [CLAUDE.md](CLAUDE.md).

Catalogs are extracted from the source markdown via `npm run extract` (requires `ANTHROPIC_API_KEY` in `.env`). Re-runs are idempotent in shape; IDs may drift slightly across runs.

Smoke tests live in `scripts/`: `smoke-fixes.mjs` runs against a local stdio build (`npm run build && node scripts/smoke-fixes.mjs`) for regression coverage; `smoke-fixes-prod.mjs` hits the Railway HTTP transport for post-deploy verification.

Catalog provenance: `docs/archive/` preserves entries that have been merged into siblings during dedup passes — the active catalog stays compact while authored content remains recoverable. See the in-file preamble for each archive batch.

## Related

Sibling MCPs under the book-power umbrella (umbrella repo private):

- [governable-spaces-mcp](https://github.com/zhiganov/governable-spaces-mcp) — Schneider's *Governable Spaces* on democratic design for online life (shipped, public, CC BY-NC-SA)
- jtbd-knowledge-mcp — JTBD framing combining Moesta + Kalbach (shipped, private — copyrighted source)
- facilitating-deliberation-mcp — MosaicLab's facilitator reference (shipped, private — copyrighted source)
- Plurality (Weyl & Tang) — queued, will be public (CC0 source)
