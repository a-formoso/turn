/* supabase-config.js — TURN's connection to Supabase.
   The anon key is meant to live in client code; Row Level Security is what
   protects the data. NEVER put the service_role key here. */
window.TURN_SUPABASE = {
  url: "https://vubenblfdzginlqiglzw.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YmVuYmxmZHpnaW5scWlnbHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTgwOTgsImV4cCI6MjA5NjMzNDA5OH0.Mq_SsKNEV2S25E8p_QvRHjix1MsvOEa8yhr6_XQJapE",
  /* tables live in `public` with a turn_ prefix; bucket holds generated images */
  bucket: "turn-assets",
  /* local-first: the app works signed-out on local storage; cloud when signed in */
  localFirst: true,
  /* Server-side proxy (the Higgsfield approach). When TRUE, generation is routed
     through the `image-proxy` Supabase Edge Function, which holds the provider keys
     as server secrets. It serves BOTH image providers — GPT Image / OpenAI (which
     can't run from the browser at all) AND Nano Banana / Google (proxied too so NO
     provider key lives in the browser) — AND the TEXT model behind MUSE, spec
     drafting and the agents (the function's `text` task; Gemini/GPT, pick in the
     MUSE header). So with the proxy on, the browser holds no keys at all. Keep FALSE until you've
     deployed that function and set its OPENAI_API_KEY and GOOGLE_API_KEY secrets
     (see supabase/functions/image-proxy/index.ts). While FALSE, GPT Image isn't
     offered and Nano Banana runs in-browser with your local Google key — nothing
     breaks. */
  imageProxy: true,
  imageProxyFn: "image-proxy",
};
