// ---------------------------------------------------------------
// Fill these in (see README.md). The anon key is safe to expose:
// your data is protected by the Row Level Security rules in
// supabase/schema.sql.  NEVER put the service_role key here.
// ---------------------------------------------------------------
window.PSF_CONFIG = {
  SUPABASE_URL: "https://estmcqyszllppedgbkqo.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_rwEdklu0TvNGDLfnMWA4TQ_pym6Cw8w",
  RAZORPAY_KEY_ID: "",     // Razorpay TEST key id, starts with rzp_test_
  HOLD_MINUTES: 10,        // must match expire_pending() in schema.sql
  CANCEL_BEFORE_HOURS: 1   // must match cancel_booking() in schema.sql
};
