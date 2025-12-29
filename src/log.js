const core = require('@actions/core');

/**
 * List of valid GitHub API rate limit buckets.
 */
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

/**
 * Logs a message using GitHub Actions debug logging.
 *
 * @param {string} message - message to log.
 */
function log(message) {
  core.debug(message);
}

/**
 * Parses a comma-separated string of bucket names into an array of valid bucket names.
 *
 * @param {string} raw - raw comma-separated bucket names.
 *
 * @returns {string[]} - array of valid bucket names.
 */
function parseBuckets(raw) {
  const buckets = [];
  const invalidBuckets = [];
  const input = String(raw || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const bucket of input) {
    if (!VALID_BUCKETS.includes(bucket)) {
      invalidBuckets.push(bucket);
    } else {
      buckets.push(bucket);
    }
  }
  if (invalidBuckets.length > 0) {
    core.warning(
      `Invalid bucket(s) selected: ${invalidBuckets.join(', ')}, valid options are: ${VALID_BUCKETS.join(', ')}`
    );
  }
  return buckets;
}

module.exports = { log, parseBuckets, VALID_BUCKETS };
