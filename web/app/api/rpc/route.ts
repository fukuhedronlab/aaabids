import { NextRequest, NextResponse } from "next/server";

// Server-side RPC proxy. The real (keyed) endpoint lives in RPC_URL and is NEVER shipped to the
// browser. The frontend points its transport at /api/rpc, so the API key stays on the server.
// Only read-only JSON-RPC methods are allowed — writes go through the user's wallet, not this proxy.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM =
  process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getLogs",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "net_version",
  "web3_clientVersion",
]);

function rpcError(id: unknown, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message } };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, "invalid JSON"), { status: 400 });
  }

  const batch = Array.isArray(body) ? body : [body];
  for (const item of batch) {
    const method = (item as { method?: unknown })?.method;
    if (typeof method !== "string" || !ALLOWED_METHODS.has(method)) {
      // Reject the whole request if any call isn't a permitted read method.
      const id = (item as { id?: unknown })?.id;
      return NextResponse.json(rpcError(id, `method not allowed: ${String(method)}`), {
        status: 200,
      });
    }
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // Never cache RPC responses.
      cache: "no-store",
    });
    const json = await upstream.json();
    return NextResponse.json(json, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      rpcError(null, `upstream error: ${err instanceof Error ? err.message : "unknown"}`),
      { status: 502 },
    );
  }
}
