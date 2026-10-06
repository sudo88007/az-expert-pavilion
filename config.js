/* AZ EXPERT - PAVILION PROJECT : cloud settings
   Leave both values empty  -> "Local mode": accounts live in this browser only (good for one PC / demo).
   Fill both values in      -> "Team mode": real shared accounts + shared data for every device (free Supabase).
   Setup steps: see SUPABASE-SETUP.md. The anon key is safe to publish – access is protected by the database rules. */
window.AZ_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: ''
};
