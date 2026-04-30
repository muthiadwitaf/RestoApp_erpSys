const http = require('http');

const req = http.request('http://localhost:3999/api/settings/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => console.log('Response:', res.statusCode, data));
});
req.write(JSON.stringify({ email: 'admin@cpu.co.id', password: 'password123' }));
req.end();
