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
     Supabase Edge Function. The function normally uses platform keys stored as
     server secrets; the admin-only API Keys modal can override them for testing.
     Image generation is fal.ai-first (Nano Banana variants and GPT Image 2),
     writing/text stays with the selected text provider, Stage video stays on
     fal.ai, and ElevenLabs voice-library operations stay on ElevenLabs through
     this proxy. Keep FALSE only for local smoke tests that do not need media
     generation. */
  imageProxy: true,
  imageProxyFn: "image-proxy",
};
