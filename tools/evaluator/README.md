# Evaluator feasibility and regression harness

Maintained RISK-01 tools for the Cangjie 1.0.5/gVisor prototype. These are trusted
operator tools, not the production evaluation service or a public execution API.
The [risk register](../../docs/risk-register.md) owns evidence and its limitations;
the [accepted stack](../../docs/mvp-stack.md) owns production technology decisions.

## Requirements

- Linux with Python 3.10+ (standard library only), local Docker Engine and cgroup v2.
- Root access to Docker and host cgroup counters on a dedicated development host
  or Linux VM. On Windows, run inside Linux/WSL; native Windows execution is unsupported.
- The local Cangjie 1.0.5 Linux x86_64 image, with `/opt/cangjie/envsetup.sh`, `cjc`,
  a native C compiler and UID 10001. The SDK is an external prerequisite, not vendored.
- Docker runtime aliases configured to use gVisor systrap. Defaults are
  `runsc-systrap` for ordinary checks and `runsc-process-debug` for the native
  process probe. The latter is the diagnostic alias used in existing evidence;
  configure it or explicitly select another verified gVisor systrap alias below.
- At least 1 GiB available host memory for the dedicated memory probe. Normal
  sandboxes have a 2 GiB cap. Run suites sequentially, away from unrelated work.

Keep the checkout on the Linux filesystem and use a local Docker daemon: bind
mount paths and cgroup inspection must refer to the same host. Do not run old local
prototype copies alongside this harness; their lease directories differ.
Spaces and Unicode in the checkout path are supported. Dollar signs, double quotes,
backslashes and control characters are rejected before running the suite because
the host-canary path is embedded in generated Cangjie source.

## Run

From this directory in the Linux checkout:

```bash
sudo python3 regression-check.py
sudo docker ps -a --filter 'name=mcj-probe-'
```

Expect `OVERALL: PASS`, exit 0 and no probe containers. The suite runs eleven
ordinary fixtures and nine dedicated helpers. It deliberately waits 60 seconds
for the compilation deadline probe. Failures stop the suite, preserve evidence
and return nonzero. Individual checks can be run directly, for example:

```bash
sudo python3 runner.py fixtures/guest-hello.cj
sudo python3 boundary-check.py
sudo python3 interruption-check.py
sudo python3 sequential-check.py
sudo python3 compile-check.py
sudo python3 orphan_cleanup.py
```

`settings.py` supplies local Docker names. Override them explicitly through the
root invocation when needed; no personal environment file is loaded automatically:

```bash
sudo env MCJ_EVALUATOR_IMAGE=master-cangjie-evaluator:1.0.5-prototype \
  MCJ_EVALUATOR_RUNTIME=runsc-systrap \
  MCJ_EVALUATOR_PROCESS_RUNTIME=runsc-process-debug \
  python3 regression-check.py
```

These names must resolve to the intended image and gVisor runtimes. Prefer an
immutable local image ID or repository digest for recorded verification. Reports
record actual image IDs and container restrictions; a runtime alias alone does not
prove which binary the host configured. Runtime settings are not additional
validated platforms or permission to substitute ordinary `runc`.

## Files and local state

### Verify coding content

From a Linux checkout on the existing evaluator host, run one command from the
repository root:

```bash
sudo python3 tools/evaluator/content-check.py content/coding/running-the-first-cangjie-program/hello-world
```

The command snapshots both `starter.cj` and `reference.cj` plus every paired
`tests/*.in` and `tests/*.out`, then compiles and runs each source/case combination
in a fresh sandbox using `runner.py`. It checks the compiler identifies as 1.0.5,
successful execution, exact stdout bytes and sandbox cleanup. Empty input needs
an actual zero-byte `.in` file. A mismatch, missing pair or execution/service
failure exits nonzero; success exits zero. The printed JSON report records hashes,
image/version evidence and exact runner report references. Snapshots and reports
stay in ignored `results/`.

This command assumes both starter and reference are runnable programs expected to
pass every case, as in Hello World. It does not interpret Markdown, publish content,
assign scores, check structural rules or approve learner-facing wording. Future
items with intentionally incomplete starters need a separately defined verification
expectation before using this command unchanged. Runs compile separately per case;
this simple authoring workflow is not a production batch evaluator.

`runner.py --stdin FILE` supplies a read-only input mount only during execution;
without it, programs receive EOF from `/dev/null`. `--record-compiler-version`
adds version evidence. Reports preserve stdout as base64 alongside display text
so byte comparison does not depend on UTF-8 replacement decoding.

- `runner.py`: bounded compiler/execution orchestration and named controlled probes.
- `*-check.py`: integration checks, including Cangjie compatibility, resources,
  network/files, cooperative interruption, sequential storage and orphan/canary checks.
- `fixtures/`: Cangjie sources; `fs-host-canary.cj.in` is rendered by the suite
  using a newly generated host canary path. No personal home path is required.
- `memory-probe.c`, `process-probe.c`: bounded native resource probes.
- `orphan_cleanup.py`, `credential_probe.py`: local recovery/access-check helpers.
- `results/`: ignored JSON reports, generated sources, dummy canaries and logs.
- `leases/`: ignored job lock files. Never delete/recreate leases while any runner
  or owned sandbox is active; lock identity protects live jobs from cleanup.

Generated evidence remains local and may include evaluated source and diagnostics.
Review any evidence before sharing. Preserve the exact JSON references printed by
each command rather than choosing the newest report. The old latest-report checker,
Windows/WSL sync scripts and historical personal command journal are not maintained
entry points. This directory is the source of truth for further harness changes.

## Image recipe

`Dockerfile` preserves the inspected prototype recipe. Its external build context
must contain `cangjie/` from the selected Linux x86_64 SDK, including `envsetup.sh`.
For example, from the repository root:

```bash
sudo docker build -f tools/evaluator/Dockerfile \
  -t master-cangjie-evaluator:1.0.5-prototype /path/to/sdk-build-context
```

Do not put the SDK archive, extracted SDK or image exports into Git. A local
`image-context/` is ignored if needed. The historical SDK SHA-256 and image ID are
recorded in the risk register. This recipe uses a mutable Ubuntu tag and package
repositories; rebuilding need not reproduce the historical image ID. A rebuild is
a new artifact and requires its own verification. This migration does not rebuild,
download or install anything.

## Evidence limits

Controlled compiler substitutes establish runner enforcement and signal handling;
they do not establish every real compiler failure path. Dedicated probes retain
their experimental configurations, including the 512 MiB native memory test.
Orphan removal is triggered by startup/manual reconciliation, not an independent
watchdog deadline while the coordinator is down. Dummy credential canaries are not
an exhaustive image-secret audit or production queue-permission test. This harness
does not establish production-host readiness or application scoring/recovery.
