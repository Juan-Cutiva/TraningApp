"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/utils";

/**
 * Listens for unhandled promise rejections and top-level script errors,
 * funneling them to the same /api/client-error endpoint the ErrorBoundary
 * uses. Together these give visibility into:
 *   - ErrorBoundary catches   (React render-phase errors)
 *   - unhandled rejections    (forgotten awaits in async handlers)
 *   - window.onerror          (top-level script errors outside React)
 */
export function GlobalErrorListener() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onRejection(e: PromiseRejectionEvent) {
      const reason = e.reason;
      const err =
        reason instanceof Error
          ? reason
          : new Error(typeof reason === "string" ? reason : "unhandled rejection");
      reportError(err, { source: "unhandledrejection" });
    }

    function onError(e: ErrorEvent) {
      const err = e.error instanceof Error ? e.error : new Error(e.message);
      reportError(err, {
        source: "window.error",
        extra: { filename: e.filename, lineno: e.lineno, colno: e.colno },
      });
    }

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
