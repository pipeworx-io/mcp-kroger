interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Kroger MCP — grocery products, prices, and store locations (developer.kroger.com)
 *
 * Tools:
 * - kroger_store_locator: find Kroger-family supermarkets near a ZIP code
 * - kroger_product_search: search groceries with real shelf prices, promo prices, stock levels
 * - kroger_product_details: full detail for one product at a store
 *
 * Auth: OAuth2 client-credentials. `_apiKey` = "client_id:client_secret"
 * (combined-credential pattern, like dataforseo's login:password). The
 * gateway injects PLATFORM_KROGER_KEY when the caller doesn't bring one.
 * Tokens live 30 min; cached per-credential in the isolate.
 *
 * Kroger footprint: ~2,700 US stores as Kroger, Ralphs, Fred Meyer, King
 * Soopers, Fry's, Harris Teeter, QFC, Smith's, Dillons, Food 4 Less, Fresh
 * Fare, Mariano's, Metro Market, Pick 'n Save, City Market, Gerbes.
 * Prices and stock are per-store: they only appear when a location is given.
 */


const BASE_URL = 'https://api.kroger.com/v1';

const tools: McpToolExport['tools'] = [
  {
    name: 'kroger_store_locator',
    description:
      'Find Kroger-family grocery stores and supermarkets near a US ZIP code — covers Kroger, Ralphs, Fred Meyer, King Soopers, Fry\'s, Harris Teeter, QFC, Smith\'s, Dillons, Food 4 Less, Mariano\'s and more. Returns store names, addresses, phone, hours, and the location_id needed for price lookups. Example: kroger_store_locator({ zip_code: "45202" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        zip_code: { type: 'string', description: 'US ZIP code to search near, e.g. "45202"' },
        radius_miles: { type: 'number', description: 'Search radius in miles, 1-100 (default 10)' },
        chain: { type: 'string', description: 'Optional chain filter, e.g. "Kroger", "Ralphs", "Fred Meyer"' },
        limit: { type: 'number', description: 'Max stores to return, 1-50 (default 5)' },
        _apiKey: { type: 'string', description: 'Optional: your own Kroger API credentials as "client_id:client_secret" (free at developer.kroger.com)' },
      },
      required: ['zip_code'],
    },
  },
  {
    name: 'kroger_product_search',
    description:
      'Search grocery products at Kroger-family supermarkets with real shelf prices, promo/sale prices, stock level, and aisle. Answers "how much does milk cost", "is X in stock", grocery price comparison. Give a zip_code (or location_id) to get store-specific prices; without one, only the national product catalog is returned (no prices). Example: kroger_product_search({ term: "whole milk", zip_code: "45202" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        term: { type: 'string', description: 'Product search term, e.g. "whole milk", "cage free eggs", "diet coke 12 pack"' },
        zip_code: { type: 'string', description: 'US ZIP code — the nearest store is auto-selected so prices and stock appear' },
        location_id: { type: 'string', description: 'Exact store location_id from kroger_store_locator (overrides zip_code)' },
        brand: { type: 'string', description: 'Optional brand filter, e.g. "Kroger", "Organic Valley"' },
        limit: { type: 'number', description: 'Max products to return, 1-50 (default 10)' },
        _apiKey: { type: 'string', description: 'Optional: your own Kroger API credentials as "client_id:client_secret" (free at developer.kroger.com)' },
      },
      required: ['term'],
    },
  },
  {
    name: 'kroger_product_details',
    description:
      'Get full detail for one grocery product by its product_id — price, promo price, stock level, size, categories, aisle location, images. Pass zip_code or location_id for store-specific price/stock. Example: kroger_product_details({ product_id: "0001111041700", zip_code: "45202" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        product_id: { type: 'string', description: '13-digit Kroger product ID from kroger_product_search' },
        zip_code: { type: 'string', description: 'US ZIP code — nearest store auto-selected for price/stock' },
        location_id: { type: 'string', description: 'Exact store location_id (overrides zip_code)' },
        _apiKey: { type: 'string', description: 'Optional: your own Kroger API credentials as "client_id:client_secret"' },
      },
      required: ['product_id'],
    },
  },
];

