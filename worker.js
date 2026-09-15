/**
 * Cloudflare Worker proxy for airport-arrival-calculator v00.00.05
 *
 * Required secret:
 *   npx wrangler secret put DATA_GO_KR_SERVICE_KEY
 *
 * Optional variable:
 *   ALLOWED_ORIGIN=https://YOUR_GITHUB_USERNAME.github.io
 *
 * Official upstream:
 *   Incheon International Airport Corp. passenger forecast API
 *   https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt
 */
const UPSTREAM = "https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt";

function cors(origin, allowed) {
  const allow = !allowed || allowed === "*" || origin === allowed ? (allowed || "*") : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function numberOf(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeItems(payload) {
  const body = payload?.response?.body ?? payload?.body ?? payload;
  let items = body?.items ?? [];
  if (items && !Array.isArray(items)) items = items.item ?? items.items ?? [];
  if (!Array.isArray(items)) items = [items].filter(Boolean);

  return items.map(item => ({
    date: String(item.adate ?? ""),
    slot: String(item.atime ?? ""),
    // Totals remain the most stable values across the 2025 field split.
    t1Departures: numberOf(item.t1sumset2),
    t2Departures: numberOf(item.t2sumset2),

    // Preserve detailed new fields for future UI use.
    t1Gates: {
      dg1: numberOf(item.t1dg1 ?? item.t1sum5),
      dg2: numberOf(item.t1dg2 ?? item.t1sum6),
      dg3: numberOf(item.t1dg3 ?? item.t1sum7),
      dg4: numberOf(item.t1dg4 ?? item.t1sum8),
      dg5: numberOf(item.t1dg5),
      dg6: numberOf(item.t1dg6)
    },
    t2Gates: {
      dg1: numberOf(item.t2dg1 ?? item.t2sum3),
      dg2: numberOf(item.t2dg2 ?? item.t2sum4)
    }
  }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin, env.ALLOWED_ORIGIN || "*");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET") {
      return Response.json({error:"Method not allowed"}, {status:405,headers});
    }
    if (url.pathname !== "/forecast") {
      return Response.json({error:"Not found"}, {status:404,headers});
    }
    if (headers["Access-Control-Allow-Origin"] === "") {
      return Response.json({error:"Origin not allowed"}, {status:403,headers});
    }

    const selectdate = url.searchParams.get("selectdate") || "0";
    if (!["0","1"].includes(selectdate)) {
      return Response.json({error:"selectdate must be 0 or 1"}, {status:400,headers});
    }
    if (!env.DATA_GO_KR_SERVICE_KEY) {
      return Response.json({error:"Worker secret DATA_GO_KR_SERVICE_KEY is not configured"}, {status:500,headers});
    }

    const cacheKey = new Request(`${url.origin}/_cache/forecast?selectdate=${selectdate}`, request);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const upstream = new URL(UPSTREAM);
    upstream.searchParams.set("serviceKey", env.DATA_GO_KR_SERVICE_KEY);
    upstream.searchParams.set("selectdate", selectdate);
    upstream.searchParams.set("type", "json");
    upstream.searchParams.set("numOfRows", "100");
    upstream.searchParams.set("pageNo", "1");

    let response;
    try {
      response = await fetch(upstream.toString(), {
        headers: { "Accept": "application/json" }
      });
    } catch (e) {
      return Response.json({error:"Upstream network error"}, {status:502,headers});
    }

    if (!response.ok) {
      const text = await response.text();
      return Response.json({
        error:"Upstream API error",
        status:response.status,
        detail:text.slice(0,300)
      }, {status:502,headers});
    }

    let payload;
    try {
      payload = await response.json();
    } catch (e) {
      return Response.json({error:"Upstream returned non-JSON response"}, {status:502,headers});
    }

    const rows = normalizeItems(payload);
    const result = {
      source: "인천국제공항공사_승객예고-출·입국장별",
      datasetId: "15095066",
      fetchedAt: new Date().toISOString(),
      selectdate,
      rows
    };

    const out = Response.json(result, {
      headers: {
        ...headers,
        "Cache-Control":"public, max-age=300"
      }
    });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  }
};
