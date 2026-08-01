import { NextRequest, NextResponse } from "next/server";

// Server-side Etherscan (v2) proxy. Keeps ETHERSCAN_API_KEY off the client. Forwards the query
// string to Etherscan, injecting the key and chain id server-side. Read-only modules only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.ETHERSCAN_BASE || "https://api.etherscan.io/v2/api";
const KEY = process.env.ETHERSCAN_API_KEY || "";
const DEFAULT_CHAIN_ID = process.env.ETHERSCAN_CHAIN_ID || "1";

const ALLOWED_MODULES = new Set([
  "account",
  "contract",
  "logs",
  "stats",
  "transaction",
  "block",
  "token",
  "gastracker",
]);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const module = sp.get("module") ?? "";
  if (!ALLOWED_MODULES.has(module)) {
    return NextResponse.json(
      { status: "0", message: `module not allowed: ${module}`, result: null },
      { status: 400 },
    );
  }

  const url = new URL(BASE);
  sp.forEach((value, key) => {
    if (key === "apikey") return; // never accept a client-supplied key
    url.searchParams.set(key, value);
  });
  if (!url.searchParams.has("chainid")) url.searchParams.set("chainid", DEFAULT_CHAIN_ID);
  if (KEY) url.searchParams.set("apikey", KEY);

  try {
    const upstream = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    const json = await upstream.json().catch(() => ({ status: "0", message: "bad upstream response" }));
    return NextResponse.json(json, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { status: "0", message: err instanceof Error ? err.message : "upstream error", result: null },
      { status: 502 },
    );
  }
}
