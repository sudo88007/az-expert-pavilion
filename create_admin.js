const fetch = require('node-fetch'); // Node 18+ has built-in fetch
const url = 'https://ersushjnfmfkmgddiajf.supabase.co/auth/v1/admin/users';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyc3VzaGpuZm1ma21nZGRpYWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTI2NzY4MywiZXhwIjoyMTA2ODQzNjgzfQ.M0-DtM-j06CEC8c7y63JawGAt7Pggd61sVlGqBCA678';

async function createAdmin() {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': serviceRole,
        'Authorization': 'Bearer ' + serviceRole,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@azexpert.com',
        password: 'aa12345aa',
        email_confirm: true,
        user_metadata: { name: 'Administrator' }
      })
    });
    const text = await res.text();
    console.log(res.status, text);
  } catch (e) {
    console.error(e);
  }
}
createAdmin();
