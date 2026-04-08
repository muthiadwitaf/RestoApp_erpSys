require('dotenv').config();
const http = require('http');

async function run() {
  const loginReq = http.request('http://localhost:3999/api/settings/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
  }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
          const body = JSON.parse(data);
          let token = body.token;
          if (!token && body.tempToken) {
              const tokenReq = http.request('http://localhost:3999/api/settings/auth/select-company', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + body.tempToken }
              }, (r2) => {
                  let d2 = '';
                  r2.on('data', c => d2 += c);
                  r2.on('end', () => testApi(JSON.parse(d2).token));
              });
              tokenReq.write(JSON.stringify({ company_id: body.companies[0].uuid }));
              tokenReq.end();
          } else {
              if (token) testApi(token);
              else console.error('No token', body);
          }
      });
  });
  loginReq.write(JSON.stringify({ email: 'admin@erpsys.com', password: 'password123' }));
  loginReq.end();
}

function testApi(token) {
  const req = http.request('http://localhost:3999/api/sales/pos-sessions/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
  }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => console.log('Response:', res.statusCode, data));
  });
  req.write(JSON.stringify({ opening_cash: 1000000 }));
  req.end();
}

run().catch(console.error);
