package com.typegsmart.quotes;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.ContactsContract.CommonDataKinds;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Opens the phone's contact list so the user picks one person.
 * Name + number come from the picked entry (no permission needed).
 * Address / email / company / note are read only if the user allows contacts access.
 */
@CapacitorPlugin(name = "ContactPicker", permissions = @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }))
public class ContactPickerPlugin extends Plugin {

    private JSObject picked = new JSObject();

    @PluginMethod
    public void pick(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_PICK, CommonDataKinds.Phone.CONTENT_URI);
        startActivityForResult(call, i, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri uri = result.getData().getData();
        JSObject out = new JSObject();
        try (Cursor c = getContext().getContentResolver().query(uri,
                new String[] { CommonDataKinds.Phone.DISPLAY_NAME, CommonDataKinds.Phone.NUMBER, CommonDataKinds.Phone.CONTACT_ID }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                out.put("name", c.getString(0));
                out.put("phone", c.getString(1));
                out.put("contactId", c.getString(2));
            }
        } catch (Exception e) {
            call.reject("read failed: " + e.getMessage());
            return;
        }
        picked = out;
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            finish(call);
        } else {
            requestPermissionForAlias("contacts", call, "permDone");
        }
    }

    @PermissionCallback
    private void permDone(PluginCall call) {
        finish(call);
    }

    private void finish(PluginCall call) {
        JSObject out = picked;
        String id = out.getString("contactId");
        if (id != null && getPermissionState("contacts") == PermissionState.GRANTED) {
            out.put("address", one(id, CommonDataKinds.StructuredPostal.CONTENT_ITEM_TYPE, CommonDataKinds.StructuredPostal.FORMATTED_ADDRESS));
            out.put("email", one(id, CommonDataKinds.Email.CONTENT_ITEM_TYPE, CommonDataKinds.Email.ADDRESS));
            out.put("company", one(id, CommonDataKinds.Organization.CONTENT_ITEM_TYPE, CommonDataKinds.Organization.COMPANY));
            out.put("note", one(id, CommonDataKinds.Note.CONTENT_ITEM_TYPE, CommonDataKinds.Note.NOTE));
        }
        out.remove("contactId");
        call.resolve(out);
    }

    private String one(String contactId, String mime, String column) {
        try (Cursor c = getContext().getContentResolver().query(ContactsContract.Data.CONTENT_URI, new String[] { column },
                ContactsContract.Data.CONTACT_ID + "=? AND " + ContactsContract.Data.MIMETYPE + "=?", new String[] { contactId, mime }, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        return null;
    }
}
