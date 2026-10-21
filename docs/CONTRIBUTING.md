# Contributing

Thanks for helping improve DevOps Workflow Studio. Small, focused changes are welcome.

## Start with one improvement

Choose one bug, documentation gap, or dashboard feature. Before making a large change, open a GitHub issue with the problem, the expected result, and a short plan. For a typo or a small, obvious fix, a pull request is fine without an issue.

Useful next improvements for this repository:

1. Show CPU and memory usage by node when Prometheus is connected.
2. Add provider tests for multiple kubeconfig contexts and file changes.
3. Improve the dashboard's mobile layout and keyboard navigation.
4. Document a complete local k3d setup and teardown.
5. Add a dashboard view for recent Kubernetes events with namespace filtering.

Pick one item at a time. Each is small enough to review on its own.

## Work in a branch

Start from the latest `dev` branch and use a short, descriptive branch name:

```bash
git switch dev
git pull --ff-only
git switch -c docs/multi-cluster-api
```

Keep each commit focused and describe the result, for example `Document multi-cluster context API`.

## Validate the change

Use Node.js 24. Run the checks that match the files you changed:

```bash
npm run check
npm test
```

For infrastructure changes, also run the relevant command from `npm run validate` or `npm run verify:charts`. Do not include kubeconfig files, `.env` files, tokens, certificates, or anything from `.secrets/` in a commit.

## Open a pull request

Push your branch and open a pull request against `dev`. Explain the problem, the user-visible result, and the checks you ran. Keep the pull request limited to one improvement. After it is reviewed and merged, `dev` can be promoted to `main` when it is ready for release.
