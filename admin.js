/* Admin panel: overview analytics, locations, slots, bookings, users, payments, feedback */
(function () {
  'use strict';
  const { $, $$, esc } = PSF;
  const charts = [];
  const mkChart = (el, cfg) => { const c = new Chart(el, cfg); charts.push(c); return c; };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  PSF.route('/admin', async ({ query, view }) => {
    const stale = PSF.token();
    let tab = query.tab || 'overview';
    view.innerHTML = `<div class="container dash"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><div><span class="pill"><i class="bi bi-shield-check"></i> Admin</span><h1 style="margin-top:8px">Control panel</h1></div></div><div class="tabs" id="atabs"></div><div id="abody"></div></div>`;
    const T = [['overview', 'Overview'], ['locations', 'Locations'], ['slots', 'Slots'], ['bookings', 'Bookings'], ['users', 'Users'], ['payments', 'Payments'], ['feedback', 'Feedback']];
    let offLive = null, slotLoc = null;

    const unwrap = (r) => { if (r.error) throw r.error; return r.data; };
    const table = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="muted center">Nothing here yet</td></tr>`}</tbody></table></div>`;

    async function show(t) {
      if (stale()) return;
      tab = t; charts.splice(0).forEach((c) => c.destroy()); if (offLive) { offLive(); offLive = null; }
      $('#atabs').innerHTML = T.map((x) => `<button class="tab ${x[0] === tab ? 'active' : ''}" data-t="${x[0]}">${x[1]}</button>`).join('');
      $$('#atabs .tab').forEach((b) => (b.onclick = () => show(b.dataset.t)));
      const body = $('#abody'); body.onclick = null; body.onchange = null; body.innerHTML = '<div class="card skeleton" style="height:200px"></div>';
      try { await ({ overview, locations, slots, bookings, users, payments, feedback }[tab])(body); } catch (e) { if (stale()) return; body.innerHTML = `<div class="notice err-box">${esc(PSF.errMsg(e))}</div>`; }
    }

    /* ----- overview ----- */
    async function overview(body) {
      const [locs, slots, bk, pay, users] = await Promise.all([
        PSF.sb.from('locations').select('id,name,is_active'), PSF.sb.from('slots').select('id,status'),
        PSF.sb.from('bookings').select('id,status,amount,created_at,start_time,end_time,location_id'), PSF.sb.from('payments').select('amount,status,created_at'),
        PSF.sb.from('profiles').select('id', { count: 'exact', head: true })]);
      const L = unwrap(locs), S = unwrap(slots), B = unwrap(bk), P = unwrap(pay);
      if (stale()) return;
      const n = Date.now(); const revenue = P.filter((p) => p.status === 'paid').reduce((a, p) => a + +p.amount, 0);
      const active = B.filter((b) => b.status === 'confirmed' && +new Date(b.start_time) <= n && +new Date(b.end_time) > n).length;
      const cards = [['bi-geo-alt-fill', 'Locations', L.length, 0], ['bi-grid-3x3-gap-fill', 'Total slots', S.length, 0], ['bi-people-fill', 'Users', users.count || 0, 0], ['bi-journal-check', 'Bookings', B.length, 0], ['bi-car-front-fill', 'Parked now', active, 0], ['bi-currency-rupee', 'Revenue', revenue, 1], ['bi-hourglass-split', 'Pending payment', B.filter((b) => b.status === 'pending').length, 0], ['bi-x-circle', 'Cancelled', B.filter((b) => b.status === 'cancelled').length, 0]];
      body.innerHTML = `<div class="grid g4">${cards.map((c) => `<div class="card stat-card hover"><i class="bi ${c[0]}"></i><div class="stat-num" data-to="${c[2]}" data-m="${c[3]}">0</div><div class="muted">${c[1]}</div></div>`).join('')}</div>
        <div class="grid g2" style="margin-top:22px"><div class="card"><h3>Bookings – last 14 days</h3><div class="chart-box"><canvas id="c1"></canvas></div></div><div class="card"><h3>Booking status</h3><div class="chart-box"><canvas id="c2"></canvas></div></div>
        <div class="card" style="grid-column:1/-1"><h3>Revenue by location (confirmed bookings)</h3><div class="chart-box"><canvas id="c3"></canvas></div></div></div>`;
      $$('.stat-num', body).forEach((el) => { PSF.counter(el, +el.dataset.to); if (el.dataset.m === '1') setTimeout(() => (el.textContent = PSF.money(+el.dataset.to)), 1050); });
      const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i)); return d; });
      const counts = days.map((d) => B.filter((b) => { const c = new Date(b.created_at); return c >= d && c < new Date(+d + 864e5); }).length);
      const txt = css('--muted'), grid = 'rgba(120,150,200,.15)';
      mkChart($('#c1', body), { type: 'line', data: { labels: days.map((d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })), datasets: [{ label: 'Bookings', data: counts, borderColor: '#2f7bff', backgroundColor: 'rgba(47,123,255,.15)', fill: true, tension: 0.35, pointRadius: 3 }] }, options: { maintainAspectRatio: false, animation: { duration: 1200 }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0, color: txt }, grid: { color: grid } }, x: { ticks: { color: txt }, grid: { display: false } } } } });
      const st = ['confirmed', 'pending', 'cancelled', 'expired'];
      mkChart($('#c2', body), { type: 'doughnut', data: { labels: st, datasets: [{ data: st.map((s) => B.filter((b) => b.status === s).length), backgroundColor: ['#17b26a', '#f79009', '#f04438', '#98a2b3'], borderWidth: 0 }] }, options: { maintainAspectRatio: false, cutout: '62%', animation: { duration: 1200 }, plugins: { legend: { position: 'bottom', labels: { color: txt } } } } });
      mkChart($('#c3', body), { type: 'bar', data: { labels: L.map((l) => l.name), datasets: [{ label: '₹ revenue', data: L.map((l) => B.filter((b) => b.location_id === l.id && b.status === 'confirmed').reduce((a, b) => a + +b.amount, 0)), backgroundColor: '#5cb6ff', borderRadius: 8 }] }, options: { maintainAspectRatio: false, animation: { duration: 1200 }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: txt }, grid: { color: grid } }, x: { ticks: { color: txt }, grid: { display: false } } } } });
      offLive = PSF.live(['bookings'], () => { if (tab === 'overview') show('overview'); });
    }

    /* ----- locations ----- */
    async function locations(body) {
      const L = unwrap(await PSF.sb.from('locations').select('*').order('created_at', { ascending: false }));
      const S = unwrap(await PSF.sb.from('slots').select('location_id'));
      body.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:14px"><h3>Parking locations (${L.length})</h3><button class="btn btn-primary" id="addLoc"><i class="bi bi-plus-lg"></i> Add location</button></div>` +
        table(['Name', 'Address', 'Price/hr', 'Slots', 'Status', ''], L.map((l) => `<tr><td><b>${esc(l.name)}</b></td><td>${esc(l.address)}</td><td>${PSF.money(l.price_per_hour)}</td><td>${S.filter((s) => s.location_id === l.id).length}</td><td><span class="tag ${l.is_active ? 'ok' : 'gray'}">${l.is_active ? 'Active' : 'Hidden'}</span></td><td style="text-align:right"><button class="btn btn-outline btn-sm" data-edit="${l.id}">Edit</button> <button class="btn btn-outline btn-sm" data-slots="${l.id}">Slots</button> <button class="btn btn-danger btn-sm" data-del="${l.id}">Delete</button></td></tr>`));
      $('#addLoc').onclick = () => locForm();
      body.onclick = async (e) => {
        const ed = e.target.closest('[data-edit]'), sl = e.target.closest('[data-slots]'), de = e.target.closest('[data-del]');
        if (ed) locForm(L.find((x) => x.id === ed.dataset.edit)); if (sl) { slotLoc = sl.dataset.slots; show('slots'); }
        if (de) {
          if (!confirm('Delete this location and all its slots? This cannot be undone.')) return;
          const { error } = await PSF.sb.from('locations').delete().eq('id', de.dataset.del);
          if (error) return PSF.toast(/foreign key|violates/i.test(error.message) ? 'This location has bookings and cannot be deleted. Edit it and set it to Hidden instead.' : PSF.errMsg(error), 'error');
          PSF.toast('Location deleted', 'success'); show('locations');
        }
      };
    }
    function locForm(l) {
      const m = PSF.modal(`<h2 style="margin-bottom:14px">${l ? 'Edit' : 'Add'} location</h2><form id="lf">
        <div class="field"><label>Name</label><input name="name" required value="${esc(l && l.name)}"></div><div class="field"><label>Full address</label><input name="address" required value="${esc(l && l.address)}"></div>
        <div class="row c2"><div class="field"><label>City</label><input name="city" value="${esc(l && l.city)}"></div><div class="field"><label>Price per hour (₹)</label><input type="number" name="price" min="0" step="0.5" required value="${l ? l.price_per_hour : ''}"></div></div>
        <div class="field"><label>Coordinates — click the map or search an address</label><div style="display:flex;gap:8px;margin-bottom:8px"><input id="gq" placeholder="Search address to place pin"><button type="button" class="btn btn-outline" id="gbtn">Find</button></div><div id="pickMap" style="height:220px;border-radius:12px"></div>
          <div class="row c2" style="margin-top:8px"><input name="lat" type="number" step="any" required placeholder="Latitude" value="${l ? l.lat : ''}"><input name="lng" type="number" step="any" required placeholder="Longitude" value="${l ? l.lng : ''}"></div></div>
        <div class="field"><label>Image URL (optional)</label><input name="img" type="url" value="${esc(l && l.image_url)}"></div><div class="field"><label>Description</label><textarea name="desc" rows="2">${esc(l && l.description)}</textarea></div>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" ${!l || l.is_active ? 'checked' : ''}> Visible to users</label>
        <button class="btn btn-primary btn-block" style="margin-top:14px">${l ? 'Save changes' : 'Create location'}</button></form>`, { wide: true });
      const pm = L.map($('#pickMap', m.el)).setView(l ? [l.lat, l.lng] : [20.59, 78.96], l ? 15 : 4);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(pm);
      let pin = l ? L.marker([l.lat, l.lng]).addTo(pm) : null;
      const set = (lat, lng) => { if (pin) pin.setLatLng([lat, lng]); else pin = L.marker([lat, lng]).addTo(pm); $('[name=lat]', m.el).value = (+lat).toFixed(6); $('[name=lng]', m.el).value = (+lng).toFixed(6); };
      pm.on('click', (e) => set(e.latlng.lat, e.latlng.lng)); setTimeout(() => pm.invalidateSize(), 250);
      $('#gbtn', m.el).onclick = async () => { try { const j = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent($('#gq', m.el).value))).json(); if (!j[0]) return PSF.toast('Address not found', 'error'); pm.setView([+j[0].lat, +j[0].lon], 16); set(j[0].lat, j[0].lon); } catch (e) { PSF.toast('Search failed', 'error'); } };
      $('#lf', m.el).onsubmit = async (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        const row = { name: f.get('name').trim(), address: f.get('address').trim(), city: f.get('city').trim(), price_per_hour: +f.get('price'), lat: +f.get('lat'), lng: +f.get('lng'), image_url: f.get('img').trim() || null, description: f.get('desc').trim(), is_active: !!f.get('active') };
        const q = l ? PSF.sb.from('locations').update(row).eq('id', l.id) : PSF.sb.from('locations').insert(row);
        const { error } = await q; if (error) return PSF.toast(PSF.errMsg(error), 'error');
        PSF.toast('Location saved', 'success'); m.close(); show('locations');
      };
    }

    /* ----- slots ----- */
    async function slots(body) {
      const L = unwrap(await PSF.sb.from('locations').select('id,name').order('name'));
      if (!L.length) return void (body.innerHTML = '<div class="card empty"><i class="bi bi-geo"></i>Add a location first.</div>');
      if (!slotLoc || !L.find((x) => x.id === slotLoc)) slotLoc = L[0].id;
      const S = unwrap(await PSF.sb.from('slots').select('*').eq('location_id', slotLoc)).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      body.innerHTML = `<div class="card" style="margin-bottom:18px"><div class="row c3"><div><label>Location</label><select id="sl">${L.map((x) => `<option value="${x.id}" ${x.id === slotLoc ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div><label>Add slots (how many)</label><input type="number" id="sn" min="1" max="500" value="10"></div><div><label>Label prefix</label><div style="display:flex;gap:8px"><input id="sp" value="A" maxlength="4"><button class="btn btn-primary" id="sadd">Add</button></div></div></div><p class="hint">Slots are numbered continuing from the existing ones, e.g. A1, A2…</p></div>
        <div class="legend" style="margin-bottom:10px"><span><i class="dot ok"></i>Active (bookable)</span><span><i class="dot occ"></i>Occupied (blocked by admin)</span><span><i class="dot maint"></i>Maintenance</span></div>
        ${table(['Slot', 'Status', ''], S.map((s) => `<tr><td><b>${esc(s.label)}</b></td><td><select data-st="${s.id}" style="width:auto"><option value="active" ${s.status === 'active' ? 'selected' : ''}>Active</option><option value="occupied" ${s.status === 'occupied' ? 'selected' : ''}>Occupied</option><option value="maintenance" ${s.status === 'maintenance' ? 'selected' : ''}>Maintenance</option></select></td><td style="text-align:right"><button class="btn btn-danger btn-sm" data-ds="${s.id}">Delete</button></td></tr>`))}`;
      $('#sl').onchange = (e) => { slotLoc = e.target.value; show('slots'); };
      $('#sadd').onclick = async () => {
        const n = Math.min(500, Math.max(1, +$('#sn').value || 0)), p = ($('#sp').value || 'A').trim(); const have = new Set(S.map((s) => s.label)); const rows = []; let i = 1;
        while (rows.length < n && i < 5000) { const lb = p + i++; if (!have.has(lb)) rows.push({ location_id: slotLoc, label: lb }); }
        const { error } = await PSF.sb.from('slots').insert(rows); if (error) return PSF.toast(PSF.errMsg(error), 'error'); PSF.toast(rows.length + ' slot(s) added', 'success'); show('slots');
      };
      body.onchange = async (e) => { const s = e.target.closest('[data-st]'); if (!s) return; const { error } = await PSF.sb.from('slots').update({ status: s.value }).eq('id', s.dataset.st); error ? PSF.toast(PSF.errMsg(error), 'error') : PSF.toast('Availability updated', 'success'); };
      body.onclick = async (e) => { const d = e.target.closest('[data-ds]'); if (!d || !confirm('Delete this slot?')) return; const { error } = await PSF.sb.from('slots').delete().eq('id', d.dataset.ds); if (error) return PSF.toast(/foreign key|violates/i.test(error.message) ? 'Slot has booking history — set it to Maintenance instead.' : PSF.errMsg(error), 'error'); show('slots'); };
    }

    /* ----- bookings ----- */
    async function bookings(body) {
      const B = unwrap(await PSF.sb.from('bookings').select('*, locations(name), slots(label), profiles(full_name,email)').order('created_at', { ascending: false }).limit(500));
      let fs = '', fq = '';
      const draw = () => {
        const rows = B.filter((b) => (!fs || b.status === fs) && (!fq || (b.booking_code + (b.profiles ? b.profiles.email + b.profiles.full_name : '')).toLowerCase().includes(fq.toLowerCase())));
        $('#bt').innerHTML = table(['Booking', 'User', 'Location', 'Slot', 'Entry', 'Exit', 'Amount', 'Status', ''], rows.map((b) => `<tr><td><b>${esc(b.booking_code)}</b></td><td>${esc(b.profiles ? b.profiles.full_name || b.profiles.email : '—')}</td><td>${esc(b.locations ? b.locations.name : '—')}</td><td>${esc(b.slots ? b.slots.label : '—')}</td><td>${PSF.fmtShort(b.start_time)}</td><td>${PSF.fmtShort(b.end_time)}</td><td>${PSF.money(b.amount)}</td><td><span class="tag ${b.status === 'confirmed' ? 'ok' : b.status === 'pending' ? 'res' : b.status === 'cancelled' ? 'occ' : 'gray'}">${b.status}</span></td><td>${['pending', 'confirmed'].includes(b.status) ? `<button class="btn btn-danger btn-sm" data-c="${b.id}">Cancel</button>` : ''}</td></tr>`));
      };
      body.innerHTML = `<div class="row c3" style="margin-bottom:14px"><input id="bq" placeholder="Search booking ID or user"><select id="bs"><option value="">All statuses</option><option>confirmed</option><option>pending</option><option>cancelled</option><option>expired</option></select></div><div id="bt"></div>`;
      draw(); $('#bq').oninput = (e) => { fq = e.target.value; draw(); }; $('#bs').onchange = (e) => { fs = e.target.value; draw(); };
      body.onclick = async (e) => {
        const c = e.target.closest('[data-c]'); if (!c || !confirm('Cancel this booking? Any paid amount will be marked for refund.')) return;
        const { error } = await PSF.sb.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', c.dataset.c); if (error) return PSF.toast(PSF.errMsg(error), 'error');
        await PSF.sb.from('payments').update({ status: 'refund_pending' }).eq('booking_id', c.dataset.c).eq('status', 'paid');
        PSF.toast('Booking cancelled', 'success'); show('bookings');
      };
    }

    /* ----- users ----- */
    async function users(body) {
      const U = unwrap(await PSF.sb.from('profiles').select('*').order('created_at', { ascending: false }));
      body.innerHTML = table(['Name', 'Email', 'Phone', 'Joined', 'Role'], U.map((u) => `<tr><td>${esc(u.full_name || '—')}</td><td>${esc(u.email)}</td><td>${esc(u.phone || '—')}</td><td>${PSF.fmtShort(u.created_at)}</td><td>${u.id === PSF.user.id ? '<span class="tag blue">admin (you)</span>' : `<select data-role="${u.id}" style="width:auto"><option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option></select>`}</td></tr>`));
      body.onchange = async (e) => { const r = e.target.closest('[data-role]'); if (!r) return; if (!confirm(`Change this user's role to ${r.value}?`)) return show('users'); const { error } = await PSF.sb.from('profiles').update({ role: r.value }).eq('id', r.dataset.role); error ? PSF.toast(PSF.errMsg(error), 'error') : PSF.toast('Role updated', 'success'); };
    }

    /* ----- payments ----- */
    async function payments(body) {
      const P = unwrap(await PSF.sb.from('payments').select('*, profiles(full_name,email), bookings(booking_code)').order('created_at', { ascending: false }).limit(500));
      const tot = P.filter((p) => p.status === 'paid').reduce((a, p) => a + +p.amount, 0);
      body.innerHTML = `<p style="margin-bottom:12px"><b>Total collected:</b> ${PSF.money(tot)}</p>` + table(['Date', 'User', 'Booking', 'Amount', 'Method', 'Status', 'Gateway ref', ''], P.map((p) => `<tr><td>${PSF.fmtShort(p.created_at)}</td><td>${esc(p.profiles ? p.profiles.full_name || p.profiles.email : '—')}</td><td>${esc(p.bookings ? p.bookings.booking_code : '—')}</td><td>${PSF.money(p.amount)}</td><td>${esc(p.method || '—')}</td><td><span class="tag ${p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'occ' : 'res'}">${p.status.replace('_', ' ')}</span></td><td>${esc(p.gateway_payment_id || p.failure_reason || '—')}</td><td>${p.status === 'refund_pending' ? `<button class="btn btn-outline btn-sm" data-rf="${p.id}">Mark refunded</button>` : ''}</td></tr>`));
      body.onclick = async (e) => { const r = e.target.closest('[data-rf]'); if (!r) return; const { error } = await PSF.sb.from('payments').update({ status: 'refunded' }).eq('id', r.dataset.rf); if (error) return PSF.toast(PSF.errMsg(error), 'error'); PSF.toast('Marked as refunded (issue the refund in your Razorpay dashboard)', 'success'); show('payments'); };
    }

    /* ----- feedback ----- */
    async function feedback(body) {
      const F = unwrap(await PSF.sb.from('feedback').select('*').order('created_at', { ascending: false }).limit(200));
      body.innerHTML = table(['Date', 'Name', 'Email', 'Rating', 'Message'], F.map((f) => `<tr><td>${PSF.fmtShort(f.created_at)}</td><td>${esc(f.name)}</td><td>${esc(f.email)}</td><td>${'★'.repeat(f.rating || 0)}</td><td style="white-space:normal;min-width:260px">${esc(f.message)}</td></tr>`));
    }

    await show(tab);
    return () => { charts.splice(0).forEach((c) => c.destroy()); if (offLive) offLive(); };
  }, { admin: true });
})();
