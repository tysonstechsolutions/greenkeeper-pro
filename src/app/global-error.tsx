// src/app/global-error.tsx
"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html>
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-background text-foreground">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-6" />
          <h1 className="text-2xl font-semibold mb-2">Application Error</h1>
          <p className="text-gray-600 mb-6 text-center max-w-md">
            A critical error occurred. Please refresh the page to continue.
          </p>
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Page
          </button>
        </div>
      </body>
    </html>
  );
}
