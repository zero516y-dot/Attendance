/**
 * Server entry point for TanStack Start
 *
 * For Vercel/Netlify/Edge: Used as-is
 * For Render/Node: Can be run directly via `node src/server.ts`
 */

import "./lib/error-capture";

import { createRequestHandler } from "@tanstack/react-start/server";
import { renderErrorPage } from "./lib/error-page";
import type { GetLoadResult } from "@tanstack/react-router-devtools";

// CORS configuration for cross-origin requests
const ALLOWED_ORIGINS = String(process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes("*") ? "*" : ALLOWED_ORIGINS[0] || "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request: Request, _env: unknown, _ctx: unknown) {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    try {
      // Use TanStack Start's request handler
      const response = await createRequestHandler({
        getLoadResult: async (context) => {
          // This is where TanStack would normally handle data loading
          return null;
        },
        staticChunkMap: new Map(),
        router: (await import("./router")).getRouter(),
        loadError: (error) => {
          console.error("SSR Load Error:", error);
          return renderErrorPage();
        },
      }).handleRequest(request);

      // Apply CORS headers to response
      const enhancedResponse = new Response(response.body, response);
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        enhancedResponse.headers.set(key, value);
      }
      return enhancedResponse;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8", ...CORS_HEADERS },
      });
    }
  },
};

// Node.js server entry point for Render deployment
if (import.meta.url === `file://${process.argv[1]}` || typeof Bun !== "undefined") {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "0.0.0.0";

  // Detect runtime
  const isBun = typeof Bun !== "undefined";
  const isNode = typeof process !== "undefined" && !isBun;

  const startServer = async () => {
    console.log(`Starting server on ${host}:${port}`);
    console.log(`Runtime: ${isBun ? "Bun" : "Node.js"}`);
  };

  if (isBun) {
    // @ts-ignore - Bun.type may not exist in pure TypeScript
    if (Bun && Bun.serve) {
      Bun.serve({
        port,
        host,
        fetch: (req: Request) => {
          const env = process.env;
          return exports.default.fetch(req, env, {});
        },
      });
    }
  }

  if (isNode && !isBun) {
    import("node:http")
      .then(({ createServer }) => {
        const server = createServer((req, res) => {
          const url = new URL(req.url || "/", `http://${req.headers.host}`);
          const syntheticRequest = new Request(url, {
            method: req.method,
            headers: req.headers as unknown as Headers,
          });

          exports
            .default.fetch(syntheticRequest, process.env, {})
            .then((response) => {
              res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
              response.body?.getReader().on((chunk) => res.write(chunk));
              response.body?.on("end", () => res.end());
            })
            .catch((error) => {
              console.error(error);
              res.writeHead(500, { "content-type": "text/html" });
              res.end(renderErrorPage());
            });
        });

        server.listen(port, host, () => {
          console.log(`✓ Server listening on http://${host}:${port}`);
        });

        // Graceful shutdown
        process.on("SIGTERM", () => {
          console.log("SIGTERM received, closing server");
          server.close(() => {
            console.log("Server closed");
            process.exit(0);
          });
        });
      })
      .catch((error) => {
        console.error("Failed to start Node server:", error);
        process.exit(1);
      });
  }

  // Start for Bun runtime
  if (isBun) {
    // Bun.serve is already started above
    console.log(`✓ Server listening on http://${host}:${port} (Bun)`);
  }
}