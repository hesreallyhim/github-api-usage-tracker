const core = require('@actions/core');
const https = require('https');
const { log } = require('./log');

const REQUEST_TIMEOUT_MS = 30_000;

function fetchRateLimit() {
  const token = core.getInput('token');
  return new Promise((resolve, reject) => {
    if (!token) return reject(new Error('No GitHub token provided'));
    let settled = false;
    const finalize = (err, data) => {
      if (settled) return;
      settled = true;
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    };

    const req = https.request(
      {
        hostname: 'api.github.com',
        path: '/rate_limit',
        headers: {
          'User-Agent': 'github-api-usage-tracker',
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json'
        }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          log(`[github-api-usage-tracker] GitHub API response: ${res.statusCode}`);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return finalize(new Error(`GitHub API returned ${res.statusCode}: ${data}`));
          }
          try {
            finalize(null, JSON.parse(data));
          } catch (e) {
            finalize(e);
          }
        });
      }
    );

    req.setTimeout(REQUEST_TIMEOUT_MS);
    req.on('timeout', () => {
      const err = new Error(`GitHub API request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      req.destroy(err);
      finalize(err);
    });
    req.on('error', finalize);
    req.end();
  });
}

module.exports = { fetchRateLimit };
