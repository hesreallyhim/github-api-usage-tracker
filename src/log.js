const core = require('@actions/core');

const LEVELS = { quiet: 0, notice: 1, info: 2, debug: 3 };

function parseLogLevel(raw) {
  const v = String(raw || '').toLowerCase();
  return LEVELS[v] !== undefined ? v : 'info';
}

function log(level, configured, message) {
  if (LEVELS[level] > LEVELS[configured]) return;
  if (level === 'debug') core.debug(message);
  else if (level === 'notice') core.notice(message);
  else core.info(message);
}

module.exports = { parseLogLevel, log };
