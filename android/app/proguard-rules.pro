# ──────────────────────────────────────────────────────────────────────────
# ProGuard / R8 rules for the VMGC GreenKeeper Android release build.
#
# minifyEnabled=true + shrinkResources=true in app/build.gradle cut the
# APK size roughly in half. The rules below prevent R8 from stripping
# classes that Capacitor, its plugins, and Supabase reach via
# reflection — without these, the release APK runs but plugin calls
# silently fail (e.g. Camera.getPhoto returns never, BarcodeScanner
# throws ClassNotFoundException).
# ──────────────────────────────────────────────────────────────────────────

# Keep stack traces useful — required for Play Console ANR/crash reports.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Capacitor core ──────────────────────────────────────────────────────────
# Capacitor plugins are discovered by reflection from the class name.
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.annotation.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod *;
}

# Bridge uses reflection to call @JavascriptInterface methods.
-keep @android.webkit.JavascriptInterface class * { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Capacitor plugins we ship ──────────────────────────────────────────────
-keep class com.capacitorjs.plugins.camera.** { *; }
-keep class com.capacitorjs.plugins.filesystem.** { *; }
-keep class com.capacitorjs.plugins.preferences.** { *; }
-keep class com.capacitorjs.plugins.pushnotifications.** { *; }
-keep class com.capacitorjs.plugins.splashscreen.** { *; }
-keep class com.capacitorjs.plugins.statusbar.** { *; }
-keep class io.capawesome.capacitorjs.plugins.mlkit.barcodescanning.** { *; }

# ── ML Kit barcode scanner — Google's library uses reflection internally ──
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.vision.** { *; }
-dontwarn com.google.mlkit.**
-dontwarn com.google.android.gms.**

# ── Firebase Cloud Messaging (push notifications) ──────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.measurement.** { *; }
-dontwarn com.google.firebase.**

# ── Supabase / OkHttp / Kotlin ─────────────────────────────────────────────
# Supabase Android client isn't used directly (we hit it via JS/WebView),
# but OkHttp is pulled in as a transitive via FCM + GMS. Keep the common
# reflection targets so Android-side SSL + retrofit work.
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses

# ── Kotlin metadata (ML Kit + some Capacitor internals are Kotlin) ─────────
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-dontwarn kotlinx.**

# ── WebView JavaScript interface (Capacitor bridge) ────────────────────────
# The WebView loads local assets; keep any class the web layer might
# reach into. Capacitor's @JavascriptInterface handling is covered above
# but be explicit for the app's own MainActivity in case we ever add
# custom bridges.
-keep class com.vmgc.greenkeeper.** { *; }

# Suppress warnings for optional dependencies we don't use at runtime.
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn org.bouncycastle.**
