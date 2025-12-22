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

| Name          | Description                                             | Default      |
| ------------- | ------------------------------------------------------- | ------------ |
| token         | GitHub token used to query rate limits                  | github.token |
| log_level     | quiet, notice, info, debug                              | info         |
| output_path   | Write usage report JSON to this path (empty to disable) | usage.json   |

## Outputs

| Name   | Description                        |
| ------ | ---------------------------------- |
| usage  | JSON string mapping API area ("bucket") -> requests used |


Example output:
```json
{
  "core": 45,
  "graphql": 10,
  "search": 5
}
```

## Notes

- Usage counts are **approximate**.
- If the rate-limit window resets during the job, deltas may be inaccurate.
- The action runs once per job using pre and post hooks.

## License
MIT © 2025 Really Him
