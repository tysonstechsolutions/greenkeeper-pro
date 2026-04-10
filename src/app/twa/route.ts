// Ultra-lightweight landing page for PWABuilder analysis.
//
// Why a route handler and not a page?
// Page components are wrapped by the root layout, which loads Sentry,
// Vercel Analytics, Speed Insights, AuthProvider, Supabase client, etc.
// That triggers so many Chrome DevTools Protocol CSP events during page load
// that PWABuilder's Puppeteer session times out before it can finish
// analysing the manifest. A route handler bypasses the root layout entirely
// and returns a ~2 KB static HTML document with nothing but a manifest link
// and a service worker registration — exactly what PWABuilder needs.

export const dynamic = "force-static";

const HTML = `<\!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>VMGC — Championship Golf Course Management</title>
    <meta name="description" content="Championship Golf Course Management — Veterans Memorial GC" />
    <meta name="theme-color" content="#1B4332" />
    <meta name="application-name" content="VMGC" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="VMGC" />
    <meta name="mobile-web-app-capable" content="yes" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512x512.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #1B4332;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
      }
      .wrap { padding: 2rem; max-width: 28rem; }
      h1 { margin: 0 0 0.5rem; font-size: 1.75rem; }
      p { margin: 0 0 1.5rem; opacity: 0.85; line-height: 1.5; }
      a {
        display: inline-block;
        background: #fff;
        color: #1B4332;
        text-decoration: none;
        padding: 0.75rem 1.5rem;
        border-radius: 0.5rem;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1>VMGC</h1>
      <p>Championship Golf Course Management for Veterans Memorial Golf Course.</p>
      <a href="/pin-login">Open App</a>
    </main>
    <script>
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
          navigator.serviceWorker.register("/sw.js").catch(function () {});
        });
      }
    </script>
  </body>
</html>
`;

export function GET() {
  return new Response(HTML, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
