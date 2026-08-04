# mcp-kroger

Kroger MCP — grocery products, prices, and store locations (developer.kroger.com)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Kroger data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
