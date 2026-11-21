/* Public pages: home, find, auth, static pages */
(function () {
  'use strict';
  const { $, $$, esc } = PSF;

  /* ---------------- HOME ---------------- */
  const heroSVG = `<svg viewBox="0 0 520 420" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5cb6ff"/><stop offset="1" stop-color="#2f7bff"/></linearGradient>
    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dcecff"/></linearGradient></defs>
    <rect x="20" y="250" width="480" height="140" rx="24" fill="url(#g2)" stroke="#cfe3ff"/>
    <g stroke="#9ec5ff" stroke-width="4" stroke-dasharray="10 8"><line x1="120" y1="270" x2="120" y2="380"/><line x1="230" y1="270" x2="230" y2="380"/><line x1="340" y1="270" x2="340" y2="380"/><line x1="440" y1="270" x2="440" y2="380"/></g>
    <g class="float"><rect x="60" y="30" width="86" height="86" rx="22" fill="url(#g1)"/><text x="103" y="94" font-size="58" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial">P</text></g>
    <g class="float d2"><path d="M360 40c-30 0-52 22-52 50 0 38 52 90 52 90s52-52 52-90c0-28-22-50-52-50z" fill="#17b26a"/><circle cx="360" cy="90" r="20" fill="#fff"/><text x="360" y="97" font-size="20" font-weight="800" text-anchor="middle" fill="#17b26a" font-family="Arial">P</text></g>
    <g class="float d3"><rect x="150" y="140" width="130" height="80" rx="16" fill="#fff" stroke="#cfe3ff"/><rect x="164" y="156" width="60" height="10" rx="5" fill="#cfe3ff"/><rect x="164" y="176" width="100" height="8" rx="4" fill="#e5f0ff"/><rect x="164" y="194" width="40" height="14" rx="7" fill="#17b26a"/></g>
    <g transform="translate(40 290)"><rect x="0" y="22" width="150" height="46" rx="14" fill="#2f7bff"/><path d="M26 22l16-24h66l18 24z" fill="#5cb6ff"/><rect x="48" y="-12" width="22" height="26" rx="4" fill="#e9f4ff" transform="translate(-6 2)"/><rect x="78" y="-12" width="30" height="26" rx="4" fill="#e9f4ff" transform="translate(-8 2)"/><circle cx="36" cy="72" r="16" fill="#0f1b33"/><circle cx="36" cy="72" r="7" fill="#cfe3ff"/><circle cx="116" cy="72" r="16" fill="#0f1b33"/><circle cx="116" cy="72" r="7" fill="#cfe3ff"/></g>
    <g transform="translate(250 300)"><rect x="0" y="22" width="150" height="46" rx="14" fill="#f79009" opacity=".9"/><path d="M26 22l16-24h66l18 24z" fill="#fdb022"/><circle cx="36" cy="72" r="16" fill="#0f1b33"/><circle cx="36" cy="72" r="7" fill="#cfe3ff"/><circle cx="116" cy="72" r="16" fill="#0f1b33"/><circle cx="116" cy="72" r="7" fill="#cfe3ff"/></g>
  </svg>`;

  PSF.route('/', async ({ view }) => {
    const stale = PSF.token();
    view.innerHTML = `
    <section class="hero"><div class="container hero-grid">
      <div data-aos="fade-right">
        <span class="pill"><i class="live-dot"></i> Live parking availability</span>
        <h1>Find Your <span class="grad-text">Perfect Parking Spot</span></h1>
        <p class="sub">Smart Parking, Stress-Free Driving</p>
        <form class="search-bar" id="heroSearch"><i class="bi bi-geo-alt-fill pin"></i>
          <input id="heroQ" placeholder="Enter city, area or destination" aria-label="Search location" autocomplete="off">
          <button class="btn btn-primary btn-lg" type="submit"><i class="bi bi-search"></i> Find Parking</button></form>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-outline btn-sm" href="#/find?near=1"><i class="bi bi-crosshair"></i> Use my location</a><a class="btn btn-outline btn-sm" href="#/find">Browse all on map</a></div>
      </div>
      <div class="hero-art" data-aos="zoom-in">${heroSVG}
        <div class="chip-float float" style="left:2%;top:46%"><i class="bi bi-lightning-charge-fill" style="color:var(--res)"></i> Instant booking</div>
        <div class="chip-float float d2" style="right:0;top:60%"><i class="bi bi-qr-code" style="color:var(--primary)"></i> QR entry</div>
      </div></div></section>

    <section class="section" style="padding-top:20px"><div class="container">
      <div class="section-head" data-aos="fade-up"><h2>Live availability</h2><p><i class="live-dot"></i> Updates in real time as drivers book</p></div>
      <div class="grid g4" id="liveStats">${[1, 2, 3, 4].map(() => '<div class="card skeleton" style="height:120px"></div>').join('')}</div>
      <div class="card" style="margin-top:22px" id="liveList" data-aos="fade-up"><div class="skeleton" style="height:90px"></div></div>
    </div></section>

    <section class="section"><div class="container">
      <div class="section-head" data-aos="fade-up"><h2>Popular parking locations</h2><p>Most booked spots right now</p></div>
      <div class="grid g3" id="popular">${[1, 2, 3].map(() => '<div class="card skeleton sk-card"></div>').join('')}</div>
      <div class="center" style="margin-top:26px"><a class="btn btn-outline" href="#/find">View all on map <i class="bi bi-arrow-right"></i></a></div>
    </div></section>

    <section class="section"><div class="container">
      <div class="section-head" data-aos="fade-up"><h2>How it works</h2><p>Three steps to a stress-free park</p></div>
      <div class="grid g3">
        ${[['bi-search', 'Search', 'Find parking by city, area or your live location and compare price and availability.'], ['bi-grid-3x3-gap-fill', 'Pick a slot', 'Choose date and time, then select your exact slot. Double bookings are impossible.'], ['bi-qr-code-scan', 'Pay & park', 'Pay securely, receive your QR confirmation and drive straight in.']].map((s, i) => `<div class="card hover stat-card" data-aos="fade-up" data-aos-delay="${i * 100}"><i class="bi ${s[0]}"></i><h3 style="margin:10px 0 6px">${s[1]}</h3><p class="muted">${s[2]}</p></div>`).join('')}
      </div></div></section>

    <section class="section"><div class="container" style="max-width:820px">
      <div class="section-head" data-aos="fade-up"><h2>Contact &amp; feedback</h2><p>We read every message</p></div><div id="fbBox" data-aos="fade-up"></div></div></section>`;

    $('#heroSearch').onsubmit = (e) => { e.preventDefault(); PSF.go('/find?q=' + encodeURIComponent($('#heroQ').value.trim())); };
    PSF.feedbackForm($('#fbBox'));
    if (!PSF.configured) {
      $('#liveStats').innerHTML = '<div class="notice" style="grid-column:1/-1">Backend not configured yet — add your Supabase keys in <code>js/config.js</code> to see live data.</div>';
      $('#liveList').remove(); $('#popular').innerHTML = ''; return;
    }
    const load = async () => {
      let b;
      try { b = await PSF.loadBoard(); } catch (e) { if (stale()) return; $('#liveStats').innerHTML = `<div class="notice err-box" style="grid-column:1/-1">${esc(PSF.errMsg(e))}</div>`; return; }
      if (stale()) return;
      const rows = b.locations.map((l) => ({ ...l, ...PSF.stats(l, b.slots, b.holds), booked: b.holds.filter((h) => h.location_id === l.id).length }));
      const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
      const cards = [['bi-geo-alt-fill', 'Locations', rows.length], ['bi-grid-3x3-gap-fill', 'Total slots', sum('total')], ['bi-check-circle-fill', 'Available now', sum('avail')], ['bi-car-front-fill', 'Occupied / reserved', sum('occ') + sum('res')]];
      $('#liveStats').innerHTML = cards.map((c) => `<div class="card stat-card hover"><i class="bi ${c[0]}"></i><div class="stat-num" data-to="${c[2]}">0</div><div class="muted">${c[1]}</div></div>`).join('');
      $$('#liveStats .stat-num').forEach((el) => PSF.counter(el, +el.dataset.to));
      $('#liveList').innerHTML = rows.length ? rows.slice().sort((a, b) => b.avail - a.avail).slice(0, 5).map((r) => `<div class="summary-line"><span><b>${esc(r.name)}</b> <span class="muted small">· ${esc(r.city || r.address)}</span></span><span><span class="tag ok">${r.avail} free</span> <span class="tag occ">${r.occ} occupied</span> <span class="tag res">${r.res} reserved</span></span></div>`).join('')
        : '<div class="empty"><i class="bi bi-p-square"></i>No parking locations have been added yet. Admins can add them from the admin panel.</div>';
      const pop = rows.slice().sort((a, b) => b.booked - a.booked || b.avail - a.avail).slice(0, 3);
      $('#popular').innerHTML = pop.length ? pop.map((l) => PSF.cardHTML(l)).join('') : '<div class="empty" style="grid-column:1/-1"><i class="bi bi-geo"></i>No locations yet.</div>';
    };
    await load();
    if (stale()) return;
    PSF.bindCards($('#popular'));
    const off = PSF.live(['slot_holds', 'slots', 'locations'], load);
    return off;
  });

  /* ---------------- FIND (map + list) ---------------- */
  PSF.route('/find', async ({ query, view }) => {
    const stale = PSF.token();
    if (!PSF.requireDb(view)) return;
    view.innerHTML = `<div class="container find-wrap">
      <div class="find-side">
        <form class="card" id="fForm"><div class="field" style="display:flex;gap:8px"><input id="fQ" placeholder="City, area, or parking name" value="${esc(query.q || '')}"><button class="btn btn-primary" type="submit" aria-label="Search"><i class="bi bi-search"></i></button></div>
          <div class="filters">
            <div class="row c2"><div><label>Sort by</label><select id="fSort"><option value="nearest">Nearest</option><option value="priceAsc">Price: low to high</option><option value="priceDesc">Price: high to low</option><option value="avail">Most available</option></select></div>
            <div><label>Max price: <b id="pVal">any</b></label><input type="range" id="fPrice" min="0" max="500" step="10" value="500"></div></div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:.88rem"><label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="fAvail"> Available only</label><label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="fFav"> Favourites</label></div>
            <button class="btn btn-outline btn-sm" type="button" id="locBtn"><i class="bi bi-crosshair"></i> Use my location</button>
          </div></form>
        <div class="legend"><span><i class="dot ok"></i>Available</span><span><i class="dot occ"></i>Occupied</span><span><i class="dot res"></i>Reserved (soon)</span><span class="tag ok"><i class="live-dot"></i> Live</span></div>
        <div id="fNote" class="muted small"></div>
        <div id="recoBox"></div>
        <div id="find-list" class="grid">${[1, 2].map(() => '<div class="card skeleton sk-card"></div>').join('')}</div>
      </div><div id="map" aria-label="Parking map"></div></div>`;

    const map = L.map('map', { zoomControl: true }).setView([20.59, 78.96], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    const layer = L.layerGroup().addTo(map); let me = null;
    let data = { locations: [], slots: [], holds: [] }, ref = null, refLabel = '', fitNext = true;
    const f = { q: query.q || '', sort: 'nearest', max: 500, avail: false, fav: false };
    const markers = {};

    const setRef = (lat, lng, label, zoom = 14) => {
      ref = { lat, lng }; refLabel = label;
      if (me) map.removeLayer(me);
      me = L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#2f7bff', fillOpacity: 1 }).addTo(map).bindTooltip(label);
      map.flyTo([lat, lng], zoom); fitNext = false;
    };
    const useLocation = () => {
      if (!navigator.geolocation) return PSF.toast('Geolocation is not supported by your browser', 'error');
      navigator.geolocation.getCurrentPosition((p) => { if (stale()) return; setRef(p.coords.latitude, p.coords.longitude, 'Your location'); render(); }, () => PSF.toast('Location permission denied — you can still search by area', 'error'), { enableHighAccuracy: true, timeout: 10000 });
    };
    const geocode = async (q) => {
      try { const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q)); const j = await r.json(); return j[0] ? { lat: +j[0].lat, lng: +j[0].lon, name: j[0].display_name } : null; } catch (e) { return null; }
    };

    function enriched() {
      let rows = data.locations.map((l) => ({ ...l, ...PSF.stats(l, data.slots, data.holds), dist: ref ? PSF.haversine(ref, l) : null }));
      const q = f.q.trim().toLowerCase();
      if (q) rows = rows.filter((l) => [l.name, l.address, l.city].join(' ').toLowerCase().includes(q));
      if (f.max < 500) rows = rows.filter((l) => +l.price_per_hour <= f.max);
      if (f.avail) rows = rows.filter((l) => l.avail > 0);
      if (f.fav) rows = rows.filter((l) => PSF.favs.has(l.id));
      const s = { nearest: (a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9) || a.name.localeCompare(b.name), priceAsc: (a, b) => a.price_per_hour - b.price_per_hour, priceDesc: (a, b) => b.price_per_hour - a.price_per_hour, avail: (a, b) => b.avail - a.avail }[f.sort];
      return rows.sort(s);
    }
    function render() {
      if (stale()) return;
      const rows = enriched();
      layer.clearLayers();
      rows.forEach((l) => {
        const cls = l.avail === 0 ? (l.occ >= l.res ? 'occ' : 'res') : 'ok';
        const icon = L.divIcon({ className: '', html: `<div class="pin-marker ${cls}"><span>${l.avail}</span></div>`, iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -36] });
        const m = L.marker([l.lat, l.lng], { icon }).addTo(layer);
        m.bindPopup(`<b>${esc(l.name)}</b><br><span class="small">${esc(l.address)}</span><br>${PSF.money(l.price_per_hour)}/hr · <b>${l.avail}</b> of ${l.total} free${l.dist != null ? ' · ' + PSF.fmtDist(l.dist) : ''}<br><a href="#/book/${l.id}">Book</a> · <a target="_blank" rel="noopener" href="${PSF.navLink(l)}">Navigate</a>`);
        markers[l.id] = m;
      });
      if (fitNext && rows.length) { map.fitBounds(L.latLngBounds(rows.map((l) => [l.lat, l.lng])).pad(0.2), { maxZoom: 15 }); fitNext = false; }
      $('#fNote').textContent = ref ? `Distances from ${refLabel}. ${rows.length} result(s).` : `${rows.length} result(s). Use “my location” for distances.`;
      // recommendations
      const reco = ref ? rows.filter((l) => l.avail > 0).map((l) => ({ l, s: l.dist + l.price_per_hour / 25 })).sort((a, b) => a.s - b.s).slice(0, 3).map((x) => x.l) : [];
      $('#recoBox').innerHTML = reco.length ? `<div class="card" style="padding:14px"><b><i class="bi bi-stars" style="color:var(--primary)"></i> Recommended near you</b>${reco.map((l) => `<div class="summary-line"><a href="#/book/${l.id}">${esc(l.name)}</a><span class="small muted">${PSF.fmtDist(l.dist)} · ${PSF.money(l.price_per_hour)}/hr · ${l.avail} free</span></div>`).join('')}</div>` : '';
      $('#find-list').innerHTML = rows.length ? rows.map((l) => PSF.cardHTML(l)).join('') : `<div class="empty card"><i class="bi bi-search"></i>${data.locations.length ? 'No parking matches your filters.' : 'No parking locations have been added yet.'}</div>`;
    }
    async function load() { try { data = await PSF.loadBoard(); } catch (e) { PSF.toast(PSF.errMsg(e), 'error'); } render(); }
    async function search() {
      f.q = $('#fQ').value;
      fitNext = true;
      const hit = enriched();
      if (f.q.trim() && !hit.length) {
        const g = await geocode(f.q); if (stale()) return;
        if (g) { setRef(g.lat, g.lng, g.name.split(',').slice(0, 2).join(','), 13); f.q = ''; PSF.toast('Showing parking nearest to "' + $('#fQ').value + '"', 'info'); }
        else PSF.toast('Could not find that place', 'error');
      }
      render();
    }

    $('#fForm').onsubmit = (e) => { e.preventDefault(); search(); };
    $('#fSort').onchange = (e) => { f.sort = e.target.value; render(); };
    $('#fPrice').oninput = (e) => { f.max = +e.target.value; $('#pVal').textContent = f.max >= 500 ? 'any' : '≤ ₹' + f.max; render(); };
    $('#fAvail').onchange = (e) => { f.avail = e.target.checked; render(); };
    $('#fFav').onchange = (e) => { f.fav = e.target.checked; if (f.fav && !PSF.user) { e.target.checked = false; f.fav = false; PSF.toast('Log in to use favourites', 'error'); } render(); };
    $('#locBtn').onclick = useLocation;
    $('#find-list').addEventListener('click', (e) => { const c = e.target.closest('.loc-card'); if (c && !e.target.closest('a,button') && markers[c.dataset.id]) { const m = markers[c.dataset.id]; map.flyTo(m.getLatLng(), 16); m.openPopup(); } });
    PSF.bindCards($('#find-list'), () => render());

    await load();
    if (stale()) { map.remove(); return; }
    if (query.near) useLocation(); else if (f.q) await search();
    const off = PSF.live(['slot_holds', 'slots', 'locations'], load);
    const iv = setInterval(render, 60000);
    setTimeout(() => map.invalidateSize(), 200);
    return () => { off(); clearInterval(iv); map.remove(); };
  });

  /* ---------------- AUTH ---------------- */
  const pwRules = (p) => ({ len: p.length >= 8, up: /[A-Z]/.test(p), low: /[a-z]/.test(p), num: /\d/.test(p), sym: /[^A-Za-z0-9]/.test(p) });
  const authShell = (inner) => `<div class="auth-wrap"><div class="card auth-card" data-aos="zoom-in">${inner}</div></div>`;

  PSF.route('/login', ({ query, view }) => {
    if (!PSF.requireDb(view)) return;
    if (PSF.user) return PSF.go(query.next ? decodeURIComponent(query.next) : '/dashboard');
    view.innerHTML = authShell(`<h2>Welcome back</h2><p class="muted" style="margin-bottom:18px">Log in to manage your parking bookings.</p>
      <form id="lf"><div class="field"><label>Email</label><input type="email" name="email" required autocomplete="email"></div>
      <div class="field"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div><div class="err" id="lerr"></div>
      <button class="btn btn-primary btn-block" id="lbtn">Log in</button></form>
      <p class="small center" style="margin-top:14px"><a href="#" id="forgot">Forgot password?</a></p>
      <p class="small center muted" style="margin-top:8px">New here? <a href="#/register">Create an account</a></p>`);
    $('#lf').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target); $('#lbtn').disabled = true; $('#lerr').textContent = '';
      const { error } = await PSF.sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('password') });
      $('#lbtn').disabled = false;
      if (error) $('#lerr').textContent = error.message; else PSF.toast('Logged in', 'success');
    };
    $('#forgot').onclick = async (e) => {
      e.preventDefault(); const em = $('#lf [name=email]').value.trim();
      if (!em) return ($('#lerr').textContent = 'Enter your email above first.');
      const { error } = await PSF.sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
      error ? ($('#lerr').textContent = error.message) : PSF.toast('Password reset email sent', 'success');
    };
  });

  PSF.route('/register', ({ view }) => {
    if (!PSF.requireDb(view)) return;
    if (PSF.user) return PSF.go('/dashboard');
    view.innerHTML = authShell(`<h2>Create your account</h2><p class="muted" style="margin-bottom:18px">Book parking in seconds.</p>
      <form id="rf"><div class="field"><label>Full name</label><input name="name" required minlength="2" maxlength="80"></div>
      <div class="row c2"><div class="field"><label>Email</label><input type="email" name="email" required></div><div class="field"><label>Phone</label><input name="phone" type="tel" pattern="[0-9+\\- ]{8,15}" placeholder="optional" ></div></div>
      <div class="field"><label>Password</label><input type="password" name="password" id="pw" required autocomplete="new-password">
        <div class="pw-rules" id="rules"><span data-k="len">8+ chars</span><span data-k="up">Uppercase</span><span data-k="low">Lowercase</span><span data-k="num">Number</span><span data-k="sym">Symbol</span></div></div>
      <div class="field"><label>Confirm password</label><input type="password" name="confirm" required autocomplete="new-password"></div><div class="err" id="rerr"></div>
      <button class="btn btn-primary btn-block" id="rbtn">Create account</button></form>
      <p class="small center muted" style="margin-top:14px">Already registered? <a href="#/login">Log in</a></p>`);
    $('#pw').oninput = (e) => { const r = pwRules(e.target.value); $$('#rules span').forEach((s) => s.classList.toggle('ok', r[s.dataset.k])); };
    $('#rf').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target); const r = pwRules(f.get('password')); $('#rerr').textContent = '';
      if (!(r.len && r.up && r.low && r.num)) return ($('#rerr').textContent = 'Password needs 8+ characters with uppercase, lowercase and a number.');
      if (f.get('password') !== f.get('confirm')) return ($('#rerr').textContent = 'Passwords do not match.');
      $('#rbtn').disabled = true;
      const { data, error } = await PSF.sb.auth.signUp({ email: f.get('email').trim(), password: f.get('password'), options: { data: { full_name: f.get('name').trim(), phone: f.get('phone') } } });
      $('#rbtn').disabled = false;
      if (error) return ($('#rerr').textContent = error.message);
      if (!data.session) { PSF.toast('Account created! Check your email to confirm, then log in.', 'success'); PSF.go('/login'); }
    };
  });

  PSF.route('/admin-login', ({ query, view }) => {
    if (!PSF.requireDb(view)) return;
    if (PSF.user && PSF.profile && PSF.profile.role === 'admin') return PSF.go('/admin');
    view.innerHTML = authShell(`<span class="pill"><i class="bi bi-shield-lock-fill"></i> Admin portal</span><h2 style="margin:12px 0 6px">Administrator login</h2><p class="muted" style="margin-bottom:18px">Authorised staff only.</p>
      <form id="af"><div class="field"><label>Admin email</label><input type="email" name="email" required></div><div class="field"><label>Password</label><input type="password" name="password" required></div><div class="err" id="aerr"></div>
      <button class="btn btn-primary btn-block" id="abtn">Sign in as admin</button></form>`);
    $('#af').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target); $('#abtn').disabled = true; $('#aerr').textContent = '';
      const { data, error } = await PSF.sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('password') });
      if (error) { $('#abtn').disabled = false; return ($('#aerr').textContent = error.message); }
      const { data: p } = await PSF.sb.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
      if (!p || p.role !== 'admin') { PSF.quietSignOut = true; await PSF.sb.auth.signOut(); $('#abtn').disabled = false; return ($('#aerr').textContent = 'This account does not have admin access.'); }
      await PSF.refreshProfile(); PSF.go('/admin');
    };
  });

  /* ---------------- STATIC PAGES ---------------- */
  const pages = {
    about: ['About Us', '<p>Parking Slot Finder helps drivers find, reserve and pay for parking in real time, and gives parking operators a simple dashboard to manage locations, slots and revenue.</p><h3>Our mission</h3><p>Make parking predictable: no circling the block, no double-booked slots, no cash hassles.</p><h3>How it works</h3><p>Operators publish their locations and slots. Drivers see live availability on a map, pick a slot for a time window, pay online and receive a QR confirmation.</p>'],
    privacy: ['Privacy Policy', '<p>We store only the data needed to run the service: your name, email, phone number, bookings, favourites and payment records (payment amounts and gateway reference IDs — never card or UPI details, which are handled by the payment gateway).</p><h3>Location</h3><p>Your device location is used only in your browser to show nearby parking and distances, and only after you grant permission. It is not stored.</p><h3>Your rights</h3><p>You can edit your profile any time from the dashboard. To request deletion of your account, use the Contact page.</p>'],
    terms: ['Terms &amp; Conditions', '<ul><li>Bookings are for the selected slot and time window only; overstaying may be charged by the operator.</li><li>A slot is held for 10 minutes while you complete payment, after which the hold is released.</li><li>Confirmed bookings can be cancelled up to 1 hour before entry time; paid amounts are then marked for refund.</li><li>Parking is at the owner’s risk; operators are responsible for their premises.</li><li>We may suspend accounts that misuse the service.</li></ul>'],
    faq: ['FAQs', ['How do I book a slot?|Search a location, choose date and entry/exit time, pick a free slot, then pay. You will get a booking ID and QR code.', 'Can two people book the same slot?|No. The database rejects overlapping bookings for the same slot, even if two users click at the same moment.', 'How long is my slot held?|10 minutes while you complete payment.', 'Can I cancel?|Yes, confirmed bookings can be cancelled up to 1 hour before the entry time from your dashboard.', 'Which payment methods are supported?|UPI, cards, net banking and wallets through Razorpay.', 'How is the price calculated?|Hourly rate × hours, rounded up to the next full hour.']],
  };
  PSF.route('/page/:slug', ({ params, view }) => {
    if (params.slug === 'contact') {
      view.innerHTML = `<div class="container prose"><h1>Contact Us</h1><p>Questions, feedback or partnership requests? Send us a message below.</p><div id="cf" style="margin-top:18px"></div></div>`;
      return PSF.feedbackForm($('#cf'));
    }
    const p = pages[params.slug];
    if (!p) return void (view.innerHTML = '<div class="container section center"><h2>Page not found</h2></div>');
    view.innerHTML = `<div class="container prose"><h1>${p[0]}</h1>${Array.isArray(p[1]) ? p[1].map((x) => { const [q, a] = x.split('|'); return `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`; }).join('') : p[1]}</div>`;
  });
})();
