package com.vmgc.greenkeeper;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * Plain Capacitor bridge activity, with one explicit override:
 *
 * Back-button / back-gesture handling — on Android 13+ the system back
 * gesture (or 3-button back) is no longer auto-routed through the WebView
 * by default. Without this callback, the gesture finishes the activity
 * (the user perceives this as "the app closed") instead of navigating to
 * the previous in-app page.
 *
 * The callback walks WebView.canGoBack() / goBack() so HTML5 history is
 * respected. When there's no more history to pop (e.g. user is on the
 * dashboard right after login), we disable the callback and re-dispatch
 * the back event, which closes the activity — matching native expectations.
 *
 * The app's routes are all fully static (no [id] segments in the Next
 * export), so Capacitor's LocalServer finds every index.html without help.
 * Dynamic "views" are reached via query parameters (e.g. /tasks/view?id=abc)
 * which leave the URL path untouched from the server's perspective.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge != null && bridge.getWebView() != null && bridge.getWebView().canGoBack()) {
                    bridge.getWebView().goBack();
                } else {
                    // No more in-app history — fall through to default behavior
                    // (closes the activity, which is what the user expects when
                    // they're already at the root of the app's history stack).
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }
}
