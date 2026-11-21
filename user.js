/* User pages: booking + payment, dashboard, profile */
(function () {
  'use strict';
  const { $, $$, esc } = PSF;
  const METHODS = [['upi', 'bi-phone', 'UPI'], ['card', 'bi-credit-card-2-front', 'Credit / Debit card'], ['netbanking', 'bi-bank', 'Net banking'], ['wallet', 'bi-wallet2', 'Wallets']];

  const loadRzp = () => new Promise((res, rej) => {
    if (window.Razorpay) return res();
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = res; s.onerror = () => rej(new Error('Could not load the Razorpay checkout script')); document.head.appendChild(s);
  });
  const qrText = (b, slotLabel) => `PSF|${b.booking_code}|slot:${slotLabel}|${new Date(b.start_time).toISOString()}|${new Date(b.end_time).toISOString()}`;

  /* run Razorpay test-mode checkout. onPaid(bookingRow) is called only after the DB confirms the payment. */
  async function pay(b, loc, slotLabel, method, onResult) {
    if (!PSF.C.RAZORPAY_KEY_ID) return PSF.toast('Payment gateway key is not configured (js/config.js).', 'error');
    try { await loadRzp(); } catch (e) { return PSF.toast(e.message, 'error'); }
    const rz = new Razorpay({
      key: PSF.C.RAZORPAY_KEY_ID, amount: Math.round(b.amount * 100), currency: 'INR', name: 'Parking Slot Finder',
      description: `${loc.name} · Slot ${slotLabel}`, notes: { booking_code: b.booking_code },
      prefill: { name: PSF.profile ? PSF.profile.full_name : '', email: PSF.user.email, contact: PSF.profile ? PSF.profile.phone : '', method },
      theme: { color: '#2f7bff' },
      handler: async (resp) => {
        const { data, error } = await PSF.sb.rpc('confirm_payment', { p_booking: b.id, p_gateway_payment_id: resp.razorpay_payment_id, p_method: method });
        if (error) return onResult({ error: error.message, paymentId: resp.razorpay_payment_id });
        onResult({ booking: data, paymentId: resp.razorpay_payment_id });
      },
      modal: { ondismiss: () => PSF.toast('Payment window closed — your slot is held until the timer ends.') },
    });
    rz.on('payment.failed', async (r) => {
      await PSF.sb.rpc('record_payment_failure', { p_booking: b.id, p_method: method, p_reason: (r.error && r.error.description) || 'failed' });
      PSF.toast('Payment failed: ' + ((r.error && r.error.description) || 'please try again'), 'error');
    });
    rz.open();
  }

  /* ---------------- BOOK ---------------- */
  PSF.route('/book/:id', async ({ params, view }) => {
    const stale = PSF.token();
    if (!PSF.requireDb(view)) return;
    const { data: loc, error } = await PSF.sb.from('locations').select('*').eq('id', params.id).maybeSingle();
    if (error || !loc) { view.innerHTML = '<div class="container section center"><h2>Location not found</h2><a class="btn btn-primary" style="margin-top:14px" href="#/find">Back to search</a></div>'; return; }
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date(); const s0 = new Date(Math.ceil((now.getTime() + 15 * 60000) / 900000) * 900000); const e0 = new Date(s0.getTime() + 2 * 3600000);
    const st = { date: `${s0.getFullYear()}-${pad(s0.getMonth() + 1)}-${pad(s0.getDate())}`, start: `${pad(s0.getHours())}:${pad(s0.getMinutes())}`, end: `${pad(e0.getHours())}:${pad(e0.getMinutes())}`, slot: null, slots: [], holds: [], booking: null };
    if (e0.getDate() !== s0.getDate()) st.end = '23:59';
    let stopTimer = null;
    const win = () => { const s = new Date(`${st.date}T${st.start}`), e = new Date(`${st.date}T${st.end}`); return { s, e, ok: !isNaN(s) && !isNaN(e) && e > s && s.getTime() > Date.now() - 5 * 60000 && (e - s) <= 24 * 3600000 }; };
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    view.innerHTML = `<div class="container book-grid"><div id="left"></div><div id="right"></div></div>`;

    async function loadSlots() {
      await PSF.sb.rpc('expire_pending');
      const [s, h] = await Promise.all([PSF.sb.from('slots').select('*').eq('location_id', loc.id), PSF.sb.from('slot_holds').select('*').eq('location_id', loc.id).gt('end_time', new Date().toISOString())]);
      if (stale()) return;
      st.slots = (s.data || []).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })); st.holds = h.data || [];
      if (st.slot && slotState(st.slots.find((x) => x.id === st.slot)) !== 'available') { st.slot = null; if (!st.booking) PSF.toast('Your selected slot was just taken. Please pick another.', 'error'); }
      if (!st.booking) { drawSlots(); drawSummary(); }
    }
    function slotState(sl) {
      if (!sl) return 'occupied';
      if (sl.status === 'maintenance') return 'maintenance';
      if (sl.status === 'occupied') return 'occupied';
      const { s, e } = win(); const n = Date.now();
      const ov = st.holds.filter((h) => h.slot_id === sl.id && new Date(h.start_time) < e && new Date(h.end_time) > s);
      if (!ov.length) return 'available';
      return ov.some((h) => new Date(h.start_time) <= n && new Date(h.end_time) > n) ? 'occupied' : 'reserved';
    }
    function drawLeft() {
      $('#left').innerHTML = `<div class="card" data-aos="fade-up"><a href="#/find" class="small"><i class="bi bi-arrow-left"></i> Back to map</a>
        <h2 style="margin:8px 0 4px">${esc(loc.name)}</h2><p class="muted"><i class="bi bi-geo-alt"></i> ${esc(loc.address)} · <b>${PSF.money(loc.price_per_hour)}</b>/hour · <a target="_blank" rel="noopener" href="${PSF.navLink(loc)}">Navigate <i class="bi bi-box-arrow-up-right"></i></a></p>
        ${loc.description ? `<p class="small" style="margin-top:8px">${esc(loc.description)}</p>` : ''}
        <div class="row c3" style="margin-top:18px"><div><label>Date</label><input type="date" id="bDate" min="${today}" value="${st.date}"></div><div><label>Entry time</label><input type="time" id="bStart" value="${st.start}"></div><div><label>Exit time</label><input type="time" id="bEnd" value="${st.end}"></div></div>
        <div class="err" id="bErr"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0 10px"><h3>Select your slot</h3><span class="tag ok"><i class="live-dot"></i> Live</span></div>
        <div class="legend" style="margin-bottom:12px"><span><i class="dot ok"></i>Available</span><span><i class="dot occ"></i>Occupied</span><span><i class="dot res"></i>Reserved</span><span><i class="dot maint"></i>Maintenance</span></div>
        <div id="slotGrid" class="slot-grid"></div></div>`;
      ['bDate', 'bStart', 'bEnd'].forEach((id) => ($('#' + id).onchange = (e) => { st[{ bDate: 'date', bStart: 'start', bEnd: 'end' }[id]] = e.target.value; drawSlots(); drawSummary(); }));
      drawSlots();
    }
    function drawSlots() {
      const g = $('#slotGrid'); if (!g) return; const w = win();
      $('#bErr').textContent = w.ok ? '' : (!st.date || !st.start || !st.end ? 'Choose date, entry and exit time.' : (w.e <= w.s ? 'Exit time must be after entry time (same day, max 24 h).' : 'Entry time cannot be in the past.'));
      if (!st.slots.length) return void (g.innerHTML = '<div class="empty" style="grid-column:1/-1">This location has no slots yet.</div>');
      g.innerHTML = st.slots.map((sl) => { const s = w.ok ? slotState(sl) : 'maintenance'; const lbl = { available: 'Free', occupied: 'Taken', reserved: 'Booked', maintenance: w.ok ? 'Closed' : '—' }[s];
        return `<div class="slot ${s} ${st.slot === sl.id ? 'selected' : ''}" data-id="${sl.id}" data-s="${s}">${esc(sl.label)}<small>${st.slot === sl.id ? 'Selected' : lbl}</small></div>`; }).join('');
      $$('.slot', g).forEach((el) => (el.onclick = () => { if (el.dataset.s !== 'available') return PSF.toast('That slot is not available for your time window', 'error'); st.slot = el.dataset.id; drawSlots(); drawSummary(); }));
    }
    function drawSummary() {
      if (!$('#right')) return;
      const w = win(); const sl = st.slots.find((x) => x.id === st.slot); const hrs = w.ok ? PSF.hours(w.s, w.e) : 0;
      $('#right').innerHTML = `<div class="card" style="position:sticky;top:90px" data-aos="fade-left"><h3 style="margin-bottom:10px">Booking summary</h3>
        <div class="summary-line"><span>Location</span><b>${esc(loc.name)}</b></div>
        <div class="summary-line"><span>Slot</span><b>${sl ? esc(sl.label) : '—'}</b></div>
        <div class="summary-line"><span>Entry</span><b>${w.ok ? PSF.fmtShort(w.s) : '—'}</b></div>
        <div class="summary-line"><span>Exit</span><b>${w.ok ? PSF.fmtShort(w.e) : '—'}</b></div>
        <div class="summary-line"><span>Duration</span><b>${hrs ? hrs + ' hr' + (hrs > 1 ? 's' : '') : '—'}</b></div>
        <div class="summary-line"><span>Rate</span><b>${PSF.money(loc.price_per_hour)}/hr</b></div>
        <div class="summary-line total"><span>Estimated total</span><span>${PSF.money(hrs * loc.price_per_hour)}</span></div>
        <button class="btn btn-primary btn-block btn-lg" id="reserveBtn" ${w.ok && sl ? '' : 'disabled'} style="margin-top:12px">Reserve &amp; continue to payment</button>
        <p class="hint center">Your slot is held for ${PSF.C.HOLD_MINUTES || 10} minutes while you pay.</p></div>`;
      $('#reserveBtn').onclick = reserve;
    }
    async function reserve() {
      const w = win(); const btn = $('#reserveBtn'); btn.disabled = true; btn.textContent = 'Reserving…';
      const { data, error } = await PSF.sb.rpc('create_booking', { p_slot: st.slot, p_start: w.s.toISOString(), p_end: w.e.toISOString() });
      if (stale()) return;
      if (error) { PSF.toast(PSF.errMsg(error), 'error'); st.slot = null; await loadSlots(); if (stale()) return; drawSummary(); return; }
      st.booking = data; drawPayment();
    }
    function drawPayment() {
      const b = st.booking; const sl = st.slots.find((x) => x.id === b.slot_id) || { label: '?' }; let method = 'upi';
      const hold = new Date(new Date(b.created_at).getTime() + (PSF.C.HOLD_MINUTES || 10) * 60000);
      const cfg = !!PSF.C.RAZORPAY_KEY_ID;
      $('#left').innerHTML = `<div class="card page-enter"><h2>Complete your payment</h2>
        <p class="muted" style="margin:6px 0 14px">Booking <b>${esc(b.booking_code)}</b> · Slot <b>${esc(sl.label)}</b> at ${esc(loc.name)}</p>
        <div class="card" style="text-align:center;margin-bottom:14px"><div class="muted small">Slot held for</div><div class="timer" id="holdT">--:--</div></div>
        ${cfg ? '' : '<div class="notice" style="margin-bottom:12px">Payment gateway is not configured. Add your Razorpay <b>test</b> key id in <code>js/config.js</code> to enable payment. No payment is simulated.</div>'}
        <label>Choose payment method</label><div class="pay-methods">${METHODS.map((m, i) => `<div class="pay-method ${i ? '' : 'sel'}" data-m="${m[0]}"><i class="bi ${m[1]}"></i>${m[2]}</div>`).join('')}</div>
        <button class="btn btn-primary btn-block btn-lg" id="payBtn" ${cfg ? '' : 'disabled'}><i class="bi bi-lock-fill"></i> Pay ${PSF.money(b.amount)}</button>
        <button class="btn btn-danger btn-block" id="cancelHold" style="margin-top:10px">Cancel this reservation</button>
        <p class="hint center">Secure checkout by Razorpay (test mode). Payment status is confirmed by the server, never assumed.</p></div>`;
      $('#right').innerHTML = `<div class="card"><h3 style="margin-bottom:10px">Price details</h3><div class="summary-line"><span>${PSF.hours(b.start_time, b.end_time)} hr × ${PSF.money(loc.price_per_hour)}</span><b>${PSF.money(b.amount)}</b></div><div class="summary-line"><span>Entry</span><b>${PSF.fmtShort(b.start_time)}</b></div><div class="summary-line"><span>Exit</span><b>${PSF.fmtShort(b.end_time)}</b></div><div class="summary-line total"><span>Total</span><span>${PSF.money(b.amount)}</span></div></div>`;
      $$('.pay-method').forEach((el) => (el.onclick = () => { $$('.pay-method').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); method = el.dataset.m; }));
      stopTimer = PSF.countdown($('#holdT'), hold, () => { $('#payBtn').disabled = true; $('#holdT').textContent = 'Hold expired'; PSF.toast('Reservation hold expired. Please start again.', 'error'); setTimeout(() => PSF.go('/book/' + loc.id), 1500); });
      $('#cancelHold').onclick = async () => { const { error } = await PSF.sb.rpc('cancel_booking', { p_booking: b.id }); if (error) return PSF.toast(PSF.errMsg(error), 'error'); PSF.go('/book/' + loc.id); };
      $('#payBtn').onclick = () => { $('#payBtn').disabled = true; pay(b, loc, sl.label, method, (r) => { $('#payBtn').disabled = false; if (r.error) return PSF.toast(`Payment received (${r.paymentId}) but confirmation failed: ${r.error}. Contact support with this ID.`, 'error'); if (r.booking.status !== 'confirmed') return PSF.toast(`Payment ${r.paymentId} was received after the hold expired and the slot was taken. It is marked for refund.`, 'error'); if (stopTimer) stopTimer(); drawConfirmed(r.booking, sl, loc); }); setTimeout(() => { const p = $('#payBtn'); if (p) p.disabled = false; }, 4000); };
    }
    function drawConfirmed(b, sl) {
      $('#left').innerHTML = `<div class="card center page-enter"><div class="success-check"><i class="bi bi-check-lg"></i></div><h2>Booking confirmed</h2><p class="muted">Payment verified by our server. Show this QR at the entrance.</p>
        <div class="qr-box" id="qrb" style="margin:18px 0"></div><h3>${esc(b.booking_code)}</h3>
        <p class="muted">${esc(loc.name)} · Slot ${esc(sl.label)}<br>${PSF.fmt(b.start_time)} → ${PSF.fmt(b.end_time)}</p>
        <div class="card" style="margin:16px auto;max-width:320px"><div class="muted small" id="cdLbl">Starts in</div><div class="timer" id="cdT"></div></div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="#/dashboard">My bookings</a><a class="btn btn-outline" target="_blank" rel="noopener" href="${PSF.navLink(loc)}"><i class="bi bi-cursor"></i> Navigate</a><button class="btn btn-outline" onclick="window.print()"><i class="bi bi-printer"></i> Print</button></div></div>`;
      $('#right').innerHTML = ''; PSF.qr($('#qrb'), qrText(b, sl.label), 170);
      const started = new Date(b.start_time) <= Date.now();
      $('#cdLbl').textContent = started ? 'Time remaining' : 'Starts in'; PSF.countdown($('#cdT'), started ? b.end_time : b.start_time);
    }

    drawLeft(); drawSummary(); await loadSlots();
    const off = PSF.live(['slot_holds', 'slots'], loadSlots);
    return () => { off(); if (stopTimer) stopTimer(); };
  }, { auth: true });

  /* ---------------- DASHBOARD ---------------- */
  PSF.route('/dashboard', async ({ query, view }) => {
    const stale = PSF.token();
    let tab = query.tab || 'current'; let D = null;
    view.innerHTML = `<div class="container dash"><div id="dhead"></div><div class="grid g4" id="dstats">${[1, 2, 3, 4].map(() => '<div class="card skeleton" style="height:110px"></div>').join('')}</div><div class="tabs" id="dtabs"></div><div id="dbody"></div></div>`;

    async function load() {
      if (!PSF.user) return;
      const uid = PSF.user.id;
      await PSF.sb.rpc('expire_pending');
      const [b, p, f] = await Promise.all([
        PSF.sb.from('bookings').select('*, locations(name,address,lat,lng,price_per_hour), slots(label)').eq('user_id', uid).order('start_time', { ascending: false }),
        PSF.sb.from('payments').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        PSF.sb.from('favourites').select('location_id, locations(*)').eq('user_id', uid),
      ]);
      for (const r of [b, p, f]) if (r.error) throw r.error;
      if (stale()) return;
      D = { bookings: b.data, payments: p.data, favs: f.data.map((x) => x.locations).filter(Boolean) };
      draw();
    }
    const payOf = (b) => D.payments.find((p) => p.booking_id === b.id && p.status !== 'failed');
    const cat = (b) => {
      const n = Date.now(), s = +new Date(b.start_time), e = +new Date(b.end_time);
      if (b.status === 'pending') return 'upcoming';
      if (b.status !== 'confirmed') return 'history';
      return e <= n ? 'history' : s <= n ? 'current' : 'upcoming';
    };
    const statusTag = (b) => { const c = cat(b); if (b.status === 'pending') return '<span class="tag res">Awaiting payment</span>'; if (b.status === 'cancelled') return '<span class="tag occ">Cancelled</span>'; if (b.status === 'expired') return '<span class="tag gray">Expired</span>'; return c === 'current' ? '<span class="tag ok">Active now</span>' : c === 'upcoming' ? '<span class="tag blue">Upcoming</span>' : '<span class="tag gray">Completed</span>'; };
    const canCancel = (b) => b.status === 'pending' || (b.status === 'confirmed' && new Date(b.start_time) > Date.now() + (PSF.C.CANCEL_BEFORE_HOURS || 1) * 3600000);

    function bookingCard(b) {
      const pay = payOf(b);
      return `<div class="card hover booking-card" style="margin-bottom:14px"><div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3>${esc(b.locations ? b.locations.name : 'Location')}</h3>${statusTag(b)}</div>
        <div class="muted small" style="margin-top:4px">${esc(b.booking_code)} · Slot ${esc(b.slots ? b.slots.label : '?')} · ${PSF.fmtShort(b.start_time)} → ${PSF.fmtShort(b.end_time)}</div>
        <div class="small" style="margin-top:4px"><b>${PSF.money(b.amount)}</b> · Payment: ${pay ? esc(pay.status.replace('_', ' ')) : b.status === 'pending' ? 'unpaid' : '—'}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" data-det="${b.id}"><i class="bi bi-eye"></i> Details</button>${b.status === 'pending' ? `<a class="btn btn-primary btn-sm" href="#/book/${b.location_id}">Pay</a>` : ''}${canCancel(b) ? `<button class="btn btn-danger btn-sm" data-cancel="${b.id}">Cancel</button>` : ''}</div></div>`;
    }
    function draw() {
      const spent = D.payments.filter((p) => p.status === 'paid').reduce((a, p) => a + +p.amount, 0);
      const cur = D.bookings.filter((b) => cat(b) === 'current'), up = D.bookings.filter((b) => cat(b) === 'upcoming'), hist = D.bookings.filter((b) => cat(b) === 'history');
      $('#dhead').innerHTML = `<h1 style="margin-bottom:4px">Hello, ${esc((PSF.profile && PSF.profile.full_name || 'there').split(' ')[0])} 👋</h1><p class="muted" style="margin-bottom:20px">Your parking at a glance.</p>`;
      $('#dstats').innerHTML = [['bi-car-front-fill', 'Active now', cur.length, 0], ['bi-calendar-event', 'Upcoming', up.length, 0], ['bi-clock-history', 'Past bookings', hist.length, 0], ['bi-wallet2', 'Total spent', spent, 1]].map((c) => `<div class="card stat-card hover"><i class="bi ${c[0]}"></i><div class="stat-num" data-to="${c[2]}" data-m="${c[3]}">0</div><div class="muted">${c[1]}</div></div>`).join('');
      $$('#dstats .stat-num').forEach((el) => { PSF.counter(el, +el.dataset.to); if (el.dataset.m === '1') setTimeout(() => (el.textContent = PSF.money(+el.dataset.to)), 1050); });
      const T = [['current', 'Current'], ['upcoming', 'Upcoming'], ['history', 'History'], ['favs', 'Favourites'], ['payments', 'Transactions'], ['profile', 'Profile']];
      $('#dtabs').innerHTML = T.map((t) => `<button class="tab ${t[0] === tab ? 'active' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('');
      $$('#dtabs .tab').forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
      const body = $('#dbody'); const empty = (i, m, cta) => `<div class="card empty"><i class="bi ${i}"></i>${m}${cta ? `<div style="margin-top:14px"><a class="btn btn-primary" href="#/find">Find parking</a></div>` : ''}</div>`;
      if (tab === 'current') body.innerHTML = cur.length ? cur.map(bookingCard).join('') : empty('bi-car-front', 'No active parking right now.', 1);
      else if (tab === 'upcoming') body.innerHTML = up.length ? up.map(bookingCard).join('') : empty('bi-calendar-x', 'No upcoming reservations.', 1);
      else if (tab === 'history') body.innerHTML = hist.length ? hist.map(bookingCard).join('') : empty('bi-clock-history', 'Your booking history will appear here.');
      else if (tab === 'favs') {
        body.innerHTML = D.favs.length ? `<div class="grid g3" id="favGrid">${D.favs.map((l) => PSF.cardHTML({ ...l, total: 0, avail: 0, occ: 0, res: 0 }, { compact: true })).join('')}</div>` : empty('bi-heart', 'No favourites yet. Tap the heart on any parking location.', 1);
        const g = $('#favGrid'); if (g) PSF.bindCards(g, async () => { await load(); });
      } else if (tab === 'payments') body.innerHTML = D.payments.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Booking</th><th>Amount</th><th>Method</th><th>Status</th><th>Reference</th></tr></thead><tbody>${D.payments.map((p) => { const bk = D.bookings.find((b) => b.id === p.booking_id); return `<tr><td>${PSF.fmtShort(p.created_at)}</td><td>${esc(bk ? bk.booking_code : '—')}</td><td>${PSF.money(p.amount)}</td><td>${esc(p.method || '—')}</td><td><span class="tag ${p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'occ' : 'res'}">${esc(p.status.replace('_', ' '))}</span></td><td>${esc(p.gateway_payment_id || '—')}</td></tr>`; }).join('')}</tbody></table></div>` : empty('bi-receipt', 'No transactions yet.');
      else drawProfile(body);
    }
    function drawProfile(body) {
      const p = PSF.profile || {};
      body.innerHTML = `<div class="grid g2"><form class="card" id="pf"><h3 style="margin-bottom:14px">Profile</h3><div class="field"><label>Full name</label><input name="name" required value="${esc(p.full_name)}"></div><div class="field"><label>Email</label><input value="${esc(PSF.user.email)}" disabled></div><div class="field"><label>Phone</label><input name="phone" value="${esc(p.phone)}"></div><button class="btn btn-primary">Save profile</button></form>
        <form class="card" id="pwf"><h3 style="margin-bottom:14px">Change password</h3><div class="field"><label>New password</label><input type="password" name="pw" required autocomplete="new-password"><div class="hint">8+ characters with uppercase, lowercase and a number.</div></div><div class="field"><label>Confirm</label><input type="password" name="pw2" required autocomplete="new-password"></div><div class="err" id="pwErr"></div><button class="btn btn-primary">Update password</button></form></div>`;
      $('#pf').onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); const { error } = await PSF.sb.from('profiles').update({ full_name: f.get('name').trim(), phone: f.get('phone').trim() }).eq('id', PSF.user.id); if (error) return PSF.toast(PSF.errMsg(error), 'error'); await PSF.refreshProfile(); PSF.toast('Profile saved', 'success'); };
      $('#pwf').onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target), pw = f.get('pw'); $('#pwErr').textContent = ''; if (!(pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw))) return ($('#pwErr').textContent = 'Password is too weak.'); if (pw !== f.get('pw2')) return ($('#pwErr').textContent = 'Passwords do not match.'); const { error } = await PSF.sb.auth.updateUser({ password: pw }); if (error) return ($('#pwErr').textContent = error.message); e.target.reset(); PSF.toast('Password updated', 'success'); };
    }
    function details(b) {
      const pay = payOf(b); const sl = b.slots ? b.slots.label : '?';
      const m = PSF.modal(`<h2 style="margin-bottom:4px">${esc(b.locations.name)}</h2><p class="muted small">${esc(b.locations.address)}</p><div style="margin:12px 0">${statusTag(b)}</div>
        ${b.status === 'confirmed' ? '<div class="center"><div class="qr-box" id="dq"></div></div>' : ''}
        <div class="summary-line"><span>Booking ID</span><b>${esc(b.booking_code)}</b></div><div class="summary-line"><span>Slot</span><b>${esc(sl)}</b></div>
        <div class="summary-line"><span>Entry</span><b>${PSF.fmt(b.start_time)}</b></div><div class="summary-line"><span>Exit</span><b>${PSF.fmt(b.end_time)}</b></div>
        <div class="summary-line"><span>Amount</span><b>${PSF.money(b.amount)}</b></div><div class="summary-line"><span>Payment</span><b>${pay ? esc(pay.status.replace('_', ' ')) : 'unpaid'}${pay && pay.gateway_payment_id ? ' · ' + esc(pay.gateway_payment_id) : ''}</b></div>
        ${b.status === 'confirmed' && cat(b) !== 'history' ? `<div class="card center" style="margin:14px 0"><div class="muted small" id="dl"></div><div class="timer" id="dt"></div></div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><a class="btn btn-outline" target="_blank" rel="noopener" href="${PSF.navLink(b.locations)}"><i class="bi bi-cursor"></i> Navigate</a>${canCancel(b) ? '<button class="btn btn-danger" id="dc">Cancel booking</button>' : ''}</div>
        ${b.status === 'confirmed' && !canCancel(b) && cat(b) !== 'history' ? `<p class="hint">Cancellation is closed (less than ${PSF.C.CANCEL_BEFORE_HOURS || 1} h before entry).</p>` : ''}`, {});
      if ($('#dq', m.el)) PSF.qr($('#dq', m.el), qrText(b, sl), 150);
      if ($('#dt', m.el)) { const started = new Date(b.start_time) <= Date.now(); $('#dl', m.el).textContent = started ? 'Time remaining' : 'Starts in'; PSF.countdown($('#dt', m.el), started ? b.end_time : b.start_time); }
      if ($('#dc', m.el)) $('#dc', m.el).onclick = () => { m.close(); doCancel(b.id); };
    }
    async function doCancel(id) {
      if (!confirm('Cancel this booking? Paid amounts will be marked for refund.')) return;
      const { error } = await PSF.sb.rpc('cancel_booking', { p_booking: id });
      if (error) return PSF.toast(PSF.errMsg(error), 'error'); PSF.toast('Booking cancelled', 'success'); load();
    }
    $('#dbody').addEventListener('click', (e) => {
      const d = e.target.closest('[data-det]'); if (d) return details(D.bookings.find((b) => b.id === d.dataset.det));
      const c = e.target.closest('[data-cancel]'); if (c) doCancel(c.dataset.cancel);
    });
    await load();
    const off = PSF.live(['bookings'], load);
    const iv = setInterval(() => D && draw(), 60000);
    return () => { off(); clearInterval(iv); };
  }, { auth: true });
})();
