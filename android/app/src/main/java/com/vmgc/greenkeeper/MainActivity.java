package com.vmgc.greenkeeper;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.util.Collections;
import java.util.Map;

/**
 * MainActivity with one enhancement over plain BridgeActivity: a
 * dynamic-route asset fallback for the Next.js static export.
 *
 * Problem: the Next app uses dynamic routes like /tasks/[id], /equipment/[id],
 * etc. In static export mode those routes are pre-rendered to a SINGLE
 * placeholder directory ("_", created via generateStaticParams), e.g.
 * /tasks/_/index.html. At runtime, when the user taps a task link, the
 * WebView requests /tasks/<real-id>/index.html which does NOT exist in
 * the APK assets — the request 404s and the Link click effectively
 * becomes a no-op, stranding the user on the previous page (typically
 * the dashboard).
 *
 * Fix: wrap Capacitor's BridgeWebViewClient and, after its normal asset
 * lookup returns null, retry the same request with the path rewritten
 * to the "_" placeholder. The Next.js client-side router then reads the
 * original real id from window.location (via useParams), so the rendered
 * page still shows the correct task/equipment/etc.
 *
 * Only paths matching known dynamic-route prefixes are rewritten, and
 * reserved sub-segments (new, edit, scan, etc.) are left alone so the
 * real static pages at those sub-paths keep working.
 */
public class MainActivity extends BridgeActivity {

    // URL prefixes for every dynamic route in the Next app. Keep the
    // most specific prefix (e.g. /course-map/green/) BEFORE its parent
    // (/course-map/) so startsWith matches it first.
    private static final String[] DYNAMIC_PREFIXES = {
        "/course-map/green/",
        "/course-map/",
        "/polls/results/",
        "/settings/staff/",
        "/tasks/",
        "/equipment/",
        "/assets/",
        "/chemicals/",
        "/plan/",
        "/tournaments/",
    };

    // Segments that are valid static sub-paths under a dynamic-prefix
    // directory. If the first URL segment after a dynamic prefix is one
    // of these, we leave the path alone — those pages actually exist.
    private static final String[] RESERVED_SEGMENTS = {
        "_", "new", "edit", "scan", "manage", "calendar", "morning",
        "time-off", "crews", "pin-sheet", "pins",
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final Bridge bridge = getBridge();
        final WebView webView = bridge.getWebView();
        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                WebView view,
                WebResourceRequest request
            ) {
                // Rewrite dynamic routes BEFORE delegating to the normal
                // asset lookup. Capacitor's LocalServer falls back to
                // serving /index.html for any unmatched path, which in our
                // app is the dashboard. If we let that fallback run first
                // on /tasks/<real-id>/, the user ends up on the dashboard
                // — which is the exact symptom the user reported ("click
                // overdue task, get sent back to dashboard"). So we intercept
                // BEFORE the SPA fallback, rewrite to /tasks/_/, and only
                // THEN hand off to super.
                Uri uri = request.getUrl();
                String path = uri != null ? uri.getPath() : null;
                if (path != null) {
                    String rewritten = rewriteDynamicPath(path);
                    if (rewritten != null) {
                        Uri newUri = uri.buildUpon().path(rewritten).build();
                        return super.shouldInterceptRequest(
                            view,
                            new RewrittenRequest(newUri, request)
                        );
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }
        });
    }

    static String rewriteDynamicPath(String path) {
        for (String prefix : DYNAMIC_PREFIXES) {
            if (!path.startsWith(prefix)) continue;

            String rest = path.substring(prefix.length());
            if (rest.isEmpty()) return null; // List page path, no rewrite.

            int nextSlash = rest.indexOf('/');
            String segment = nextSlash == -1 ? rest : rest.substring(0, nextSlash);
            if (segment.isEmpty()) return null;

            // Don't rewrite if the next segment is a known static sibling.
            for (String reserved : RESERVED_SEGMENTS) {
                if (segment.equals(reserved)) return null;
            }

            String suffix = nextSlash == -1 ? "" : rest.substring(nextSlash);
            return prefix + "_" + suffix;
        }
        return null;
    }

    /**
     * Minimal WebResourceRequest that swaps the URL on an existing request.
     * Delegates all other fields (method, headers, flags) to the original
     * so Capacitor's local server receives the same context it would have.
     */
    private static final class RewrittenRequest implements WebResourceRequest {
        private final Uri url;
        private final WebResourceRequest original;

        RewrittenRequest(Uri url, WebResourceRequest original) {
            this.url = url;
            this.original = original;
        }

        @Override public Uri getUrl() { return url; }
        @Override public boolean isForMainFrame() { return original.isForMainFrame(); }
        @Override public boolean isRedirect() { return original.isRedirect(); }
        @Override public boolean hasGesture() { return original.hasGesture(); }
        @Override public String getMethod() { return original.getMethod(); }
        @Override public Map<String, String> getRequestHeaders() {
            Map<String, String> headers = original.getRequestHeaders();
            return headers != null ? headers : Collections.emptyMap();
        }
    }
}
