# Continuous integration and post-merge checks

The [CI workflow](../../.github/workflows/ci.yml) runs on pull requests targeting main, pushes to main, and manual workflow dispatch. It verifies repository behavior and does not deploy the application.

## Checks

| GitHub check | Commands and scope |
| --- | --- |
| Quality checks | Locked dependency install, TypeScript and module boundaries, domain tests, production Next.js build |
| Database and quiz journeys | PostgreSQL integration tests, then Chromium quiz and onboarding journeys |

Both jobs use Ubuntu 24.04 and the Node version in .nvmrc. GitHub actions are pinned to commit SHAs, with version comments for maintenance. npm's download cache is keyed by the lockfile; each job still installs through npm ci. Update a pinned action only after checking the official release.

The database job uses the same pinned PostgreSQL image as compose.development.yml. Its fresh service container has a dedicated mcj_ci_test database and disposable fixture credentials. The migration role initializes the schema and distinct app/worker roles through existing integration fixtures. No repository secrets, developer database, or production credentials are used.

Integration and browser suites run sequentially because they reset the same test database. Chromium and its Linux dependencies are installed with Playwright's matching package version. The selected journeys cover quiz editing, autosave, conflicts, retry recovery, best review, completion, and onboarding lesson access. Browser failures upload playwright-report and test-results artifacts for seven days, including retained failure traces. Successful runs do not upload browser artifacts.

The jobs have bounded timeouts. A newer run cancels an older run for the same PR/ref. Checks are not skipped for documentation-only paths, so required checks are still reported consistently.

## Deliberate limits

The six real-sandbox integration tests require MCJ_REAL_SANDBOX=true and the dedicated Linux Docker/gVisor/Cangjie host. Ordinary CI leaves them disabled. Coding execution journeys and the real-process recovery harness also remain separate; a green CI run does not establish compiler, sandbox or production-provider behavior.

The build job checks production compilation. The browser job exercises the existing development-mode test host with real PostgreSQL and controlled external evidence; it is not a production-deployment test.

GitHub runs are the authority for hosted-run success. Local command results and actionlint validate parts of the workflow but do not prove that runner provisioning or service downloads succeeded.

## Reviewing and rerunning CI

Open the PR's Checks tab or the repository's Actions tab to inspect each job and failing step. Download the browser artifact when present; inspect its HTML report or a trace with npx playwright show-trace <trace.zip>.

Use Re-run failed jobs for a failed attempt after investigating its error. Once this workflow is on the default branch, Actions > CI > Run workflow permits a manual run for a chosen branch. A new workflow can first be exercised through its pull request.

To prevent merging failing code, configure the main branch's GitHub ruleset or branch protection to require both Quality checks and Database and quiz journeys after those checks have appeared. Adding workflow YAML alone does not enable merge protection. Repository settings are a separate maintainer action.

## Local checkpoint after merging and pulling main

1. Confirm git status is clean, or preserve pending work before switching branches.
2. Run git switch main and git pull --ff-only origin main. If the pull cannot fast-forward, inspect the divergence instead of resetting local work.
3. Use the Node version in .nvmrc and run npm ci to reproduce package-lock.json.
4. Inspect the merged changes for migrations or content revisions. If needed, stop local processes and follow the existing [development database initialization steps](hello-world-workflow.md#local-startup-and-isolated-verification) against the intended development database. Do not reset learner data as a routine verification step.
5. Run npm run check, npm run test:domain, npm run test:integration, and npm run build. Integration tests require the dedicated *_test database and appropriate local PostgreSQL roles.
6. Run the relevant browser journeys and briefly inspect affected UI flows. Stop other test jobs/workers when running persistence suites; do not run database-resetting suites concurrently. Coding execution requires the specialized hosts described in the runbook.
7. Check git status afterward. Next.js may regenerate next-env.d.ts for its selected output directory; inspect generated changes before committing them.

A pull does not itself run GitHub Actions locally. The push to main triggers hosted CI; these local checks verify the environment and checkout you will develop in.

## Workflow maintenance

Keep .nvmrc, package-lock.json, compose.development.yml and workflow setup aligned. When introducing a new browser suite, add it to the CI selection if it does not require the specialized execution host. Preserve the *_test database guards and role-isolation checks.

Official references: [GitHub PostgreSQL services](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [setup-node](https://github.com/actions/setup-node), and [Playwright CI](https://playwright.dev/docs/ci).
