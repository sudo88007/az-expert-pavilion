/* OPTIONAL: Cloudflare Worker that lets the app use GOOGLE GEMINI (free tier) without users entering any key.
   Setup (free, ~3 minutes):
   1. Get a free Gemini key: https://aistudio.google.com/apikey
   2. https://dash.cloudflare.com -> Workers & Pages -> Create Worker -> paste this file -> Deploy
   3. Worker Settings -> Variables and Secrets -> add secret  GEMINI_KEY = your key
   4. Copy the worker URL into AI_PROXY_URL at the top of the AI section in app.js
   The key stays on Cloudflare; visitors never see it. */
export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    try {
      const { prompt } = await req.json();
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: String(prompt).slice(0, 60000) }] }] })
      });
      const j = await r.json();
      return new Response(JSON.stringify({ text: j.candidates?.[0]?.content?.parts?.[0]?.text, error: j.error?.message }), { headers: cors });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { headers: cors }); }
  }
};
