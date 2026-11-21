# Parking Slot Finder

Smart Parking, Stress-Free Driving — a full-stack parking finder & booking platform.

**Stack:** HTML/CSS/vanilla JS (no build step) · Supabase (Auth, Postgres, Realtime, Row Level Security) · Leaflet + OpenStreetMap · Razorpay (test mode) · Chart.js · AOS · QRCode.js

```
parking-slot-finder/
├── index.html
├── css/styles.css          design system, light/dark themes, responsive
├── js/config.js            <- put your keys here
├── js/core.js              router, auth, nav/footer, notifications, shared helpers
├── js/public.js            home, live finder map, login/register/admin login, info pages
├── js/user.js              booking + payment flow, dashboard, profile
├── js/admin.js             admin panel (analytics, locations, slots, bookings, users, payments, feedback)
└── supabase/schema.sql     tables, double-booking constraint, RLS, realtime, booking functions
```

## Setup (about 10 minutes)

1. **Supabase project** – create one at supabase.com (free tier is fine).
2. **Database** – Dashboard → SQL Editor → paste all of `supabase/schema.sql` → Run.
3. **Keys** – Project Settings → API → copy *Project URL* and the *anon public* key into `js/config.js`. Never use the `service_role` key in the frontend.
4. **Auth** – Authentication → Providers → Email is on by default. For quick testing, turn off "Confirm email" (otherwise users must click the emailed link). Add your site URL under Authentication → URL Configuration.
5. **Razorpay test mode** – sign up at razorpay.com, switch to *Test Mode*, Settings → API Keys → generate a test key. Put the `rzp_test_...` **key id** in `js/config.js` (never the secret). Test UPI id: `success@razorpay`; test card: `4111 1111 1111 1111`, any future expiry, any CVV.
6. **Run locally** – `python3 -m http.server 8000` inside this folder, open http://localhost:8000.
7. **Create an admin** – register on the site, then run in the SQL Editor:
   `update public.profiles set role = 'admin' where email = 'you@example.com';`
   Log in via the footer's *Admin login*. Add locations (click the map to place a pin) and slots from the admin panel.

Deploy: the folder is fully static — drag it onto Netlify, or use Vercel / GitHub Pages / Cloudflare Pages.

## How the important parts work

- **No double booking:** a Postgres exclusion constraint (`no_double_booking`) rejects overlapping time ranges on the same slot, so it holds even for simultaneous clicks.
- **Real-time:** the public `slot_holds` table (no personal data) is in the Realtime publication; every open finder/booking page updates when anyone books or cancels.
- **Booking lifecycle:** `create_booking` (price computed server-side, 10-minute hold) → Razorpay checkout → `confirm_payment` → `confirmed`. Unpaid holds expire. Cancel with `cancel_booking` (confirmed bookings up to 1 hour before entry; paid amounts become `refund_pending`).
- **Security:** RLS on every table; users can only read their own bookings/payments; clients cannot write bookings directly; users cannot change their own role; admin routes also require `role = 'admin'` in the database.
- **Availability colours:** green = free, red = in use now / blocked by admin, amber = reserved to start within 2 hours, grey = maintenance. No data is pre-filled — everything shown comes from your database.

## Known limitations (be upfront in your viva)

- **Payment verification is client-triggered.** The browser calls `confirm_payment` after Razorpay's success callback. For real money, add a Supabase Edge Function that creates Razorpay orders and verifies the signature / webhook, and make `confirm_payment` callable only from it. Fine for test mode and a college project.
- Refunds are tracked (`refund_pending` → admin marks `refunded`) but must be issued in the Razorpay dashboard.
- Expired holds are released lazily (whenever someone loads availability or books). Enable `pg_cron` to run `select expire_pending();` every minute if you want it exact.
- Notifications are in-app (and browser notifications if allowed), not email/SMS.
- The distance is straight-line; "Navigate" opens Google Maps directions.
