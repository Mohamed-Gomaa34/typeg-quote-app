// Quote PDFs: client copy and internal copy (cost/profit).
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => `<span class="lt">${Number(n || 0).toLocaleString('en-US')}</span>`;
  // Latin runs (model numbers) rendered as isolated LTR boxes so the canvas renderer doesn't scramble mixed Arabic/English
  const mix = s => esc(s).replace(/[A-Za-z0-9][A-Za-z0-9\-\/\(\)\.\+×x ]*[A-Za-z0-9\)]|[A-Za-z0-9]/g, m => `<span class="lt">${m}</span>`);
  const css = `
    *{box-sizing:border-box;letter-spacing:0} .lt{display:inline-block;direction:ltr;unicode-bidi:isolate} .pg{width:794px;padding:34px 40px;font-family:Tahoma,"Segoe UI","Noto Sans Arabic",sans-serif;color:#18212d;direction:rtl;background:#fff}
    .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #f28a1e;padding-bottom:14px}
    .brand{font-size:28px;font-weight:800;color:#123a6b;direction:ltr}.brand span{color:#f28a1e}
    .meta{font-size:13px;text-align:left;line-height:1.7;color:#444}
    h2{color:#123a6b;font-size:20px;margin:22px 0 6px} .to{font-size:16px;margin:4px 0}
    table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}
    th{background:#123a6b;color:#fff;padding:9px 6px;text-align:right} td{padding:8px 6px;border-bottom:1px solid #e3e7ee}
    tr:nth-child(even) td{background:#f7f9fc} td.n{text-align:left;direction:ltr;white-space:nowrap}
    .sum td{font-weight:800;font-size:15px;background:#fff4e5 !important;border-top:2px solid #f28a1e}
    .terms{margin-top:18px;font-size:14px;line-height:1.9;background:#f3f5f8;border-radius:8px;padding:12px 16px}
    .sign{margin-top:30px;font-size:15px;line-height:1.7}.sign .en{direction:ltr;text-align:right;color:#123a6b;font-weight:700}
    .internal{background:#c0392b;color:#fff;text-align:center;padding:6px;font-weight:700;margin-bottom:10px;border-radius:6px}
    .phs{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.phs div{width:226px;font-size:12px;text-align:center}
    .phs img{width:226px;height:170px;object-fit:cover;border-radius:6px;border:1px solid #ddd}
    .brk{page-break-before:always}`;

  function header(s, job, q, title) {
    const d = new Date(job.quoteDate || Date.now());
    return `<div class="hd"><div class="brand lt">Type-<span>G</span> Smart</div>
      <div class="meta"><div>عرض رقم: <b class="lt">${esc(job.quoteNo || '-')}</b></div><div>التاريخ: <span class="lt">${d.toLocaleDateString('en-GB')}</span></div></div></div>
      <h2>${title}</h2>
      <div class="to">عناية / ${esc(job.client.title || 'الأستاذ')} ${esc(job.client.name || '')}</div>
      ${job.client.address ? `<div class="to" style="font-size:14px;color:#555">الموقع: ${mix(job.client.address)}</div>` : ''}`;
  }

  function clientHTML(job, q, s, photos) {
    const rows = q.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${mix(l.name)}</td><td class="n">${fmt(l.qty)}</td><td>${mix(l.unit)}</td>
      <td class="n">${fmt(l.sell)}</td><td class="n">${fmt(l.qty * l.sell)}</td></tr>`).join('');
    const ph = photos && photos.length ? `<div class="brk"></div><h2>صور المواقع</h2><div class="phs">${photos.map(p => `<div><img src="${p.data}"><br>${esc(p.label)}</div>`).join('')}</div>` : '';
    return `<style>${css}</style><div class="pg">${header(s, job, q, 'عرض سعر — توريد وتركيب نظام كاميرات مراقبة')}
      <table><tr><th>م</th><th>البيان</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>الإجمالي</th></tr>${rows}
      <tr class="sum"><td></td><td colspan="4">الإجمالي (جنيه مصري)</td><td class="n">${fmt(q.total)}</td></tr></table>
      <div class="terms">• شروط الدفع: ${s.depositPct}% من الإجمالي عند التوريد (${fmt(q.deposit)} جنيه)، والباقي ${100 - s.depositPct}% بعد التسليم (${fmt(q.rest)} جنيه).<br>
      • العرض ساري لمدة ${s.validityDays} يوم من تاريخه.</div>
      <div class="sign"><div class="en">Best Regards,</div>${esc(s.signName)}<div class="en">${esc(s.companyName)}</div></div>${ph}</div>`;
  }

  function internalHTML(job, q, s) {
    const rows = q.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${mix(l.name)}</td><td class="n">${fmt(l.qty)}</td>
      <td class="n">${fmt(l.cost)}</td><td class="n">${fmt(l.sell)}</td><td class="n">${fmt(l.qty * l.cost)}</td><td class="n">${fmt(l.qty * l.sell)}</td>
      <td class="n">${fmt(l.qty * (l.sell - l.cost))}</td></tr>`).join('');
    const c = job.client;
    return `<style>${css}</style><div class="pg"><div class="internal">نسخة داخلية — لا ترسل للعميل</div>${header(s, job, q, 'تحليل تكلفة وربح العرض')}
      <div class="to" style="font-size:13px;color:#555">تليفون: ${esc(c.phone)} · المصدر: ${esc(c.source)} ${c.referrer ? '· الترشيح: ' + esc(c.referrer) : ''}</div>
      <table><tr><th>م</th><th>البيان</th><th>الكمية</th><th>تكلفة الوحدة</th><th>بيع الوحدة</th><th>إجمالي التكلفة</th><th>إجمالي البيع</th><th>الربح</th></tr>${rows}
      <tr class="sum"><td></td><td colspan="4">الإجمالي</td><td class="n">${fmt(q.costTotal)}</td><td class="n">${fmt(q.total)}</td><td class="n">${fmt(q.profit)}</td></tr></table>
      <div class="terms">• ربح المواد: ${fmt(q.matProfit)} جنيه<br>• المصنعية: ${fmt(q.laborTotal)} جنيه<br>
      • الكابل: مقاس ${fmt(q.cable.measured)} م · بعد الاحتياطي ${fmt(q.cable.withReserve)} م · ${q.cable.boxes} كرتونة ${s.boxMeters} م<br>
      • المقدم ${s.depositPct}%: ${fmt(q.deposit)} · الباقي: ${fmt(q.rest)}</div></div>`;
  }

  // Render with the browser's own text engine (SVG foreignObject) so Arabic shaping and RTL are exact,
  // then slice into A4 pages with jsPDF.
  const W = 794, H = 1123, SCALE = 2;
  async function render(html) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;width:' + W + 'px';
    host.innerHTML = html; document.body.appendChild(host);
    try {
      const pg = host.querySelector('.pg');
      await Promise.all([...pg.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      // keep table rows / photo blocks whole: push them to the next page if they would be cut
      const top0 = pg.getBoundingClientRect().top;
      pg.querySelectorAll('tr, .terms, .sign, .phs > div, h2').forEach(el => {
        const r = el.getBoundingClientRect(), t = r.top - top0, b = r.bottom - top0;
        const pageEnd = Math.ceil((t + 1) / H) * H;
        if (!(b > pageEnd - 30 && r.height < H / 2)) return;
        const push = pageEnd - t + 34;
        if (el.tagName === 'TR') [...el.cells].forEach(td => td.style.paddingTop = (parseFloat(getComputedStyle(td).paddingTop) + push) + 'px');
        else el.style.marginTop = (parseFloat(getComputedStyle(el).marginTop) || 0) + push + 'px';
      });
      pg.querySelectorAll('.brk').forEach(el => { const t = el.getBoundingClientRect().top - top0; el.style.height = (Math.ceil(t / H) * H - t + 34) + 'px'; });
      const total = Math.max(H, Math.ceil(pg.scrollHeight / H) * H);
      const css = [...host.querySelectorAll('style')].map(x => x.textContent).join('');
      const xhtml = new XMLSerializer().serializeToString(pg);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total}"><foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${xhtml}</div></foreignObject></svg>`;
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('render failed')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const doc = new jspdf.jsPDF({ unit: 'pt', format: 'a4' });
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      const cv = document.createElement('canvas'); cv.width = W * SCALE; cv.height = H * SCALE;
      const ctx = cv.getContext('2d');
      for (let y = 0, n = 0; y < total; y += H, n++) {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, y * SCALE / SCALE, W, H, 0, 0, cv.width, cv.height);
        if (n) doc.addPage();
        doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph);
      }
      return doc.output('blob');
    } finally { host.remove(); }
  }
  window.QuotePDF = {
    client: (job, q, s, photos) => render(clientHTML(job, q, s, photos)),
    internal: (job, q, s) => render(internalHTML(job, q, s))
  };
})();
