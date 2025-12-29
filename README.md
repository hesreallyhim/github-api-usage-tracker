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

```yaml
jobs:
  track:
    runs-on: ubuntu-latest
    outputs:
      usage: ${{ steps.usage.outputs.usage }}
    steps:
      - uses: actions/checkout@v4
      - uses: hesreallyhim/github-api-usage-tracker@v1
        id: usage

  report:
    runs-on: ubuntu-latest
    needs: track
    steps:
      - run: echo "Core API used: ${{ needs.track.outputs.usage }}"
```

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

| Name  | Description                                                                       |
| ----- | --------------------------------------------------------------------------------- |
| usage | JSON string with total, duration_ms, and buckets_data (per-bucket used/remaining) |

Example output:

```json
{
  "total": 60,
  "duration_ms": 12345,
  "buckets_data": {
    "core": { "used": 45, "remaining": 4955 },
    "graphql": { "used": 10, "remaining": 4990 },
    "search": { "used": 5, "remaining": 25 }
  }
}
```

## Notes

- Usage counts may be affected by other workflows in the repo, and therefore should not be considered 100% precise as measurements of the current job.
- The action uses pre and post job hooks to snapshot the rate limit, so you only need to use it in one step - the rest will be handled automatically.
- Output is set in the post step, so it is only available after the job completes (use job outputs if needed).
- Logs are emitted via `core.debug()`. Enable step debug logging to view them.

---

## License

<div align="center">

MIT © 2025 Really Him

</div>
