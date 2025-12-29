# GitHub API Usage Tracker

Track how many GitHub API requests a workflow job consumes, parttioned by bucket (core, GraphQL, search, etc.).

This action captures the rate-limit state at job start and compares it with the state at job end.

## Usage

```yaml
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hesreallyhim/github-api-usage-tracker@v1
      - run: echo "Core API used: ${{ steps.usage.outputs.usage }}"
```

## Inputs

| Name        | Description                                                                                                                                                                                                    | Default               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| token       | GitHub token used to query rate limits                                                                                                                                                                         | github.token          |
| buckets     | Comma-separated list of rate-limit buckets to track (core,search,graphql,code_search,integration_manifest,dependency_snapshots,dependency_sbom,code_scanning_upload,actions_runner_registration,source_import) | core,search,graphql   |
| output_path | Write usage report JSON to this path (empty to disable)                                                                                                                                                        | github_api_usage.json |

## Outputs

| Name  | Description                                              |
| ----- | -------------------------------------------------------- |
| usage | JSON string mapping API area ("bucket") -> requests used |

Example output:

```json
{
  "core": 45,
  "graphql": 10,
  "search": 5
}
```

## Notes

- Usage counts may be affected by other workflows in the repo, and therefore should not be considered 100% precise as measurements of the current job.
- The action uses pre and post job hooks to snapshot the rate limit, so you only need to use it in one step - the rest will be handled automatically.
- Logs are emitted via `core.debug()`. Enable step debug logging to view them.

## License

MIT © 2025 Really Him
