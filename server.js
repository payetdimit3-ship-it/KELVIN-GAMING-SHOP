// server.js — static file server rahisi kwa Render Web Service
// Inatumikia faili zote za HTML/CSS/JS zilizopo kwenye folder hii,
// na "/" inaonyesha home.html moja kwa moja.

const http = require('http');
const handler = require('serve-handler');

const PORT = process.env.PORT || 3000;

const server = http.createServer((request, response) => {
  return handler(request, response, {
    public: '.',
    rewrites: [
      { source: '/', destination: '/home.html' }
    ],
    headers: [
      {
        source: '**/*.html',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }]
      }
    ]
  });
});

server.listen(PORT, () => {
  console.log(`LifeIsGameTZ inaendesha kwenye port ${PORT}`);
});
