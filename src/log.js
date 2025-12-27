const VALID_BUCKETS = [
  'core',
  'search',
  'code_search',
  'graphql',
  'integration_manifest',
  'dependency_snapshots',
  'dependency_sbom',
  'code_scanning_upload',
  'actions_runner_registration',
  'source_import'
];

function isQuiet(raw) {
  return String(raw || '').toLowerCase() === 'true';
}

function log(quiet, message) {
  if (!quiet) console.log(message);
}

function parseBuckets(raw) {
  const input = String(raw || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return input.filter(b => VALID_BUCKETS.includes(b));
}

module.exports = { isQuiet, log, parseBuckets, VALID_BUCKETS };
