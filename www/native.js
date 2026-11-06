// Bridge to the Android app (Capacitor). In a normal browser every function falls back to web behaviour.
(function () {
  const cap = window.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.nativePromise);
  const call = (plugin, method, opts) => cap.nativePromise(plugin, method, opts || {});

  const blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

  // Save a file to the app cache and open Android's share sheet (WhatsApp, Drive, Files...)
  async function shareFile(blob, name, text) {
    const safe = name.replace(/[\\/:*?"<>|]/g, '-');
    const { uri } = await call('Filesystem', 'writeFile', { path: safe, data: await blobToB64(blob), directory: 'CACHE', recursive: true });
    try { await call('Share', 'share', { title: safe, text: text || undefined, files: [uri], dialogTitle: 'إرسال' }); }
    catch (e) { if (!/cancel/i.test(String(e && (e.message || e)))) throw e; return false; }
    return true;
  }
  async function shareText(text) { try { await call('Share', 'share', { text, dialogTitle: 'إرسال' }); } catch (e) { /* cancelled */ } }

  // External links (wa.me, maps) leave the app and open in WhatsApp / Maps
  function openUrl(url) { if (isNative) window.location.href = url; else window.open(url, '_blank'); }

  // Fingerprint, with the phone's own PIN/pattern as fallback
  async function unlock() {
    if (!isNative) return true;
    try { const r = await call('BiometricAuthNative', 'checkBiometry'); if (!r.isAvailable && !r.deviceIsSecure) return true; } catch (e) { return true; }
    for (;;) {
      try {
        await call('BiometricAuthNative', 'internalAuthenticate', {
          reason: 'افتح تطبيق العروض', androidTitle: 'Type-G عروض', androidSubtitle: 'بصمة أو قفل الموبايل',
          cancelTitle: 'إلغاء', allowDeviceCredential: true, androidConfirmationRequired: false });
        return true;
      } catch (e) {
        await new Promise(res => {
          document.body.insertAdjacentHTML('beforeend', `<div id="lockv" style="position:fixed;inset:0;background:#123a6b;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:50;font-family:inherit">
            <div style="font-size:22px;font-weight:700">Type-G Smart</div><div style="opacity:.85">التطبيق مقفول</div>
            <button style="background:#f28a1e;color:#fff;border:0;border-radius:10px;padding:12px 26px;font:inherit;font-weight:700">فتح</button></div>`);
          const v = document.getElementById('lockv'); v.querySelector('button').onclick = () => { v.remove(); res(); };
        });
      }
    }
  }

  // Follow-up reminders: one notification per quote that's waiting for a reply
  async function scheduleFollowups(items) {
    if (!isNative) return;
    try {
      const p = await call('LocalNotifications', 'checkPermissions');
      if (p.display !== 'granted') { const r = await call('LocalNotifications', 'requestPermissions'); if (r.display !== 'granted') return; }
      const pending = await call('LocalNotifications', 'getPending');
      if (pending.notifications && pending.notifications.length) await call('LocalNotifications', 'cancel', { notifications: pending.notifications.map(n => ({ id: n.id })) });
      const now = Date.now();
      const list = items.map((it, i) => {
        let at = new Date(Math.max(it.at, now + 60e3));
        if (at.getHours() < 9) at.setHours(9, 0, 0, 0); else if (at.getHours() >= 21) { at.setDate(at.getDate() + 1); at.setHours(9, 0, 0, 0); }
        return { id: 1000 + i, title: 'متابعة عرض', body: it.text, schedule: { at: at.toISOString(), allowWhileIdle: true } };
      });
      if (list.length) await call('LocalNotifications', 'schedule', { notifications: list });
    } catch (e) { console.warn('notifications', e); }
  }

  window.Native = { isNative, shareFile, shareText, openUrl, unlock, scheduleFollowups };
})();
