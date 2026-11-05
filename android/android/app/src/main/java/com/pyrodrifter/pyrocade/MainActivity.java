package com.pyrodrifter.pyrocade;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins have to be registered before the bridge starts.
        registerPlugin(PyroNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Honour the page's <meta name="viewport" width=…> so the desktop layout is scaled to fit
        // the screen instead of being squeezed (see the top of android-bridge.js).
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
    }
}
