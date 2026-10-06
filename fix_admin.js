const fetch = require('node-fetch'); // actually we'll use node's native fetch if available, but I'll write it without require
const url = 'https://ersushjnfmfkmgddiajf.supabase.co/rest/v1/profiles?email=eq.admin@azexpert.com';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyc3VzaGpuZm1ma21nZGRpYWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTI2NzY4MywiZXhwIjoyMTA2ODQzNjgzfQ.M0-DtM-j06CEC8c7y63JawGAt7Pggd61sVlGqBCA678';

async function fixAdmin() {
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': serviceRole,
        'Authorization': 'Bearer ' + serviceRole,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'admin' })
    });
    console.log(res.status, await res.text());
  } catch(e) {
    console.error(e);
  }
}
fixAdmin();
