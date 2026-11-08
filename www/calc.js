// Pure calculation logic — no DOM, testable in Node.
(function (root) {
  // Round sell prices up: to nearest 5 for items ≥ 100 EGP, to nearest 1 below that (per-meter cable etc.)
  const round5 = n => n >= 100 ? Math.ceil(n / 5) * 5 : Math.ceil(n);

  // Approx. H.265 continuous-recording bitrate: ~1 Mbps per megapixel.
  function hddDays(tb, cams) {
    const mbps = cams.reduce((s, c) => s + Math.max(1, (c.specs && c.specs.res) || 2), 0);
    if (!mbps || !tb) return 0;
    return Math.floor((tb * 1e12 * 8) / (mbps * 1e6 * 86400));
  }

  function buildQuote(job, catalog, settings) {
    const byId = id => catalog.find(c => c.id === id);
    const o = Object.assign({}, job.opts || {});
    const markup = (o.markup ?? settings.markup) / 100;
    const reserve = (o.cableReserve ?? settings.cableReserve) / 100;
    const locs = job.locations || [];
    const lines = [];            // {name, qty, unit, cost, sell, kind:'mat'|'labor'}
    const warnings = [];
    const add = (name, qty, cost, unit = 'عدد', sellOverride) => {
      if (!qty) return;
      const sell = sellOverride != null ? sellOverride : round5(cost * (1 + markup));
      lines.push({ name, qty, unit, cost, sell, kind: 'mat' });
    };

    // Cameras and mounts grouped by model (new cameras only — relocated ones are existing)
    const group = key => {
      const m = {};
      locs.filter(l => l.kind !== 'relocate' && l[key]).forEach(l => { m[l[key]] = (m[l[key]] || 0) + 1; });
      return m;
    };
    for (const [id, q] of Object.entries(group('camId'))) { const it = byId(id); if (it) add(it.brand + ' ' + it.name, q, it.cost); }
    for (const [id, q] of Object.entries(group('mountId'))) { const it = byId(id); if (it) add(it.name, q, it.cost); }
    for (const [id, q] of Object.entries(group('boxId'))) { const it = byId(id); if (it) add(it.name, q, it.cost); }

    // Cable
    const measured = locs.reduce((s, l) => s + (Number(l.cableM) || 0), 0);
    const cableM = Math.ceil(locs.reduce((s, l) => s + (Number(l.cableM) || 0) * (1 + reserve), 0) + (Number(o.extraReserveM) || 0));
    const boxes = cableM ? Math.ceil(cableM / settings.boxMeters) : 0;
    // Cable type chosen per job (several cable types can exist); priced per meter, or box price / box length
    const isCable = c => c.cat === 'cable' && c.specs && (c.specs.perMeter || c.specs.boxM);
    const cableItem = (o.cableId && catalog.find(c => c.id === o.cableId && isCable(c))) || catalog.find(c => isCable(c) && c.specs.default) || catalog.find(isCable);
    const perM = it => it.specs.perMeter ? it.cost : it.cost / it.specs.boxM;
    if (cableM) {
      if (o.cableLump) {
        const lump = Number(o.lumpPrice) || 0;
        lines.push({ name: 'كابلات وخراطيم وإكسسوارات — مقطوعية', qty: 1, unit: 'مقطوعية', cost: Number(o.lumpCost) || 0, sell: lump, kind: 'mat' });
        if (!lump) warnings.push('لم يتم إدخال سعر المقطوعية.');
      } else if (cableItem) {
        add(cableItem.name.replace(/\s*\(بالمتر\)|\s*كرتونة\s*\d+م/g, ''), cableM, perM(cableItem), 'متر');
      }
    }

    // Equipment
    const eq = job.equip || {};
    const nvr = byId(eq.nvrId), sw = byId(eq.switchId), hdd = byId(eq.hddId);
    if (nvr) add(nvr.brand + ' ' + nvr.name, 1, nvr.cost);
    if (sw) add(sw.brand + ' ' + sw.name, 1, sw.cost);
    if (hdd) add(hdd.name, 1, hdd.cost);
    (eq.extras || []).forEach(x => { const it = byId(x.itemId); if (it) add(it.name, Number(x.qty) || 1, it.cost, it.specs && it.specs.perMeter ? 'متر' : 'عدد'); });

    // Labor (no markup). Per-location override is an exception.
    const laborGroups = {};
    locs.forEach(l => {
      const base = l.kind === 'relocate' ? settings.laborRelocate : settings.laborNew;
      const price = l.laborOverride != null && l.laborOverride !== '' ? Number(l.laborOverride) : base;
      const label = (l.kind === 'relocate' ? 'مصنعية نقل كاميرا قائمة' : 'مصنعية تركيب كاميرا شاملة سحب الكابل');
      const k = label + '|' + price;
      laborGroups[k] = laborGroups[k] || { name: label, qty: 0, unit: 'عدد', cost: 0, sell: price, kind: 'labor' };
      laborGroups[k].qty++;
    });
    (job.extraLabor || []).forEach(x => { if (x.name && Number(x.price)) lines.push({ name: x.name, qty: Number(x.qty) || 1, unit: 'عدد', cost: 0, sell: Number(x.price), kind: 'labor' }); });
    lines.push(...Object.values(laborGroups));

    // Checks
    const camCount = locs.length;
    const camItems = locs.map(l => byId(l.camId)).filter(Boolean);
    if (nvr && nvr.specs.channels && camCount > nvr.specs.channels)
      warnings.push(`عدد الكاميرات (${camCount}) يتجاوز عدد قنوات جهاز التسجيل (${nvr.specs.channels}).`);
    if (sw && sw.specs.ports && camCount > sw.specs.ports - 1)
      warnings.push(`منافذ السويتش (${sw.specs.ports}) لا تكفي: مطلوب ${camCount} منفذ للكاميرات بالإضافة إلى منفذ لجهاز التسجيل.`);
    if (sw && sw.specs.poeW > 0) {
      const watts = camItems.reduce((s, c) => s + (c.specs.watt || 7), 0);
      if (watts > sw.specs.poeW) warnings.push(`الاستهلاك التقديري للكاميرات (${watts} وات) يتجاوز قدرة PoE للسويتش (${sw.specs.poeW} وات).`);
    }
    if (camItems.some(c => c.brand === 'Hikvision') && !nvr) warnings.push('توجد كاميرات Hikvision بدون جهاز تسجيل.');
    if (nvr && !hdd) warnings.push('لم يتم اختيار وحدة تخزين لجهاز التسجيل.');
    locs.forEach((l, i) => { if (l.kind !== 'relocate' && !l.camId) warnings.push(`لم يتم اختيار نوع الكاميرا للنقطة ${i + 1} (${l.name || 'بدون اسم'}).`); });

    const total = lines.reduce((s, l) => s + l.qty * l.sell, 0);
    const costTotal = lines.reduce((s, l) => s + l.qty * l.cost, 0);
    const deposit = Math.round(total * settings.depositPct / 100);
    const laborTotal = lines.filter(l => l.kind === 'labor').reduce((s, l) => s + l.qty * l.sell, 0);
    return { lines, total, costTotal, profit: total - costTotal, laborTotal, matProfit: total - laborTotal - costTotal, deposit, rest: total - deposit,
      cable: { measured, withReserve: cableM, boxes }, camCount, warnings,
      hddDays: hdd ? hddDays(hdd.specs.tb, camItems) : null };
  }

  const api = { buildQuote, hddDays, round5 };
  if (typeof module !== 'undefined') module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
