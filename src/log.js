const core = require('@actions/core');

function isQuiet(raw) {
  return String(raw || '').toLowerCase() === 'true';
}

function log(quiet, message) {
  if (!quiet) core.notice(message);
}

module.exports = { isQuiet, log };