// ---------------------------------------------------------------------------
// OAuth client-credentials token, cached per credential until ~1 min before
// expiry. Cache is keyed by the credential string so a BYO caller's token can
// never be served to platform-keyed calls (or vice versa).
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getToken(apiKey: string): Promise<string> {
  const cached = tokenCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(`${BASE_URL}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(apiKey)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });
  if (!res.ok) {
    throw new Error(
      `Kroger: auth failed (HTTP ${res.status}). Credentials must be "client_id:client_secret" from developer.kroger.com. If you passed your own _apiKey, verify both halves; otherwise the platform credentials need rotation.`,
    );
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(apiKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });
  return data.access_token;
}

function krogerError(status: number, tool: string): Error {
  if (status === 429) {
    return new Error(
      `Kroger: rate-limit (HTTP 429). The public Products API allows 10,000 calls/day; the shared quota is currently exhausted. Pass your own credentials via _apiKey ("client_id:client_secret", free at developer.kroger.com) to use a personal quota.`,
    );
  }
  if (status === 401 || status === 403) {
    return new Error(
      `Kroger: auth rejected (HTTP ${status}) — token expired mid-flight or scope missing. Retry once; if it persists the credentials are invalid.`,
    );
  }
  return new Error(`Kroger ${tool} error: HTTP ${status}`);
}

async function api(path: string, params: URLSearchParams, apiKey: string, tool: string) {
  const token = await getToken(apiKey);
  const res = await fetch(`${BASE_URL}${path}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw krogerError(res.status, tool);
  return res.json();
}

// ---------------------------------------------------------------------------

interface KrogerLocation {
  locationId: string;
  chain: string;
  name: string;
  phone?: string;
  address: { addressLine1?: string; city?: string; state?: string; zipCode?: string };
  geolocation?: { latitude?: number; longitude?: number };
  hours?: { open24?: boolean; monday?: { open?: string; close?: string } };
}

function shapeLocation(l: KrogerLocation) {
  return {
    location_id: l.locationId,
    chain: l.chain,
    name: l.name,
    address: [l.address?.addressLine1, l.address?.city, l.address?.state, l.address?.zipCode]
      .filter(Boolean)
      .join(', '),
    phone: l.phone,
    latitude: l.geolocation?.latitude,
    longitude: l.geolocation?.longitude,
    open_24h: l.hours?.open24 ?? false,
    monday_hours: l.hours?.monday ? `${l.hours.monday.open}-${l.hours.monday.close}` : undefined,
  };
}

async function findLocations(
  zip: string,
  apiKey: string,
  opts: { radius?: number; chain?: string; limit?: number } = {},
) {
  const params = new URLSearchParams({
    'filter.zipCode.near': zip,
    'filter.limit': String(Math.min(Math.max(opts.limit ?? 5, 1), 50)),
  });
  if (opts.radius) params.set('filter.radiusInMiles', String(Math.min(Math.max(opts.radius, 1), 100)));
  if (opts.chain) params.set('filter.chain', opts.chain.toUpperCase());
  const data = (await api('/locations', params, apiKey, 'kroger_store_locator')) as {
    data: KrogerLocation[];
  };
  return data.data ?? [];
}

// Kroger has no stores in the Northeast, most of California's Bay Area, and
// several other regions — an empty result is usually geography, not an error.
const NO_STORES_HINT =
  'No Kroger-family stores near that ZIP. Kroger operates ~2,700 stores in 35 states (as Kroger, Ralphs, Fred Meyer, King Soopers, Fry\'s, Harris Teeter, QFC, Smith\'s, Dillons, Food 4 Less, Mariano\'s) but has no presence in the Northeast US, the SF Bay Area, Minnesota, or Florida\'s panhandle. Product search still works without a location — it returns the national catalog without prices.';

async function storeLocator(args: Record<string, unknown>, apiKey: string) {
  const zip = String(args.zip_code ?? args.zip ?? args.zipcode ?? '').trim();
  if (!/^\d{5}$/.test(zip)) {
    throw new Error(`kroger_store_locator requires a 5-digit US zip_code (got "${zip}").`);
  }
  const locations = await findLocations(zip, apiKey, {
    radius: args.radius_miles as number | undefined,
    chain: args.chain as string | undefined,
    limit: args.limit as number | undefined,
  });
  return {
    zip_code: zip,
    count: locations.length,
    note: locations.length === 0 ? NO_STORES_HINT : undefined,
    stores: locations.map(shapeLocation),
  };
}

interface KrogerProduct {
  productId: string;
  brand?: string;
  description: string;
  categories?: string[];
  countryOrigin?: string;
  items?: Array<{
    size?: string;
    price?: { regular?: number; promo?: number };
    fulfillment?: { inStore?: boolean; delivery?: boolean; curbside?: boolean };
    inventory?: { stockLevel?: string };
  }>;
  aisleLocations?: Array<{ description?: string; number?: string }>;
  images?: Array<{ perspective?: string; sizes?: Array<{ size?: string; url?: string }> }>;
}

function shapeProduct(p: KrogerProduct, withImage = false) {
  const item = p.items?.[0] ?? {};
  const price = item.price ?? {};
  const shaped: Record<string, unknown> = {
    product_id: p.productId,
    description: p.description,
    brand: p.brand,
    size: item.size,
    price_regular: price.regular ?? null,
    price_promo: price.promo ?? null,
    on_sale: price.promo != null && price.regular != null && price.promo < price.regular,
    stock_level: item.inventory?.stockLevel ?? null,
    aisle: p.aisleLocations?.[0]?.description,
    categories: p.categories,
  };
  if (withImage) {
    shaped.image_url = p.images?.[0]?.sizes?.find((s) => s.size === 'medium')?.url;
    shaped.country_origin = p.countryOrigin;
    shaped.fulfillment = item.fulfillment;
  }
  return shaped;
}

// Resolve the store to price against: explicit location_id wins, else the
// nearest store to zip_code. Returns undefined when neither is usable so
// catalog-only search still answers (prices just come back null).
async function resolveLocation(
  args: Record<string, unknown>,
  apiKey: string,
): Promise<{ id?: string; store?: ReturnType<typeof shapeLocation>; note?: string }> {
  const explicit = String(args.location_id ?? args.locationId ?? '').trim();
  if (explicit) return { id: explicit };
  const zip = String(args.zip_code ?? args.zip ?? args.zipcode ?? '').trim();
  if (!/^\d{5}$/.test(zip)) return {};
  const locations = await findLocations(zip, apiKey, { limit: 1 });
  if (locations.length === 0) return { note: NO_STORES_HINT };
  return { id: locations[0].locationId, store: shapeLocation(locations[0]) };
}

async function productSearch(args: Record<string, unknown>, apiKey: string) {
  const term = String(args.term ?? args.query ?? args.search ?? '').trim();
  if (!term) {
    throw new Error('kroger_product_search requires a search term, e.g. { term: "whole milk" }.');
  }
  if (term.length < 3) {
    throw new Error(`Kroger requires search terms of at least 3 characters (got "${term}").`);
  }
  const loc = await resolveLocation(args, apiKey);
  const params = new URLSearchParams({
    'filter.term': term,
    'filter.limit': String(Math.min(Math.max((args.limit as number) ?? 10, 1), 50)),
  });
  if (loc.id) params.set('filter.locationId', loc.id);
  if (args.brand) params.set('filter.brand', String(args.brand));

  const data = (await api('/products', params, apiKey, 'kroger_product_search')) as {
    data: KrogerProduct[];
  };
  const products = data.data ?? [];
  return {
    term,
    store: loc.store,
    location_id: loc.id,
    note: loc.note ?? (loc.id ? undefined : 'No store given — national catalog results, prices omitted. Pass zip_code for shelf prices.'),
    count: products.length,
    products: products.map((p) => shapeProduct(p)),
  };
}

async function productDetails(args: Record<string, unknown>, apiKey: string) {
  const id = String(args.product_id ?? args.productId ?? args.id ?? '').trim();
  if (!id) {
    throw new Error('kroger_product_details requires a product_id from kroger_product_search.');
  }
  const loc = await resolveLocation(args, apiKey);
  const params = new URLSearchParams();
  if (loc.id) params.set('filter.locationId', loc.id);
  const data = (await api(`/products/${encodeURIComponent(id)}`, params, apiKey, 'kroger_product_details')) as {
    data: KrogerProduct;
  };
  return {
    store: loc.store,
    location_id: loc.id,
    note: loc.note,
    product: shapeProduct(data.data, true),
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string | undefined;
  delete args._apiKey;
  if (!apiKey || !apiKey.includes(':')) {
    throw new Error(
      'Kroger requires credentials as "client_id:client_secret". None were available — pass _apiKey (free at developer.kroger.com) or [sign up](https://pipeworx.io/signup?via=auth_hint) to use the platform credentials.',
    );
  }
  switch (name) {
    case 'kroger_store_locator':
      return storeLocator(args, apiKey);
    case 'kroger_product_search':
      return productSearch(args, apiKey);
    case 'kroger_product_details':
      return productDetails(args, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 5 } } satisfies McpToolExport;
