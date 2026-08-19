/**
 * Error reporting utilities — production-ready error handling.
 * This file is framework-agnostic and safe for Vercel / Render deployment.
 */

/**
 * Capture an error for later reporting / telemetry.
 * Safe to call from both browser and Node environments.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  const stack = error instanceof Error ? error.stack : undefined;

  // In a browser, you could forward to an analytics endpoint:
  if (typeof window !== "undefined") {
    console.error("Error reported:", { message, stack, ...context });
    // Example: fetch("/api/log-error", {
    //   method: "POST",
    //   body: JSON.stringify({ message, stack, ...context }),
    // });
  } else {
    // Node.js / server environment
    console.error("Error reported (Node):", { message, stack, ...context });
  }
}

/**
 * Capture an exception with optional context.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>
): void {
  reportError(error, context);
}