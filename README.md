<div align="center">

<img src="assets/header.svg" alt="GitHub API Usage Tracker" width="600"/>

<br><br>

[![GitHub Actions](https://img.shields.io/badge/GitHub-Action-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/features/actions)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

---

</div>

Track how many GitHub API requests a workflow job consumes, parttioned by bucket (core, GraphQL, search, etc.).

This action captures the rate-limit state at job start and compares it with the state at job end.

## Usage

To use this action, just drop it in anywhere in your job - the pre- and post-job hooks will do all of the work.

```yaml
jobs:
  search:
    runs-on: ubuntu-latest
    steps:
      - name Checkout
        uses: actions/checkout@v4
      - name Track Usage
        uses: hesreallyhim/github-api-usage-tracker@v1
      - name: Query API
        uses: actions/github-script@v6
        with:
          script: |
            const response = await ...
      ...
```

After your job completes, you'll get a nice summary:

<div align="center">
  <img src="assets/flow-diagram.svg" alt="API Usage Tracking Flow" width="100%"/>
</div>

## Inputs

| Name        | Description                                                                                                                                                                                                    | Default               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| token       | GitHub token used to query rate limits                                                                                                                                                                         | github.token          |
| buckets     | Comma-separated list of rate-limit buckets to track (core,search,graphql,code_search,integration_manifest,dependency_snapshots,dependency_sbom,code_scanning_upload,actions_runner_registration,source_import) | core,search,graphql   |
| output_path | Write usage report JSON to this path (empty to disable)                                                                                                                                                        | github_api_usage.json |

## Outputs

| Name  | Description                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| usage | JSON string with total, duration_ms, total_is_minimum, and buckets_data (per-bucket used/remaining/crossed_reset/used_is_minimum) |

Example output:

```json
{
  "total": 60,
  "duration_ms": 12345,
  "total_is_minimum": false,
  "buckets_data": {
    "core": { "used": 45, "remaining": 4955, "crossed_reset": false, "used_is_minimum": false },
    "graphql": { "used": 10, "remaining": 4990, "crossed_reset": false, "used_is_minimum": false },
    "search": { "used": 5, "remaining": 25, "crossed_reset": false, "used_is_minimum": false }
  }
}
```

## Notes

- Usage counts may be affected by other workflows in the repo, and therefore should not be considered 100% precise as measurements of the current job.
- The action uses pre and post job hooks to snapshot the rate limit, so you only need to use it in one step - the rest will be handled automatically.
- Output is set in the post step, so it is only available after the job completes (use job outputs if needed).
- Logs are emitted via `core.debug()`. Enable step debug logging to view them.
- If a reset window is crossed for a bucket, usage for that bucket is reported as a minimum because calls between the pre-snapshot and the reset are not observable.
- The main step captures a checkpoint snapshot; if it occurs before a reset, the minimum includes usage observed up to that checkpoint.
- GitHub's primary rate limits appear to use fixed windows with reset times anchored to the first observed usage of the token (per resource bucket), rather than calendar-aligned rolling windows.”
  • GitHub’s primary rate limit for Actions using the GITHUB_TOKEN is 1,000 REST API requests per hour per repository (or 15,000 per hour per repository when accessing GitHub Enterprise Cloud resources). This limit is specific to the automatically generated GITHUB_TOKEN and is independent of the standard REST API limits for other token types.
  Reference: GitHub Actions limits documentation — “The rate limit for GITHUB_TOKEN is 1,000 requests per hour per repository.”
  https://docs.github.com/en/actions/reference/limits
  • When a GitHub Actions workflow uses a different token (such as a personal access token or a GitHub App installation token), the workflow is subject to that token’s normal primary API rate limits, not the GITHUB_TOKEN Actions limit (e.g., 5,000 requests per hour for a PAT).
  Reference: GitHub REST API rate limits documentation
  https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

---

<div align="center">

## License

MIT © 2026 Really Him

</div>
