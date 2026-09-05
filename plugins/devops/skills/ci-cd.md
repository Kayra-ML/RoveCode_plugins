# CI/CD Pipelines

## GitHub Actions Workflow Structure

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test

  build:
    needs: lint-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
```

## Caching Dependencies in CI

Without caching, `npm install` / `bun install` runs from scratch every job:

```yaml
# npm
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: "npm"          # caches ~/.npm using package-lock.json as key

# bun
- uses: oven-sh/setup-bun@v2
  with:
    bun-version: latest
- uses: actions/cache@v4
  with:
    path: ~/.bun/install/cache
    key: ${{ runner.os }}-bun-${{ hashFiles('bun.lockb') }}
    restore-keys: ${{ runner.os }}-bun-
```

## Parallel Job Execution

Run independent checks in parallel to reduce total CI time:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, install, lint]

  typecheck:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, install, typecheck]

  test:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, install, test]

  deploy:
    needs: [lint, typecheck, test]   # waits for all three
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps: [deploy]
```

## Environment Secrets in CI

Store secrets in GitHub Settings → Secrets and Variables → Actions:

```yaml
- name: Deploy to production
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    JWT_SECRET: ${{ secrets.JWT_SECRET }}
    DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
  run: ./scripts/deploy.sh
```

Never echo secrets. GitHub Actions automatically masks known secret values in logs but avoid `echo $SECRET` patterns.

## Deploy on Merge to Main

```yaml
deploy-production:
  needs: [lint, test, build]
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  environment:
    name: production
    url: https://app.example.com
  steps:
    - uses: actions/checkout@v4
    - uses: actions/download-artifact@v4
      with:
        name: dist
    - name: Deploy
      run: |
        # your deploy command here
        flyctl deploy --remote-only
```

## Branch Protection Rules

Configure in GitHub: Settings → Branches → Add rule for `main`:

- Require status checks to pass (lint, typecheck, test, build)
- Require branches to be up to date before merging
- Require pull request reviews (1 reviewer minimum)
- Restrict who can push to main

## Preview Deployments

```yaml
deploy-preview:
  needs: [lint, test, build]
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-latest
  steps:
    - name: Deploy preview
      id: deploy
      run: |
        URL=$(flyctl deploy --no-wait --app myapp-pr-${{ github.event.number }} 2>&1 | grep -oP 'https://\S+')
        echo "url=$URL" >> $GITHUB_OUTPUT

    - name: Comment PR
      uses: actions/github-script@v7
      with:
        script: |
          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: `Preview deployed: ${{ steps.deploy.outputs.url }}`
          })
```

## Artifact Uploads Between Jobs

```yaml
build:
  steps:
    - run: npm run build
    - uses: actions/upload-artifact@v4
      with:
        name: dist
        path: dist/
        retention-days: 1    # don't retain CI artifacts long

deploy:
  needs: build
  steps:
    - uses: actions/download-artifact@v4
      with:
        name: dist
        path: dist/
```

## Matrix Builds

Test across multiple Node.js versions or OS combinations:

```yaml
test:
  runs-on: ${{ matrix.os }}
  strategy:
    matrix:
      os: [ubuntu-latest, macos-latest]
      node: [18, 20, 22]
    fail-fast: false    # don't cancel all if one fails
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node }}
    - run: npm test
```

## Rollback Strategy

Always have a way to revert quickly:

```yaml
rollback:
  runs-on: ubuntu-latest
  if: github.event_name == 'workflow_dispatch'
  steps:
    - name: Roll back to previous release
      run: |
        PREV_VERSION=${{ github.event.inputs.version }}
        flyctl deploy --image registry.fly.io/myapp:$PREV_VERSION
```

Trigger rollback manually via `workflow_dispatch` or automatically when health checks fail post-deploy.