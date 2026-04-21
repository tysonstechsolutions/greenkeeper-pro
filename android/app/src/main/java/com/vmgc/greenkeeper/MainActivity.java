package com.vmgc.greenkeeper;

import com.getcapacitor.BridgeActivity;

/**
 * Plain Capacitor bridge activity. No custom WebView request rewriting —
 * the app's routes are all fully static (no [id] segments in the Next
 * export), so Capacitor's LocalServer finds every index.html without help.
 * Dynamic "views" are reached via query parameters (e.g. /tasks/view?id=abc)
 * which leave the URL path untouched from the server's perspective.
 */
public class MainActivity extends BridgeActivity {
}
