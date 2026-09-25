# mcp-kroger

Kroger MCP — grocery products, prices, and store locations (developer.kroger.com)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1679+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `kroger_store_locator` | Find Kroger-family grocery stores and supermarkets near a US ZIP code — covers Kroger, Ralphs, Fred Meyer, King Soopers, Fry's, Harris Teeter, QFC, Smith's, Dillons, Food 4 Less, Mariano's and more. Returns store names, addresses, phone, hours, and the location_id needed for price lookups. Example: kroger_store_locator({ zip_code: "45202" }) |
| `kroger_product_search` | Search grocery products at Kroger-family supermarkets with real shelf prices, promo/sale prices, stock level, and aisle. Answers "how much does milk cost", "is X in stock", grocery price comparison. Give a zip_code (or location_id) to get store-specific prices; without one, only the national product catalog is returned (no prices). Example: kroger_product_search({ term: "whole milk", zip_code: "45202" }) |
| `kroger_product_details` | Get full detail for one grocery product by its product_id — price, promo price, stock level, size, categories, aisle location, images. Pass zip_code or location_id for store-specific price/stock. Example: kroger_product_details({ product_id: "0001111041700", zip_code: "45202" }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "kroger": {
      "url": "https://gateway.pipeworx.io/kroger/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/kroger/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1679+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/kroger_store_locator \
  -H 'Content-Type: application/json' \
  -d '{"zip_code":"45202"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/kroger_store_locator`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "kroger": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-kroger"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-kroger
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Kroger data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
