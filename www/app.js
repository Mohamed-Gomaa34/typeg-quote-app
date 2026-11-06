(async function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const DAY = 864e5;
  const app = $('#app');

  const STATUS = { new: 'جديد', survey: 'معاينة', sent: 'عرض اتبعت', followup: 'متابعة', won: 'اتقفل', lost: 'اترفض' };
  const SOURCES = ['تليفون', 'واتساب', 'فيسبوك', 'معارف', 'أخرى'];
  const CATS = { cam: 'كاميرات', door: 'أبواب وعين سحرية', nvr: 'أجهزة تسجيل', switch: 'سويتشات', hdd: 'هاردات', cable: 'كابلات', access: 'انتركم وتحكم دخول',
    power: 'باور وسبليتر', mount: 'حوامل', acc: 'إكسسوارات وخامات', other: 'أخرى' };
  const SPEC_FIELDS = { cam: [['res', 'الدقة (ميجا)'], ['watt', 'الاستهلاك (وات)']], nvr: [['channels', 'عدد القنوات']],
    switch: [['ports', 'عدد البورتات'], ['poeW', 'قدرة PoE (وات)']], hdd: [['tb', 'الحجم (تيرا)']] };

  // ---------- state ----------
  let settings = await Store.get('settings');
  let catalog = await Store.get('catalog');
  if (!settings) { settings = SEED.settings; await Store.set('settings', settings); }
  else settings = Object.assign({}, SEED.settings, settings);
  if (!catalog) { catalog = []; await Store.set('catalog', catalog); }
  const saveSettings = () => Store.set('settings', settings);
  const saveCatalog = () => Store.set('catalog', catalog);
  const item = id => catalog.find(c => c.id === id);

  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200); }
  const daysSince = t => Math.floor((Date.now() - t) / DAY);
  const isDue = j => (j.status === 'sent' && j.sentAt && Date.now() - j.sentAt >= settings.followupDays * DAY) ||
    (j.status === 'followup' && j.followAt && Date.now() >= j.followAt);
  function newJob() {
    return { id: uid(), createdAt: Date.now(), updatedAt: Date.now(), status: 'new', history: [{ s: 'new', t: Date.now() }],
      client: { name: '', title: 'الأستاذ', phone: '', address: '', mapUrl: '', source: 'تليفون', referrer: '', notes: '' },
      locations: [], equip: { extras: [] }, extraLabor: [], opts: { showPhotos: false } };
  }
  function setStatus(j, s) { if (j.status === s) return; j.status = s; j.history.push({ s, t: Date.now() }); if (s === 'sent') j.sentAt = Date.now(); }
  // Saved immediately (IndexedDB put is cheap) so a re-render never reads stale data
  const saveJob = j => { j.updatedAt = Date.now(); return Store.putJob(j); };

  // ---------- router ----------
  async function route() {
    const p = location.hash.replace(/^#\/?/, '').split('/');
    document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.nav === (p[0] || 'home') || (p[0] === 'job' && a.dataset.nav === 'home')));
    window.scrollTo(0, 0);
    if (p[0] === 'job') return jobView(p[1], p[2] || 'client');
    if (p[0] === 'prices') return pricesView();
    if (p[0] === 'settings') return settingsView();
    return homeView(p[0] === 'f' ? p[1] : 'all');
  }
  window.addEventListener('hashchange', route);

  // ---------- home ----------
  async function homeView(filter) {
    const jobs = (await Store.jobs()).sort((a, b) => b.updatedAt - a.updatedAt);
    const due = jobs.filter(isDue);
    const shown = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);
    const totalOf = j => { try { return Calc.buildQuote(j, catalog, settings).total; } catch { return 0; } };
    app.innerHTML = `<header class="top"><h1><span class="dot"></span>Type-G Smart</h1><div class="sub">الطلبات والمعاينات والعروض</div></header><main>
      ${due.length ? `<div class="card due"><h3>محتاج متابعة النهارده (${due.length})</h3>${due.map(j => `
        <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <a class="grow" href="#/job/${j.id}/quote"><b>${esc(j.client.name || 'بدون اسم')}</b><div class="muted">${j.status === 'sent' ? 'العرض اتبعت من ' + daysSince(j.sentAt) + ' يوم' : 'ميعاد المتابعة جه'}</div></a>
          <button class="btn sm alt" data-st="followup" data-id="${j.id}">رد</button>
          <button class="btn sm ok" data-st="won" data-id="${j.id}">وافق</button>
          <button class="btn sm bad" data-st="lost" data-id="${j.id}">رفض</button></div>`).join('')}</div>` : ''}
      <div class="chips"><a class="chip ${filter === 'all' ? 'on' : ''}" href="#/">الكل (${jobs.length})</a>
        ${Object.entries(STATUS).map(([k, v]) => `<a class="chip ${filter === k ? 'on' : ''}" href="#/f/${k}">${v} (${jobs.filter(j => j.status === k).length})</a>`).join('')}</div>
      ${shown.length ? shown.map(j => `<a class="card job" href="#/job/${j.id}/${j.locations.length ? 'quote' : 'client'}">
        <div class="row"><span class="name grow">${esc(j.client.name || 'بدون اسم')}</span><span class="badge st-${j.status}">${STATUS[j.status]}</span></div>
        <div class="row muted" style="margin-top:4px"><span class="grow">${esc(j.client.address || '')}</span><span>${j.locations.length} كاميرا · ${fmt(totalOf(j))} ج</span></div></a>`).join('')
        : `<div class="empty">مفيش طلبات هنا.<br>دوس "طلب جديد" عشان تبدأ.</div>`}
      </main><button class="btn orange fab" id="new">+ طلب جديد</button>`;
    $('#new').onclick = async () => { const j = newJob(); await Store.putJob(j); location.hash = `#/job/${j.id}/client`; };
    app.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => {
      const j = await Store.job(b.dataset.id);
      if (b.dataset.st === 'followup') {
        const d = prompt('العميل رد. تتابع معاه بعد كام يوم؟ (اكتب 0 لو مش محتاج تذكير)', '2');
        if (d === null) return;
        j.followAt = Number(d) > 0 ? Date.now() + Number(d) * DAY : null;
      }
      setStatus(j, b.dataset.st); j.updatedAt = Date.now(); await Store.putJob(j); toast('اتسجل'); route();
    });
  }

  // ---------- job ----------
  async function jobView(id, tab) {
    const j = await Store.job(id);
    if (!j) { location.hash = '#/'; return; }
    const tabs = { client: 'العميل', survey: 'المعاينة', equip: 'الأجهزة', quote: 'العرض' };
    app.innerHTML = `<header class="top"><a class="back" href="#/">‹ الطلبات</a><h1>${esc(j.client.name || 'طلب جديد')}</h1>
      <div class="sub">${STATUS[j.status]}${j.quoteNo ? ' · عرض ' + esc(j.quoteNo) : ''}</div></header>
      <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<a href="#/job/${id}/${k}" class="${k === tab ? 'on' : ''}">${v}</a>`).join('')}</div>
      <main id="pane"></main>`;
    const pane = $('#pane');
    ({ client: clientTab, survey: surveyTab, equip: equipTab, quote: quoteTab })[tab](j, pane);
  }

  // bind inputs with data-k="path.to.field" to the job object
  function bind(root, obj, onChange) {
    root.querySelectorAll('[data-k]').forEach(el => {
      const path = el.dataset.k.split('.');
      const get = () => path.reduce((o, k) => o?.[k], obj);
      const v = get();
      if (el.type === 'checkbox') el.checked = !!v; else if (v != null) el.value = v;
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
        let val = el.type === 'checkbox' ? el.checked : el.value;
        if (el.type === 'number' && val !== '') val = Number(val);
        const last = path[path.length - 1];
        const tgt = path.slice(0, -1).reduce((o, k) => (o[k] = o[k] ?? {}), obj);
        tgt[last] = val;
        onChange && onChange(el);
      });
    });
  }

  function clientTab(j, pane) {
    pane.innerHTML = `<div class="card"><h3>بيانات العميل</h3>
      <div class="grid2"><div><label>اللقب</label><select data-k="client.title">${['الأستاذ', 'المهندس', 'الدكتور', 'الأستاذة', 'المهندسة', 'الدكتورة', 'السيد', 'السيدة'].map(t => `<option>${t}</option>`).join('')}</select></div>
      <div><label>الاسم</label><input data-k="client.name" placeholder="اسم العميل"></div></div>
      <label>التليفون</label><input data-k="client.phone" type="tel" inputmode="tel" placeholder="01xxxxxxxxx" dir="ltr">
      <label>العنوان</label><input data-k="client.address" placeholder="المنطقة، الشارع، رقم العمارة">
      <label>اللوكيشن</label><div class="row"><input class="grow" data-k="client.mapUrl" placeholder="رابط خرائط جوجل" dir="ltr"><button class="btn sm alt" id="geo">موقعي الحالي</button></div>
      ${j.client.mapUrl ? `<a href="${esc(j.client.mapUrl)}" target="_blank" rel="noopener" class="muted" data-ext>فتح على الخريطة</a>` : ''}
      <div class="grid2"><div><label>المصدر</label><select data-k="client.source">${SOURCES.map(s => `<option>${s}</option>`).join('')}</select></div>
      <div><label>مين رشحه</label><input data-k="client.referrer"></div></div>
      <label>ملاحظات (ليك بس)</label><textarea data-k="client.notes"></textarea></div>
      <div class="card"><h3>حالة الطلب</h3><select id="st">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${j.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="muted" style="margin-top:8px">${j.history.map(h => `${STATUS[h.s]}: ${new Date(h.t).toLocaleDateString('en-GB')}`).join(' ← ')}</div></div>
      <a class="btn block" href="#/job/${j.id}/survey">التالي: المعاينة ›</a>
      <div style="text-align:center;margin-top:18px"><button class="btn ghost" id="del">مسح الطلب</button></div>`;
    bind(pane, j, () => saveJob(j));
    $('#st').onchange = e => { setStatus(j, e.target.value); saveJob(j); toast('الحالة اتغيرت'); };
    $('#geo').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => {
      j.client.mapUrl = `https://maps.google.com/?q=${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`; saveJob(j); clientTab(j, pane); toast('الموقع اتسجل');
    }, () => toast('مقدرتش أجيب الموقع')) : toast('الموقع مش متاح');
    $('#del').onclick = async () => {
      if (!confirm('متأكد إنك عايز تمسح الطلب ده وكل صوره؟')) return;
      for (const l of j.locations) for (const pid of l.photos || []) await Store.delPhoto(pid);
      await Store.delJob(j.id); location.hash = '#/';
    };
  }

  const opts = (cat, sel, filter) => `<option value="">— اختار —</option>` + catalog.filter(c => c.cat === cat && (!filter || filter(c)))
    .map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc((c.brand && c.brand !== '—' ? c.brand + ' ' : '') + c.name)} — ${fmt(c.cost)}${c.date ? ' (' + esc(c.date) + ')' : ''}</option>`).join('');

  async function surveyTab(j, pane) {
    if (j.status === 'new') { setStatus(j, 'survey'); saveJob(j); }
    const q = Calc.buildQuote(j, catalog, settings);
    pane.innerHTML = `<div class="card"><div class="row"><span class="grow"><b>${j.locations.length}</b> مكان</span>
      <span class="muted">كابل ${fmt(q.cable.measured)} م ← ${fmt(q.cable.withReserve)} م بالاحتياطي · ${q.cable.boxes} كرتونة</span></div></div>
      <div id="locs"></div>
      <div class="row"><button class="btn grow" id="addNew">+ كاميرا جديدة</button><button class="btn alt grow" id="addRel">+ نقل كاميرا قائمة</button></div>
      <a class="btn block alt" style="margin-top:12px" href="#/job/${j.id}/equip">التالي: الأجهزة ›</a>`;
    const box = $('#locs');
    for (const [i, l] of j.locations.entries()) {
      const c = document.createElement('div');
      c.className = 'card loc' + (l.kind === 'relocate' ? ' reloc' : '');
      c.innerHTML = `<div class="row"><span class="num">${i + 1}</span><input class="grow" data-k="name" placeholder="اسم المكان (البوابة، الجراج...)">
        <button class="btn ghost" data-act="rm">✕</button></div>
        <div class="grid2"><div><label>النوع</label><select data-k="kind"><option value="new">كاميرا جديدة</option><option value="relocate">نقل كاميرا قائمة</option></select></div>
        <div><label>داخلي / خارجي</label><select data-k="place"><option value="out">خارجي</option><option value="in">داخلي</option></select></div></div>
        ${l.kind !== 'relocate' ? `<label>الكاميرا</label><select data-k="camId">${opts('cam', l.camId, x => !x.specs.place || x.specs.place === (l.place || 'out'))}</select>
        <label>الحامل</label><select data-k="mountId">${opts('mount', l.mountId)}</select>` : ''}
        <div class="grid2"><div><label>طول الكابل (متر)</label><input type="number" inputmode="decimal" data-k="cableM" dir="ltr"></div>
        <div><label>الارتفاع (متر)</label><input type="number" inputmode="decimal" data-k="height" dir="ltr"></div></div>
        <label><input type="checkbox" data-k="ladder">محتاج سلم / سقالة</label>
        <div class="grid2"><div><label>طريقة التركيب</label><input data-k="mounting" placeholder="حائط، سقف، عمود..."></div>
        <div><label>مصنعية استثنائية</label><input type="number" data-k="laborOverride" placeholder="${l.kind === 'relocate' ? settings.laborRelocate : settings.laborNew}" dir="ltr"></div></div>
        <label>ملاحظات</label><input data-k="notes">
        <div class="photos"></div>`;
      box.appendChild(c);
      bind(c, l, el => { saveJob(j); if (['kind', 'place'].includes(el.dataset.k)) surveyTab(j, pane); });
      c.querySelector('[data-act=rm]').onclick = async () => {
        if (!confirm('تمسح المكان ده؟')) return;
        for (const pid of l.photos || []) await Store.delPhoto(pid);
        j.locations.splice(i, 1); saveJob(j); surveyTab(j, pane);
      };
      renderPhotos(j, l, c.querySelector('.photos'));
    }
    const add = kind => { j.locations.push({ id: uid(), kind, place: 'out', name: '', cableM: '', photos: [] }); saveJob(j); surveyTab(j, pane);
      setTimeout(() => { const all = box.querySelectorAll('.loc'); all[all.length - 1]?.scrollIntoView({ behavior: 'smooth' }); }, 50); };
    $('#addNew').onclick = () => add('new'); $('#addRel').onclick = () => add('relocate');
  }

  async function renderPhotos(j, l, el) {
    l.photos = l.photos || [];
    el.innerHTML = '';
    for (const pid of l.photos) {
      const p = await Store.photo(pid); if (!p) continue;
      const d = document.createElement('div'); d.className = 'ph';
      d.innerHTML = `<img src="${p.data}"><button class="x">✕</button>`;
      d.querySelector('img').onclick = () => { const lb = document.createElement('div'); lb.className = 'lb'; lb.innerHTML = `<img src="${p.data}">`; lb.onclick = () => lb.remove(); document.body.appendChild(lb); };
      d.querySelector('.x').onclick = async () => { await Store.delPhoto(pid); l.photos = l.photos.filter(x => x !== pid); saveJob(j); renderPhotos(j, l, el); };
      el.appendChild(d);
    }
    const a = document.createElement('label'); a.className = 'addph'; a.innerHTML = '📷<input type="file" accept="image/*" capture="environment" hidden>';
    a.querySelector('input').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const data = await shrink(f);
      const id = uid(); await Store.putPhoto({ id, jobId: j.id, locId: l.id, data, t: Date.now() });
      l.photos.push(id); saveJob(j); renderPhotos(j, l, el);
    };
    el.appendChild(a);
  }
  // Resize photos to max 1600px, JPEG ~75% to keep storage and backups small
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const m = 1600, r = Math.min(1, m / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', 0.75)); };
      img.onerror = rej; img.src = url;
    });
  }

  function equipTab(j, pane) {
    j.equip = j.equip || { extras: [] }; j.equip.extras = j.equip.extras || []; j.extraLabor = j.extraLabor || []; j.opts = j.opts || {};
    const cams = j.locations.map(l => item(l.camId)).filter(Boolean);
    const hddOpts = `<option value="">— من غير هارد —</option>` + catalog.filter(c => c.cat === 'hdd').map(c => {
      const d = Calc.hddDays(c.specs.tb, cams.length ? cams : j.locations.map(() => ({ specs: { res: 4 } })));
      return `<option value="${c.id}" ${c.id === j.equip.hddId ? 'selected' : ''}>${esc(c.name)} — ${fmt(c.cost)} · حوالي ${d} يوم تسجيل</option>`; }).join('');
    const hasHdd = catalog.some(c => c.cat === 'hdd'), hasNvr = catalog.some(c => c.cat === 'nvr');
    pane.innerHTML = `<div class="card"><h3>الأجهزة الأساسية</h3>
      <label>جهاز التسجيل</label><select data-k="equip.nvrId">${opts('nvr', j.equip.nvrId)}</select>
      ${!hasNvr ? '<div class="muted">لسه مفيش أجهزة تسجيل في الأسعار.</div>' : ''}
      <label>السويتش</label><select data-k="equip.switchId">${opts('switch', j.equip.switchId)}</select>
      <label>الهارد (الأيام تقريبية لتسجيل متواصل)</label><select data-k="equip.hddId">${hddOpts}</select>
      ${!hasHdd ? '<div class="muted">لسه مفيش هاردات في الأسعار.</div>' : ''}</div>
      <div class="card"><h3>بنود إضافية</h3><div id="extras"></div><button class="btn sm alt" id="addX">+ بند من الأسعار</button></div>
      <div class="card"><h3>مصنعية إضافية</h3><div class="muted">زي برمجة الجهاز، تركيب راك...</div><div id="xlab"></div><button class="btn sm alt" id="addL">+ بند مصنعية</button></div>
      <div class="card"><h3>إعدادات العرض ده</h3>
      <div class="grid2"><div><label>نسبة الربح %</label><input type="number" data-k="opts.markup" placeholder="${settings.markup}" dir="ltr"></div>
      <div><label>احتياطي الكابل %</label><input type="number" data-k="opts.cableReserve" placeholder="${settings.cableReserve}" dir="ltr"></div></div>
      <label>نوع الكابل</label><select data-k="opts.cableId">${catalog.filter(c => c.cat === 'cable' && c.specs && (c.specs.perMeter || c.specs.boxM)).map(c =>
        `<option value="${c.id}" ${c.id === (j.opts.cableId || (catalog.find(x => x.cat === 'cable' && x.specs && x.specs.default) || {}).id) ? 'selected' : ''}>${esc(c.name)} — ${fmt(Math.round((c.specs.perMeter ? c.cost : c.cost / c.specs.boxM) * 10) / 10)} للمتر</option>`).join('')}</select>
      <label>احتياطي زيادة على الإجمالي (متر)</label><input type="number" data-k="opts.extraReserveM" placeholder="0" dir="ltr">
      <label><input type="checkbox" data-k="opts.cableLump">اكتب الكابلات والخراطيم مقطوعية</label>
      <div id="lump" style="${j.opts.cableLump ? '' : 'display:none'}"><div class="grid2"><div><label>سعر المقطوعية للعميل</label><input type="number" data-k="opts.lumpPrice" dir="ltr"></div>
      <div><label>تكلفتها عليك</label><input type="number" data-k="opts.lumpCost" dir="ltr"></div></div></div>
      <label><input type="checkbox" data-k="opts.showPhotos">اعرض صور المواقع في عرض العميل</label></div>
      <a class="btn block orange" href="#/job/${j.id}/quote">شوف العرض ›</a>`;
    bind(pane, j, el => { saveJob(j); if (el.dataset.k === 'opts.cableLump') $('#lump').style.display = el.checked ? '' : 'none'; });
    const xs = $('#extras');
    j.equip.extras.forEach((x, i) => {
      const r = document.createElement('div'); r.className = 'row'; r.style.marginBottom = '8px';
      r.innerHTML = `<select class="grow" data-k="itemId">${catalog.map(c => `<option value="${c.id}" ${c.id === x.itemId ? 'selected' : ''}>${esc(c.name)} — ${fmt(c.cost)}</option>`).join('')}</select>
        <input type="number" data-k="qty" style="width:70px" dir="ltr"><button class="btn ghost">✕</button>`;
      bind(r, x, () => saveJob(j)); r.querySelector('button').onclick = () => { j.equip.extras.splice(i, 1); saveJob(j); equipTab(j, pane); };
      xs.appendChild(r);
    });
    $('#addX').onclick = () => { j.equip.extras.push({ itemId: catalog[0].id, qty: 1 }); saveJob(j); equipTab(j, pane); };
    const xl = $('#xlab');
    j.extraLabor.forEach((x, i) => {
      const r = document.createElement('div'); r.className = 'row'; r.style.marginBottom = '8px';
      r.innerHTML = `<input class="grow" data-k="name" placeholder="البند"><input type="number" data-k="qty" style="width:56px" placeholder="1" dir="ltr">
        <input type="number" data-k="price" style="width:84px" placeholder="السعر" dir="ltr"><button class="btn ghost">✕</button>`;
      bind(r, x, () => saveJob(j)); r.querySelector('button').onclick = () => { j.extraLabor.splice(i, 1); saveJob(j); equipTab(j, pane); };
      xl.appendChild(r);
    });
    $('#addL').onclick = () => { j.extraLabor.push({ name: '', qty: 1, price: '' }); saveJob(j); equipTab(j, pane); };
  }

  async function photosFor(j) {
    if (!j.opts.showPhotos) return [];
    const out = [];
    for (const [i, l] of j.locations.entries()) for (const pid of l.photos || []) { const p = await Store.photo(pid); if (p) out.push({ data: p.data, label: `${i + 1}. ${l.name || ''}` }); }
    return out;
  }
  function ensureQuoteNo(j) {
    if (!j.quoteNo) { j.quoteNo = `TG-${new Date().getFullYear()}-${String(settings.nextQuoteNo).padStart(3, '0')}`; settings.nextQuoteNo++; saveSettings(); }
    j.quoteDate = Date.now();
  }
  async function shareOrDownload(blob, name, text) {
    if (Native.isNative) return Native.shareFile(blob, name, text);
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  }
  const waNumber = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '2' + d; else if (d.startsWith('1') && d.length === 10) d = '20' + d; return d; };

  function quoteTab(j, pane) {
    const q = Calc.buildQuote(j, catalog, settings);
    const msg = `أهلاً ${j.client.title || ''} ${j.client.name || ''}، مرفق عرض السعر رقم ${j.quoteNo || ''} لتوريد وتركيب الكاميرات. العرض ساري لمدة ${settings.validityDays} يوم. تحت أمرك في أي استفسار.\nمحمد جمعة — Type-G Smart`;
    pane.innerHTML = `${q.warnings.length ? q.warnings.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('') : (q.lines.length ? '<div class="okbox">✓ مفيش تعارض في الأجهزة</div>' : '')}
      <div class="card">${q.lines.length ? `<table class="q"><tr><th>البيان</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
        ${q.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="n">${fmt(l.qty)} ${l.unit === 'متر' ? 'م' : ''}</td><td class="n">${fmt(l.sell)}</td><td class="n">${fmt(l.qty * l.sell)}</td></tr>`).join('')}</table>
        <div class="tot"><span>الإجمالي</span><span>${fmt(q.total)} ج</span></div>
        <div class="muted">المقدم ${settings.depositPct}% عند التوريد: ${fmt(q.deposit)} · بعد التسليم: ${fmt(q.rest)}</div>` : '<div class="empty">لسه مفيش بنود. ابدأ من المعاينة.</div>'}</div>
      ${q.lines.length ? `<div class="card" style="background:#f8fafc"><h3>ليك بس</h3><div class="row muted"><span class="grow">التكلفة: ${fmt(q.costTotal)}</span><span class="grow">ربح المواد: ${fmt(q.matProfit)}</span><span>المصنعية: ${fmt(q.laborTotal)}</span></div></div>
      <button class="btn block orange" id="send">ابعت العرض للعميل (PDF)</button>
      <div class="row" style="margin-top:8px"><button class="btn alt grow" id="prev">شوف PDF العميل</button><button class="btn alt grow" id="intl">النسخة الداخلية</button></div>
      <div class="row" style="margin-top:8px"><button class="btn alt grow" id="wa">افتح محادثة العميل</button><button class="btn alt grow" id="bom">قائمة الخامات</button></div>
      <div class="card" style="margin-top:12px"><h3>رد العميل</h3><div class="row"><button class="btn sm alt grow" data-st="followup">رد / محتاج متابعة</button>
      <button class="btn sm ok grow" data-st="won">وافق</button><button class="btn sm bad grow" data-st="lost">رفض</button></div></div>` : ''}`;
    if (!q.lines.length) return;
    const busy = (b, on) => { b.disabled = on; b.style.opacity = on ? .6 : 1; };
    $('#send').onclick = async e => {
      busy(e.target, true);
      try { ensureQuoteNo(j); const blob = await QuotePDF.client(j, q, settings, await photosFor(j));
        const ok = await shareOrDownload(blob, `عرض سعر ${j.quoteNo} - ${j.client.name || ''}.pdf`, msg.replace('رقم  ', `رقم ${j.quoteNo} `));
        if (ok) { setStatus(j, 'sent'); saveJob(j); toast('اتسجل إن العرض اتبعت'); jobView(j.id, 'quote'); }
      } catch (err) { toast('حصلت مشكلة في عمل الملف'); console.error(err); } finally { busy(e.target, false); }
    };
    $('#prev').onclick = async e => { busy(e.target, true); try { ensureQuoteNo(j); saveJob(j);
      const blob = await QuotePDF.client(j, q, settings, await photosFor(j)); if (Native.isNative) await Native.shareFile(blob, `معاينة ${j.quoteNo}.pdf`); else window.open(URL.createObjectURL(blob)); } finally { busy(e.target, false); } };
    $('#intl').onclick = async e => { busy(e.target, true); try { ensureQuoteNo(j); saveJob(j);
      const blob = await QuotePDF.internal(j, q, settings); await shareOrDownload(blob, `داخلي ${j.quoteNo}.pdf`); } finally { busy(e.target, false); } };
    $('#wa').onclick = () => { if (!j.client.phone) return toast('مفيش رقم تليفون للعميل'); Native.openUrl(`https://wa.me/${waNumber(j.client.phone)}?text=${encodeURIComponent(msg)}`); };
    $('#bom').onclick = () => {
      const lines = q.lines.filter(l => l.kind === 'mat').map(l => `• ${l.name}: ${l.qty} ${l.unit}`).join('\n');
      const locs = j.locations.map((l, i) => `${i + 1}. ${l.name || '-'} — ${l.kind === 'relocate' ? 'نقل' : (item(l.camId)?.name || '')}${l.height ? ' · ارتفاع ' + l.height + 'م' : ''}${l.ladder ? ' · سلم' : ''}${l.mounting ? ' · ' + l.mounting : ''}`).join('\n');
      const txt = `قائمة خامات — ${j.client.name}\n${j.client.address || ''}\n\n${lines}\n\nكابل: ${q.cable.withReserve} م (${q.cable.boxes} كرتونة)\n\nالأماكن:\n${locs}`;
      if (Native.isNative) Native.shareText(txt); else if (navigator.share) navigator.share({ text: txt }).catch(() => {}); else navigator.clipboard.writeText(txt).then(() => toast('اتنسخت'));
    };
    pane.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
      if (b.dataset.st === 'followup') { const d = prompt('تتابع معاه بعد كام يوم؟ (0 = من غير تذكير)', '2'); if (d === null) return; j.followAt = Number(d) > 0 ? Date.now() + Number(d) * DAY : null; }
      setStatus(j, b.dataset.st); saveJob(j); toast('اتسجل'); jobView(j.id, 'quote');
    });
  }

  // ---------- prices ----------
  function pricesView() {
    app.innerHTML = `<header class="top"><h1><span class="dot"></span>الأسعار</h1><div class="sub">أسعار التكلفة بالجنيه — العرض بيضيف عليها نسبة الربح</div></header><main>
      <input id="q" placeholder="دوّر على صنف..." style="margin-bottom:12px">
      <div id="cats"></div>
      <div class="card"><h3>إضافة صنف</h3>
      <div class="grid2"><div><label>القسم</label><select id="nc">${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label>الماركة</label><input id="nb" placeholder="Hikvision"></div></div>
      <label>الاسم / الموديل</label><input id="nn"><label>سعر التكلفة</label><input id="np" type="number" dir="ltr">
      <div class="grid2"><div><label>المورد</label><input id="nsrc" value="عمر — سكاي واي"></div><div><label>تاريخ السعر</label><input id="ndt" type="date"></div></div>
      <label>ملخص الإمكانيات</label><input id="nsum">
      <div id="nspec"></div><label id="npmL" style="display:none"><input type="checkbox" id="npm">السعر بالمتر</label>
      <button class="btn block" id="nadd" style="margin-top:12px">إضافة</button></div></main>`;
    const draw = f => {
      $('#cats').innerHTML = Object.entries(CATS).map(([k, v]) => {
        const its = catalog.filter(c => c.cat === k && (!f || (c.name + c.brand).toLowerCase().includes(f.toLowerCase())));
        if (!its.length) return '';
        return `<div class="card"><h3>${v} <span class="muted">(${its.length})</span></h3>${its.map(c => `<div class="pricerow" data-id="${c.id}">
          <div class="pn">${esc(c.brand && c.brand !== '—' ? c.brand + ' ' : '')}${esc(c.name)}
          ${c.summary ? `<div class="muted">${esc(c.summary)}</div>` : ''}
          ${SPEC_FIELDS[c.cat] ? `<div class="muted">${SPEC_FIELDS[c.cat].map(([s, l]) => c.specs[s] != null && c.specs[s] !== '' ? `${l}: ${c.specs[s]}` : '').filter(Boolean).join(' · ')}</div>` : ''}
          <div class="muted" style="font-size:12px">${esc(c.src || '')}${c.date ? ' · ' + esc(c.date) : ''}</div></div>
          <input type="number" value="${c.cost}" data-f="cost"><button class="btn ghost" data-f="del">✕</button></div>`).join('')}</div>`;
      }).join('') || '<div class="empty">مفيش نتايج</div>';
      app.querySelectorAll('.pricerow').forEach(r => {
        const c = item(r.dataset.id);
        r.querySelector('[data-f=cost]').onchange = e => { c.cost = Number(e.target.value) || 0; c.updated = Date.now(); c.date = new Date().toISOString().slice(0, 10); saveCatalog(); toast('السعر اتحدث'); };
        r.querySelector('[data-f=del]').onclick = () => { if (!confirm(`تمسح "${c.name}"؟`)) return; catalog = catalog.filter(x => x !== c); saveCatalog(); draw($('#q').value); };
      });
    };
    draw('');
    $('#q').oninput = e => draw(e.target.value);
    const specUI = () => { const k = $('#nc').value; $('#nspec').innerHTML = (SPEC_FIELDS[k] || []).map(([s, l]) => `<label>${l}</label><input type="number" data-s="${s}" dir="ltr">`).join('')
      + (k === 'cam' ? `<label>المكان</label><select data-s="place"><option value="">الاتنين</option><option value="out">خارجي</option><option value="in">داخلي</option></select>` : '');
      $('#npmL').style.display = ['cable', 'acc', 'other'].includes(k) ? '' : 'none'; };
    $('#nc').onchange = specUI; specUI();
    $('#nadd').onclick = () => {
      const name = $('#nn').value.trim(), cost = Number($('#np').value);
      if (!name || !cost) return toast('اكتب الاسم والسعر');
      const specs = {}; $('#nspec').querySelectorAll('[data-s]').forEach(el => { if (el.value !== '') specs[el.dataset.s] = el.tagName === 'SELECT' ? el.value : Number(el.value); });
      if ($('#npm').checked) specs.perMeter = true;
      else if ($('#nc').value === 'cable') specs.boxM = Number(prompt('السعر ده لكرتونة طولها كام متر؟', '305')) || 305;
      catalog.push({ local: true, id: uid(), cat: $('#nc').value, brand: $('#nb').value.trim() || '—', name, cost, specs, updated: Date.now(),
        src: $('#nsrc').value.trim(), date: $('#ndt').value || new Date().toISOString().slice(0, 10), summary: $('#nsum').value.trim() });
      saveCatalog(); toast('اتضاف'); pricesView();
    };
  }

  // ---------- settings + backup ----------
  function settingsView() {
    app.innerHTML = `<header class="top"><h1><span class="dot"></span>الإعدادات</h1></header><main>
      <div class="card"><h3>قواعد التسعير الافتراضية</h3><div class="grid2">
      <div><label>نسبة الربح على التوريدات %</label><input type="number" data-k="markup" dir="ltr"></div>
      <div><label>احتياطي الكابل %</label><input type="number" data-k="cableReserve" dir="ltr"></div>
      <div><label>مصنعية كاميرا جديدة</label><input type="number" data-k="laborNew" dir="ltr"></div>
      <div><label>مصنعية نقل كاميرا</label><input type="number" data-k="laborRelocate" dir="ltr"></div>
      <div><label>المقدم عند التوريد %</label><input type="number" data-k="depositPct" dir="ltr"></div>
      <div><label>صلاحية العرض (يوم)</label><input type="number" data-k="validityDays" dir="ltr"></div>
      <div><label>تذكير المتابعة بعد (يوم)</label><input type="number" data-k="followupDays" dir="ltr"></div>
      <div><label>رقم العرض الجاي</label><input type="number" data-k="nextQuoteNo" dir="ltr"></div></div>
      <label>اسم التوقيع</label><input data-k="signName"></div>
      <div class="card"><h3>النسخة الاحتياطي</h3>
      <div class="muted">ملف واحد مشفّر فيه كل حاجة (العملاء، المعاينات، الصور، الأسعار). من غير الرقم السري محدش يقدر يفتحه — ولا حتى انت لو نسيته.</div>
      <label>الرقم السري للتشفير</label><input type="password" id="pw" placeholder="${settings._pwSet ? 'محفوظ — اكتب جديد لو عايز تغيره' : 'اختار رقم سري قوي'}">
      <button class="btn block" id="bk" style="margin-top:10px">عمل نسخة احتياطي</button>
      <label class="btn block alt" style="margin-top:8px">استرجاع من نسخة<input type="file" id="rs" hidden accept=".tgbak,application/json,*/*"></label>
      <div class="muted" id="lastbk" style="margin-top:8px">${settings.lastBackup ? 'آخر نسخة: ' + new Date(settings.lastBackup).toLocaleString('en-GB') : 'لسه معملتش نسخة'}</div></div>
      <div class="muted" style="text-align:center">إصدار 0.1 — تجريبي</div></main>`;
    bind(app, settings, () => saveSettings());
    const getPw = async () => {
      const typed = $('#pw').value;
      if (typed) { if (typed.length < 6) { toast('الرقم السري لازم 6 حروف على الأقل'); return null; }
        await Store.set('pw', typed); settings._pwSet = true; saveSettings(); return typed; }
      const saved = await Store.get('pw'); if (!saved) toast('اكتب رقم سري الأول'); return saved;
    };
    $('#bk').onclick = async e => {
      const pw = await getPw(); if (!pw) return;
      e.target.disabled = true; e.target.textContent = 'جاري التشفير...';
      try {
        const text = await AppCrypto.encrypt(await Backup.exportAll(), pw);
        const blob = new Blob([text], { type: 'application/octet-stream' });
        const name = 'typeg-backup.tgbak';
        const file = new File([blob], name, { type: 'application/octet-stream' });
        if (Native.isNative) await Native.shareFile(blob, name);
        else if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] }).catch(() => {});
        else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
        settings.lastBackup = Date.now(); saveSettings(); toast(`النسخة جاهزة (${(blob.size / 1048576).toFixed(1)} ميجا)`); settingsView();
      } finally { e.target.disabled = false; }
    };
    $('#rs').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const pw = prompt('اكتب الرقم السري بتاع النسخة'); if (!pw) return;
      try {
        const data = await AppCrypto.decrypt(await f.text(), pw);
        if (!confirm(`النسخة دي من ${new Date(data.exportedAt).toLocaleString('en-GB')} وفيها ${data.jobs.length} طلب. الاسترجاع هيمسح البيانات الحالية ويحط النسخة مكانها. تكمل؟`)) return;
        await Backup.importAll(data); await Store.set('pw', pw);
        settings = Object.assign({}, SEED.settings, data.settings); catalog = data.catalog; toast('اتسترجعت'); location.hash = '#/';
      } catch (err) { alert(err.message); }
    };
  }

  // ---------- encrypted price list (prices.enc in the public repo) ----------
  function mergeCatalog(remote) {
    const ids = new Set(remote.map(x => x.id));
    catalog = remote.concat(catalog.filter(c => c.local && !ids.has(c.id)));  // keep items added on the phone
    return saveCatalog();
  }
  function unlockScreen(wrong) {
    return new Promise(res => {
      app.innerHTML = `<header class="top"><h1><span class="dot"></span>Type-G Smart</h1><div class="sub">فتح قائمة الأسعار</div></header><main>
        <div class="card"><h3>اكتب الرقم السري</h3><div class="muted">الأسعار متشفرة. هتكتب الرقم ده مرة واحدة بس، والتطبيق هيفتكره.</div>
        ${wrong ? '<div class="warn" style="margin-top:10px">الرقم السري غلط، جرّب تاني.</div>' : ''}
        <label for="upw">الرقم السري</label><input id="upw" type="password" autocomplete="current-password" dir="ltr">
        <button class="btn block" id="ugo" style="margin-top:12px">فتح</button>
        <button class="btn block alt" id="uskip" style="margin-top:8px">بعدين</button></div></main>`;
      $('#ugo').onclick = () => res($('#upw').value || null);
      $('#upw').onkeydown = e => { if (e.key === 'Enter') res($('#upw').value || null); };
      $('#uskip').onclick = () => res(null);
    });
  }
  async function syncPrices(interactive) {
    let text, f;
    try { text = await (await fetch('prices.enc?t=' + Date.now(), { cache: 'no-store' })).text(); f = JSON.parse(text); }
    catch { return 'offline'; }
    if (f.ver <= ((await Store.get('pricesVer')) || 0)) return 'same';
    let pw = await Store.get('pricesPw'), wrong = false;
    for (;;) {
      if (!pw) { if (!interactive) return 'locked'; pw = await unlockScreen(wrong); if (!pw) return 'locked'; }
      try {
        const d = await AppCrypto.decrypt(text, pw);
        await mergeCatalog(d.catalog);
        await Store.set('pricesPw', pw); await Store.set('pricesVer', f.ver);
        if (!(await Store.get('pw'))) { await Store.set('pw', pw); settings._pwSet = true; saveSettings(); }
        return 'updated';
      } catch { pw = null; wrong = true; if (!interactive) return 'locked'; }
    }
  }
  async function refreshReminders() {
    const jobs = await Store.jobs();
    Native.scheduleFollowups(jobs.filter(j => (j.status === 'sent' && j.sentAt) || (j.status === 'followup' && j.followAt)).map(j => ({
      at: j.status === 'sent' ? j.sentAt + settings.followupDays * DAY : j.followAt,
      text: `${j.client.name || 'عميل'} — ${j.status === 'sent' ? 'العرض اتبعت من ' + settings.followupDays + ' يوم ومفيش رد' : 'ميعاد المتابعة'}` })));
  }
  window.addEventListener('hashchange', () => { clearTimeout(window._rr); window._rr = setTimeout(refreshReminders, 1500); });
  document.addEventListener('click', e => { const l = e.target.closest('a[data-ext]'); if (l && Native.isNative) { e.preventDefault(); Native.openUrl(l.href); } });
  await Native.unlock();
  const hadPrices = catalog.length > 0;
  const ps = await syncPrices(true);
  route(); refreshReminders();
  if (ps === 'updated') toast(hadPrices ? 'الأسعار اتحدثت' : 'الأسعار اتفتحت');
  else if (ps === 'offline' && !hadPrices) toast('مفيش نت — الأسعار هتتحمل أول ما النت يرجع');
})();
