"use client";

import { useEffect, useRef } from "react";

/**
 * Swagger UI rendered via CDN — no npm package required.
 * Loads swagger-ui-dist from unpkg, points it at our /api/openapi endpoint.
 */
export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Dynamically inject Swagger UI CSS + JS from CDN
    const cssId = "swagger-ui-css";
    if (!document.getElementById(cssId)) {
      const link  = document.createElement("link");
      link.id     = cssId;
      link.rel    = "stylesheet";
      link.href   = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
      document.head.appendChild(link);
    }

    const scriptId = "swagger-ui-js";
    if (!document.getElementById(scriptId)) {
      const script    = document.createElement("script");
      script.id       = scriptId;
      script.src      = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";
      script.onload   = initSwagger;
      document.body.appendChild(script);
    } else {
      initSwagger();
    }

    function initSwagger() {
      const SwaggerUIBundle = (window as unknown as { SwaggerUIBundle: (opts: unknown) => void }).SwaggerUIBundle;
      if (!SwaggerUIBundle || !containerRef.current) return;
      SwaggerUIBundle({
        url:           "/api/openapi",
        domNode:       containerRef.current,
        deepLinking:   true,
        presets:       [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).SwaggerUIBundle.presets.apis,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).SwaggerUIBundle.SwaggerUIStandalonePreset,
        ],
        layout:        "BaseLayout",
        defaultModelsExpandDepth: -1,  // hide schemas section by default
        tryItOutEnabled: true,
      });
    }

    return () => {
      // Clean up the container on unmount to prevent double-init
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-zinc-50 px-8 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-zinc-800">API Documentation</h1>
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            OpenAPI 3.0
          </span>
          <a
            href="/api/openapi"
            target="_blank"
            className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-mono"
          >
            /api/openapi ↗
          </a>
        </div>
        <p className="text-sm text-zinc-500 mt-1">
          16 endpoints · CQRS · Saga · DLQ · SSE · Circuit Breaker · Chaos Engineering
        </p>
      </div>

      {/* Swagger UI mounts here */}
      <div ref={containerRef} className="swagger-container" />

      {/* Override Swagger UI dark/light inconsistency */}
      <style>{`
        .swagger-container .swagger-ui { font-family: inherit; }
        .swagger-container .swagger-ui .topbar { display: none; }
        .swagger-container .swagger-ui .info { padding: 2rem; }
        .swagger-container .swagger-ui .info .title { font-size: 1.5rem; }
        .swagger-container .swagger-ui .scheme-container { padding: 1rem 2rem; }
        .swagger-container .swagger-ui .opblock-tag { font-size: 1rem; }
      `}</style>
    </div>
  );
}
