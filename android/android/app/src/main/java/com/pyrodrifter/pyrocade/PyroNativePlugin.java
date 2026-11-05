package com.pyrodrifter.pyrocade;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;

/**
 * The Android side of PyroCade's window.api: what Electron's main process does on the desktop,
 * reduced to what the proof of concept needs.
 *  - pickFolder:        Storage Access Framework folder picker, permission kept across restarts
 *  - scanTree:          lists files in a picked folder by extension
 *  - launch:            starts an emulator with an explicit Intent
 *  - installedPackages: which emulator apps are installed (needs the <queries> in the manifest)
 *  - openStore/openApp: Play Store page or the app itself
 */
@CapacitorPlugin(name = "PyroNative")
public class PyroNativePlugin extends Plugin {
    private static final String EXTERNAL_STORAGE = "com.android.externalstorage.documents";
    private static final int MAX_FILES = 50000;

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        JSObject ret = new JSObject();
        if (uri == null) { ret.put("uri", null); call.resolve(ret); return; }
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("Android did not allow PyroCade to keep access to this folder: " + e.getMessage());
            return;
        }
        String docId = DocumentsContract.getTreeDocumentId(uri);
        ret.put("uri", uri.toString());
        ret.put("label", docId);
        ret.put("path", pathFor(uri, docId));
        call.resolve(ret);
    }

    /** Lists files below a picked folder whose extension is in "extensions". Skips hidden folders. */
    @PluginMethod
    public void scanTree(PluginCall call) {
        String uriText = call.getString("uri");
        if (uriText == null || !uriText.startsWith("content://")) { call.reject("Not a folder chosen on this device. Use Browse… to choose it again."); return; }
        Uri tree = Uri.parse(uriText);
        int maxDepth = call.getInt("maxDepth", 4);
        Set<String> exts = new HashSet<>();
        JSArray list = call.getArray("extensions", new JSArray());
        for (int i = 0; i < list.length(); i++) {
            try { exts.add(list.getString(i).toLowerCase(Locale.ROOT)); } catch (JSONException ignored) {}
        }
        boolean allowed = false;
        for (android.content.UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(tree) && p.isReadPermission()) { allowed = true; break; }
        }
        if (!allowed) { call.reject("PyroCade no longer has access to this folder. Choose it again with Browse…"); return; }

        ContentResolver resolver = getContext().getContentResolver();
        JSArray files = new JSArray();
        ArrayDeque<String[]> queue = new ArrayDeque<>(); // { documentId, relative path, depth }
        queue.add(new String[] { DocumentsContract.getTreeDocumentId(tree), "", "0" });
        String[] cols = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
        };
        try {
            while (!queue.isEmpty() && files.length() < MAX_FILES) {
                String[] dir = queue.poll();
                int depth = Integer.parseInt(dir[2]);
                Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, dir[0]);
                try (Cursor c = resolver.query(children, cols, null, null, null)) {
                    if (c == null) continue;
                    while (c.moveToNext()) {
                        String id = c.getString(0), name = c.getString(1), mime = c.getString(2);
                        if (name == null || name.startsWith(".")) continue;
                        String rel = dir[1].isEmpty() ? name : dir[1] + "/" + name;
                        if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                            if (depth < maxDepth) queue.add(new String[] { id, rel, String.valueOf(depth + 1) });
                            continue;
                        }
                        int dot = name.lastIndexOf('.');
                        if (dot < 0 || !exts.contains(name.substring(dot).toLowerCase(Locale.ROOT))) continue;
                        JSObject f = new JSObject();
                        f.put("name", name);
                        f.put("rel", rel);
                        f.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                        f.put("size", c.isNull(3) ? 0 : c.getLong(3));
                        String path = pathFor(tree, id);
                        if (path != null) f.put("path", path);
                        files.put(f);
                    }
                }
            }
        } catch (Exception e) {
            call.reject("Could not read the folder: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("files", files);
        call.resolve(ret);
    }

    /**
     * Starts an emulator. Options: package, activity, action, data (URI), extras (strings),
     * grantUri (a document URI the emulator may read: granted through the Intent and directly).
     */
    @PluginMethod
    public void launch(PluginCall call) {
        String pkg = call.getString("package"), activity = call.getString("activity");
        if (pkg == null) { call.reject("No emulator package given"); return; }
        Intent intent = new Intent(call.getString("action", Intent.ACTION_MAIN));
        if (activity != null) intent.setClassName(pkg, activity); else intent.setPackage(pkg);
        String data = call.getString("data");
        if (data != null) intent.setData(Uri.parse(data));
        JSObject extras = call.getObject("extras", new JSObject());
        for (Iterator<String> it = extras.keys(); it.hasNext(); ) {
            String key = it.next();
            intent.putExtra(key, extras.optString(key, ""));
        }
        String grant = call.getString("grantUri");
        if (grant != null) {
            Uri g = Uri.parse(grant);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.setClipData(ClipData.newRawUri("rom", g)); // makes the grant cover URIs passed as extras
            try { getContext().grantUriPermission(pkg, g, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (SecurityException ignored) {}
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("This emulator version does not accept games from other apps (" + (activity != null ? activity : pkg) + " not found).");
        } catch (SecurityException e) {
            call.reject("Android blocked starting the emulator: " + e.getMessage());
        }
    }

    @PluginMethod
    public void installedPackages(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        JSObject found = new JSObject();
        JSONArray list = call.getArray("packages", new JSArray());
        for (int i = 0; i < list.length(); i++) {
            String pkg = list.optString(i, null);
            if (pkg == null) continue;
            try {
                PackageInfo info = pm.getPackageInfo(pkg, 0);
                found.put(pkg, info.versionName == null ? "" : info.versionName);
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        JSObject ret = new JSObject();
        ret.put("installed", found);
        call.resolve(ret);
    }

    @PluginMethod
    public void openStore(PluginCall call) {
        String pkg = call.getString("package");
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getActivity().startActivity(intent); }
        catch (ActivityNotFoundException e) {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(call.getString("package", ""));
        if (intent == null) { call.reject("That app is not installed."); return; }
        getActivity().startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        call.resolve();
    }

    @PluginMethod
    public void appInfo(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            ret.put("version", info.versionName + "-android");
        } catch (PackageManager.NameNotFoundException e) { ret.put("version", "android"); }
        call.resolve(ret);
    }

    /**
     * File system path of a document on internal storage or an SD card, for emulators such as
     * RetroArch that open games by path. "primary:ROMs/snes/x.sfc" -> /storage/emulated/0/ROMs/snes/x.sfc,
     * "1234-ABCD:ROMs/x.sfc" -> /storage/1234-ABCD/ROMs/x.sfc. Other providers have no path.
     */
    private static String pathFor(Uri tree, String documentId) {
        if (!EXTERNAL_STORAGE.equals(tree.getAuthority()) || documentId == null) return null;
        int colon = documentId.indexOf(':');
        if (colon < 0) return null;
        String volume = documentId.substring(0, colon), rest = documentId.substring(colon + 1);
        String root = "primary".equalsIgnoreCase(volume) ? "/storage/emulated/0" : "/storage/" + volume;
        return rest.isEmpty() ? root : root + "/" + rest;
    }
}
