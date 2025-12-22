const https = require('https');

function fetchRateLimit(token) {
  return new Promise((resolve, reject) => {
    if (!token) return reject(new Error('No GitHub token provided'));

    const req = https.request({
      hostname: 'api.github.com',
      path: '/rate_limit',
      headers: {
        'User-Agent': 'github-api-usage-tracker',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = { fetchRateLimit };
