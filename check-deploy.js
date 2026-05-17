





const https = require('https');
const fs = require('fs');
const path = require('path');

const projectId = 'rikjeqkarzzxisivbxjg';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpa2plcWthcnp6eGlzaXZieGpnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODQyMjE5OCwiZXhwIjoyMDkzOTk4MTk4fQ.WC3IWfU_k-fom7JjKsCh2JgWtKuYcnu3nNoJT9DhNi8';

const sqlPath = path.join(__dirname, 'supabase', 'migrations', '021_qr_list_hierarchy.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const postData = JSON.stringify({ query: sql });

const options = {
  hostname: 'api.supabase.com',
  path: '/v1/projects/' + projectId + '/database/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + serviceKey,
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Running migration via Supabase Management API...');

const req = https.request(options, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(d);
      if (res.statusCode === 200 || res.statusCode === 201) {
        console.log('Migration completed successfully!');
      } else {
        console.log('Status:', res.statusCode);
        console.log('Response:', d.substring(0, 500));
      }
    } catch(e) {
      console.log('Response:', d.substring(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.log('Request error:', e.message);
});

req.write(postData);
req.end();





