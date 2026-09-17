/* Navodix Careers Admin - Supabase client */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://hgjtqpztgyrrkujqjmcj.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NGCugRMwnR7QslgwGi9GzQ_LBMKyT12';

  window.NAVODIX_SUPABASE_URL = SUPABASE_URL;
  window.navodixSupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
})();
