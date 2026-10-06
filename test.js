const fs = require('fs');
const sql = fs.readFileSync('SUPABASE-SETUP.md', 'utf8').split('```sql')[1].split('```')[0].trim();
fetch('https://api.supabase.com/v1/projects/ersushjnfmfkmgddiajf/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sbp_fc8f6d22ccafb4ecec2c71d83865cd8a8c271c14',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: sql })
}).then(r => r.json()).then(console.log).catch(console.error);
