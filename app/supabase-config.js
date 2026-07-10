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
  /* Server-side proxy. When TRUE, generation is routed through the `image-proxy`
     Supabase Edge Function. The function can use user-saved provider keys sent
     per request from the top-bar API Keys modal, or fall back to platform keys
     stored as server secrets. It serves image providers (GPT Image / OpenAI must
     be proxied; Nano Banana / Google can also be proxied), the TEXT model behind
     MUSE/spec drafting/agents, plus voice/video routes. Keep FALSE until you've
     deployed that function; while FALSE, GPT Image/voice/video aren't offered and
     Nano Banana runs in-browser with the user's saved local Google key. */
  imageProxy: true,
  imageProxyFn: "image-proxy",
};
