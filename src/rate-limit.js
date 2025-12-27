const core = require('@actions/core');
const https = require('https');
const { log } = require('./log');

function fetchRateLimit() {
  const token = core.getInput('token');
  return new Promise((resolve, reject) => {
    if (!token) return reject(new Error('No GitHub token provided'));

    const req = https.request(
      {
        hostname: 'api.github.com',
        path: '/rate_limit',
        headers: {
          'User-Agent': 'github-api-usage-tracker',
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          log(
            `[github-api-usage-tracker] GitHub API response: ${res.statusCode}`
          );
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(`GitHub API returned ${res.statusCode}: ${data}`)
            );
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

module.exports = { fetchRateLimit };
