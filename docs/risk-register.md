# MasterCangjie Risk Register

## Purpose and baseline

**Initial review: 2026-11-01.** This register preserves the risks identified after accepting the product specification, use cases, domain model, architecture, and MVP technology stack.

At this review, the repository contains design documentation and no application implementation. Accepted documents record decisions; they do not establish runtime compatibility, reliable recovery, operating costs, or learning effectiveness. The risks below are prospective failure scenarios, not claims of observed implementation defects.

Read this register alongside the [product specification](product.md), [use cases](use-cases.md), [domain model](domain-model.md), [architecture](architecture.md), and [accepted MVP stack](mvp-stack.md).

The main delivery risk is building most of the website before proving real Cangjie execution and reliable submission recovery.

## Priority overview

The ranking reflects the initial judgment about delivery impact and how early evidence is needed. It is not a measured probability estimate.

| ID | Risk | Main consequence | Current status |
| --- | --- | --- | --- |
| RISK-01 | Evaluator compatibility and containment remain unproven | Core coding workflow blocked or unsafe to release | In progress |
| RISK-02 | Interrupted or repeated evaluations produce inconsistent results | Wrong scores, lost unlocks, duplicate outcomes, or permanently pending submissions | In progress |
| RISK-03 | MVP effort is underestimated | Schedule overruns and a broad but incomplete implementation | Open |
| RISK-04 | Curriculum preparation and correctness become bottlenecks | A working platform delivers weak or incorrect learning activities | Open |
| RISK-05 | Cooldowns are mistaken for capacity and cost control | Overloaded workers, excessive queues, or uncontrolled provider usage | Open |
| RISK-06 | Completion statistics are mistaken for learning evidence | Apparent engagement without demonstrated learner value | Open |

## RISK-01: Evaluator compatibility and containment remain unproven

**Failure scenario:** The web application is largely complete before discovering that the exact Cangjie LTS 1.0.5 artifact does not run correctly under the selected sandbox or host. Alternatively, execution works but resource restrictions, credential isolation, or worker queue permissions do not hold.

**Why it matters:** Running learner code is essential to the product. A fake evaluator, a successful Hello World outside the sandbox, or an accepted stack document cannot establish the required behavior. gVisor's [compatibility guidance](https://gvisor.dev/docs/user_guide/compatibility/) explicitly identifies trying a workload as the way to establish compatibility. Its [security model](https://gvisor.dev/docs/architecture_guide/security/) also requires deliberate configuration of permitted resources and access.

**Relevant operations:** UC-08, UC-09, UC-11, and UC-23.

**Early action:** Perform a focused evaluation feasibility check before substantial general feature implementation.

**Evidence required to reduce this risk:**

- The exact compiler/runtime artifact is identified and pinned for the real worker architecture.
- Representative programs compile and run under the actual selected sandbox, including exercises beyond Hello World.
- Compilation failure, wrong output, timeout, excessive output, and resource exhaustion produce the correct distinguishable outcomes.
- Network, filesystem, process, memory, time, and output restrictions are demonstrated for compilation and execution.
- Learner programs receive no application, queue, storage, delivery, or Google credentials.
- The trusted worker coordinator can operate with queue-only privileges and cannot read application accounts or mutate scores and progress.
- The chosen queue/persistence versions support the intended durable dispatch and result-ingestion path.

**Evidence at initial review:** None recorded for the implemented evaluator or deployment combination.

**2026-11-01 compatibility checkpoint — In progress:** The maintainer reports successful Cangjie LTS 1.0.5 Hello World compilation and execution using `runsc-systrap`, with the prototype's network-disabled, read-only-root, unprivileged-user and resource-limit configuration. The local environment record was inspected at `\\wsl.localhost\Ubuntu-24.04\home\arth_andrey\master-cangjie-evaluator\gvisor-prototype\environment.txt` (recorded at 11:44:24 +08:00).

- Environment: Ubuntu 24.04.5 LTS, x86_64, WSL 2 kernel `6.18.54.1-microsoft-standard-WSL2`.
- Runtime: gVisor `release-20261026.0`, Docker Engine `29.9.2`, containerd `v2.4.2`.
- Prototype image ID: `sha256:77cf9faa236790dbd636cb41c93c62f3b1a12c3e5e5630b3892eee9ba15b0534`.
- Linux SDK archive SHA-256: `bacad84df8e0281c5395bab4c40e481e3ea6cc712eed5c953903b0d561a14562`. This identifies the local archive; comparison with a publisher-provided checksum is not recorded.

The environment record establishes versions and artifact identifiers; the successful commands and outcomes are maintainer-reported, not independently rerun or captured in that file. Raw prototype artifacts remain local. This checkpoint demonstrates initial workload compatibility. Deliberate containment/resource tests, broader programs, bounded output, independent coordinator deadlines, queue permissions and deployment-host verification remain outstanding. RISK-01 is not closed.

**2026-11-01 local runner checkpoint:** The maintainer reports that the local Python runner produced the expected Hello World result (`completed`, exit 0) and deliberate syntax-error result (`compile_nonzero`, exit 1), with the expected phase reports and confirmed container cleanup. These runs were not independently rerun or their JSON artifacts inspected here. Deadline and output-cap enforcement are implemented in the prototype but remain unverified by deliberate limit-triggering fixtures; resource/access and interruption probes remain outstanding. RISK-01 remains In progress.

**2026-11-01 execution-limit checkpoint:** Maintainer-supplied checker output records all checks passing for both execution probes:

- Silent infinite loop: `execute_deadline`, execution phase duration `5.013` seconds, zero captured bytes; report `mcj-probe-88e4c94234ba400e9f49c2378ecf13f6.json`.
- Continuous output: `execute_output_limit`, execution phase duration `0.064` seconds, exactly `1,048,576` captured bytes; report `mcj-probe-e99252f205224ec881557a63417e7559.json`.
- Both compilations succeeded, both reports confirmed cleanup, and subsequent maintainer-supplied Docker listings showed no remaining `mcj-probe-` containers. The execution client exit code `-9` reflects runner termination of the Docker client; it is not evidence of an out-of-memory event.

These reports remain local under `~/master-cangjie-evaluator/runner/results/`. The supplied summaries demonstrate deadline detection, bounded captured execution output and eventual container removal in these cases; raw JSON was not independently inspected here. Phase durations exclude subsequent container inspection/removal and do not establish the exact time sandbox execution stopped. Compilation-limit enforcement, runtime-failure classification, resource/access probes, interruption recovery and production-host verification remain outstanding. RISK-01 remains In progress.

**2026-11-01 runtime-failure checkpoint:** Maintainer-supplied checker summaries show successful compilation and all checks passing for two runtime fixtures:

- Intentional nonzero return: `execute_nonzero`, execution reason `exited`, exit code `7`, duration `0.070` seconds, 19 captured bytes, expected stdout and empty stderr; report `mcj-probe-fead373875834a66950abcef02eae144.json`.
- Uncaught array-bounds exception: `execute_nonzero`, execution reason `exited`, exit code `1`, duration `0.071` seconds, 228 captured bytes. Stdout contains the pre-access marker; stderr identifies `IndexOutOfBoundsException` for index 99 in an array of length 3, with a stack trace. Execution did not reach the post-access marker; report `mcj-probe-d4437b5246af43fa9ec4f3a1ce18a19b.json`.
- Both reports confirm cleanup; subsequent supplied Docker listings show no remaining probe containers. Raw JSON was not independently inspected here.

These observations demonstrate preservation of nonzero program statuses and bounded exception evidence for these fixtures. Both share the prototype's `execute_nonzero` outcome; this is not a general classifier that distinguishes every learner failure from Docker/worker failures. Exception diagnostics remain internal execution evidence subject to the product's feedback visibility rules. Resource/access probes, compilation-limit enforcement and interruption recovery remain outstanding; RISK-01 remains In progress.

**2026-11-01 filesystem checkpoint:** Maintainer-supplied checker summaries show all checks passing for three fixtures, each compiling successfully and completing with execution exit code 0:

- Writable task storage: confirmed XYZ write/read in both `/work` and `/tmp`, duration `0.068` seconds, 81 captured bytes; report `mcj-probe-a34b809285884336af99bb546890b6b8.json`.
- Read-only filesystem: the attempted `/var/tmp` write raised `FSException` with `Read-only file system`, duration `0.069` seconds, 82 captured bytes; report `mcj-probe-77ba0236795545e3b2f7b0e212f9cbc8.json`.
- Unmounted host canary: the checker confirmed the host file's expected content and sole read-only source bind mount; the sandbox read failed because `/home/arth_andrey/master-cangjie-evaluator` did not exist inside its filesystem. Duration `0.077` seconds, 108 captured bytes; report `mcj-probe-82e3ea4763d945dbb48f81368b0700ae.json`.
- All reports confirmed cleanup and subsequent supplied Docker listings showed no remaining probe containers. Raw JSON was not independently inspected here.

The denial fixtures catch expected filesystem exceptions and return zero to indicate probe success. These cases demonstrate the tested writable/read-only boundaries and absence of one known unmounted host path, not comprehensive escape resistance. Network isolation, source-mount write protection, cross-job data retention, storage/memory/process limits, compilation limits and interruption recovery remain outstanding. RISK-01 remains In progress.

**2026-11-01 network checkpoint:** Maintainer-supplied summary for `network-check-6a603495ef834b15b79f8e3e27028327.json` shows all assertions passing and script exit status 0. Trusted Bash TCP clients ran inside gVisor with the prototype restrictions: bridge-network controls before and after the isolated attempt connected successfully (exit 0), while the network-none attempt to the same Docker-host endpoint (`172.17.0.1:46535`) exited 1 with `Network is unreachable`, without reaching its deadline. The endpoint recorded only the two control connections. All three containers were removed, the temporary endpoint closed, and a subsequent supplied Docker listing showed no remaining probe containers.

This establishes the tested IPv4 TCP network boundary with positive controls. It is not evidence for Cangjie socket-library compatibility, UDP, IPv6, DNS behavior or comprehensive network escape resistance. Raw JSON was not independently inspected here. Resource limits, additional filesystem boundaries, compilation limits, interruption recovery, credential/queue permissions and deployment-host verification remain outstanding. RISK-01 remains In progress.

**2026-11-01 storage-limit checkpoint:** Maintainer-supplied summary for `storage-check-fc2f08684ce74821a5ba5d7aa57bb73c.json` shows all assertions passing for `/work` and `/tmp`, tested in separate fresh gVisor containers. Both filesystems reported capacity `268,435,456` bytes (256 MiB); each bounded fill produced a file of exactly that size and failed with `No space left on device` before the external deadline. Small writes/reads succeeded before filling and after deleting the fill file. Both containers were removed, the script exited 0, and a subsequent supplied Docker listing showed no remaining probe containers. Raw JSON was not independently inspected here.

This demonstrates the independent tmpfs capacity boundaries for these trusted shell probes. It does not establish a combined per-job storage limit, Cangjie-specific exhaustion behavior, memory/process enforcement or recovery across interrupted jobs. Those checks and the other outstanding RISK-01 evidence remain open; RISK-01 remains In progress.

**2026-11-01 memory-limit checkpoint:** Maintainer-supplied summary for `memory-check-2ab3b697974b4f04bc1beb172b5b8f6f.json` shows all assertions passing with script exit 0. The dedicated host cgroup reported `memory.max=536870912` (512 MiB) and `memory.swap.max=0`. Native-probe compilation and a 16 MiB allocation succeeded. The bounded 768 MiB allocation attempt started but did not complete; it ended before the external deadline with Docker execution-client exit code `128` and a gVisor `WaitPID` EOF diagnostic. Host event deltas were `max=229`, `oom=1`, `oom_kill=1`, and maximum sampled `memory.current` was `536870912` bytes. Cleanup was confirmed and a subsequent supplied Docker listing was empty. Raw JSON was not independently inspected here.

The verified host limit and event deltas establish memory enforcement for this temporary 512 MiB native-allocation probe. The exit-128/EOF result is interpreted in conjunction with host OOM evidence; EOF alone does not establish a learner memory failure. Maximum sampled usage is not an independently measured exact peak. This does not verify Cangjie heap behavior, the regular runner's 2 GiB budget, or service recovery after OOM. Process limits and the other outstanding RISK-01 evidence remain open; RISK-01 remains In progress.

**2026-11-01 process-limit investigation — not passed:** The saved report `process-check-f030a48bef264e6ba9d7fd367633b160.json` was independently read after the maintainer supplied a failing summary. Host pids.max was 256; compilation and a four-child create/reap control succeeded. Stress ended in 0.396 seconds with client exit 128 and a gVisor WaitPID EOF diagnostic. Docker recorded container exit 2 and OOMKilled=false; its cgroup disappeared before PID counters were collected. Docker/containerd logs confirm runtime termination, without establishing its cause. Cleanup was confirmed. Host PID exhaustion affecting runtime threads and a runtime process-creation failure remain hypotheses; neither is established. A diagnostic revision adds live PID/memory counter sampling, bounded child-progress markers and a separate debug runtime at the same PID limit. Rerun and runtime-log analysis remain pending. This is an unresolved containment/reliability finding, not a successful learner process-limit result. RISK-01 remains In progress.

**2026-11-01 process diagnostic finding:** Maintainer-supplied summary for `process-check-41be05aa7617430892594b61b0b1cf57.json` records host PID usage reaching 256, a PID max-event delta of 1, zero OOM-kill delta and maximum sampled memory of 61,644,800 bytes. Stress progress reached at least 112 children before the sandbox exited 2; recovery failed because the container was no longer running. Cleanup succeeded. The runtime boot log was independently inspected at `/tmp/mcj-process-debug/runsc.log.20261101-135524.301949.boot.txt`; it contains `panic: Unknown syscall 56 error: createSysmsgThread: failed to get clone`. Together these observations support host PID exhaustion triggering a systrap runtime panic, rather than clean guest fork refusal. The host boundary held, but graceful process-limit handling failed.

A separate mitigation experiment retains host pids.max=256 and adds OCI guest RLIMIT_NPROC soft/hard limits of 32 via `process-check.py --guest-limit`. It verifies the guest limits, exact guest process boundary, EAGAIN, recovery, runtime survival and absence of host PID-limit events. This experiment is pending; the main Cangjie runner is unchanged. A successful result would still require Cangjie thread/compiler compatibility and deliberate selection of production guest/host budgets. The original runtime failure remains recorded; RISK-01 remains In progress.

**2026-11-01 guest process-limit mitigation checkpoint:** Maintainer-supplied summary for `process-check-f6a791afa5bb4c3ebe2695759572b41e.json` shows all assertions passing with `--guest-limit` and script exit 0. Guest RLIMIT_NPROC soft/hard limits were 32, while host pids.max remained 256. With baseline 2, the stress probe created 30 children, then fork returned EAGAIN (errno 11) at 32 guest processes. All 30 children were reaped; the four-child positive and recovery controls succeeded; the sandbox remained running before cleanup. Maximum sampled host PID usage was 93, PID max-event delta was 0, maximum sampled memory was 27,877,376 bytes and OOM-kill delta was 0. Cleanup and the supplied subsequent empty Docker listing confirmed removal. Raw JSON was not independently inspected here.

This demonstrates clean process refusal and recovery for the native probe with a separate guest limit, avoiding the observed host-limit runtime panic in this experiment. It does not erase the original failure or establish Cangjie compilation/thread compatibility, all clone/thread paths, concurrent-job behavior or final production budgets. The main runner remains unchanged; Cangjie compatibility under the proposed guest limit is the next checkpoint. RISK-01 remains In progress.

**2026-11-01 Cangjie guest-limit compatibility checkpoint:** Maintainer-supplied summary for `cangjie-guest-check-c261ec2aa25142a89e838acac9e4f603.json` shows all assertions passing and script exit 0 under the normal runsc-systrap runtime, guest NPROC soft/hard limits 32, host PID limit 256 and the regular prototype memory/storage settings. The compiler reported Cangjie 1.0.5 with Linux x86_64 target. Hello World and an eight-task spawn/Future.get workload both compiled and each executed three times with exact expected output and exit 0. A final Hello World execution after the task workload also succeeded. Host PID max-event and OOM-kill deltas were zero, maximum sampled host PID usage was 48, sandbox survival and cleanup were confirmed, and the supplied subsequent Docker listing was empty. Raw JSON was not independently inspected here.

This establishes selected compiler/runtime and language-task compatibility under the proposed guest limit; it does not demonstrate a one-to-one language-task/native-thread mapping, larger curriculum compilation, all native thread/clone paths or concurrent jobs. The main runner remains unchanged. Next integration work is applying the guest limit to the local runner and repeating its existing success/failure/containment regressions before treating that configuration as the shared prototype baseline. The earlier host-limit panic remains a recorded finding. RISK-01 remains In progress.

**2026-11-01 integrated local-runner regression checkpoint:** The agent applied guest RLIMIT_NPROC soft/hard limits 32 to both the prepared runner and the actual WSL copy, preserving host PID limit 256 and verifying guest limits before compilation. The previous WSL runner was backed up as `runner.before-guest-limit.py`. The agent directly executed `regression-check.py`; report `regression-check-66dfb30c42204242bb736e12c91200b5.json` records overall PASS with process exit 0 and no remaining probe containers.

- Ten fixtures passed through the updated main runner with their expected evidence: Hello World, compilation error, nonzero return, uncaught bounds exception, execution deadline, output cap, writable task storage, read-only filesystem, unmounted host canary and concurrent Cangjie tasks. Each case verifies its exact report association, configured restrictions, observed guest limits and cleanup.
- Five dedicated probes also passed: native guest process-limit mitigation, repeated Cangjie compatibility, controlled IPv4 TCP isolation, both tmpfs capacity boundaries and host memory enforcement. They retain their documented experimental configurations; this is not evidence that all use the updated main runner's guest setting. In particular the native memory probe still tests 512 MiB rather than the main runner's 2 GiB budget.
- Native process mitigation again reached the 32-process guest boundary with clean refusal/recovery and zero host PID events (maximum sampled host PIDs 93). Repeated Cangjie compatibility had zero host PID/OOM-kill events (maximum sampled host PIDs 47). The memory probe again recorded verified host limits and OOM evidence (`max=99`, `oom=5`, `oom_kill=1`).

This is executed integration/regression evidence for the current local prototype, not final production readiness. Compilation-limit triggering, broader/native-thread compatibility, source-mount writes, cross-job retention, interrupted cleanup/recovery, credential/queue permissions, production budgets and deployment-host verification remain outstanding. The original host-limit systrap panic remains recorded; the guest cap is a tested local mitigation. RISK-01 remains In progress.

**2026-11-01 compilation-phase enforcement checkpoint:** The agent implemented and directly ran `compile-check.py` against the existing WSL gVisor prototype. Report `compile-check-ca5403a7ac3247b186985b2232619726.json` records all seven cases passing, script exit 0, using the previously recorded image ID. The saved summary was independently read in this session. Each case checks its exact runner report, source association, configured runtime restrictions, observed guest process limits, cleanup confirmation and an exact-name Docker listing confirming removal.

- A controlled compiler substitute emitted a startup marker and slept beyond the regular 60-second compilation budget. The runner returned `compile_deadline` after `60.016` seconds with 21 captured bytes, without starting execution.
- A second controlled substitute emitted continuous stderr diagnostics. The runner returned `compile_output_limit` after `0.110` seconds with exactly `1,048,576` captured bytes, without starting execution.
- Fresh real-Cangjie Hello World compilations and executions succeeded immediately after each controlled failure and at the end of the checkpoint.
- A real Cangjie workload containing 200 functions compiled in `0.954` seconds and executed successfully with exact stdout `19900` plus newline. A separate source containing 1,000 undefined names produced `compile_nonzero`, compiler exit 1, in `0.376` seconds with 1,577 diagnostic bytes and no execution. Generated sources and hashes are retained with the local reports.

The substitutes demonstrate enforcement through the main runner's compilation phase, outcome mapping and container cleanup; they do not demonstrate the real Cangjie compiler hitting either limit. The real workloads establish selected compilation success and diagnostic-failure compatibility; neither triggered a limit. Recorded phase durations exclude subsequent container removal and do not measure the exact time sandbox processes stopped. Client exit `-9` in the controlled probes reflects runner termination of the Docker client, not OOM evidence. The normal compiler command and limits remain the default; controlled runs are explicitly labeled by `compiler_mode` in their reports. The checker is included in the expanded local regression suite.

After the cleanup review changes, the agent directly ran the expanded full regression: `regression-check-d5f1ef8f059d4a6181c417934e270a19.json` records overall PASS, process exit 0 and no remaining probe containers. All ten ordinary fixtures and six dedicated helpers passed. Its compilation report, `compile-check-a9fdac052cf641339ba581ea2321b63f.json`, was independently read: all seven cases passed with deadline detection at `60.030` seconds and output-limit detection at `0.107` seconds with exactly `1,048,576` captured bytes. The reviewed runner SHA-256 is `2dee073f7612afbbad6a115b0bec060083868e24a8484b972157ba92d017e1ff`. Dedicated memory/network/storage probes retain their previously documented configurations and limitations.

Targeted outer-failure cleanup and protection against repeated signals during runner cleanup were added and statically reviewed; deliberate interruption/hard-kill/restart recovery is not established here. Source-mount writes, cross-job retention, broader/native-thread compatibility, credential/queue permissions, production budgets and deployment-host verification remain outstanding. RISK-01 remains In progress.

**2026-11-01 source-file write-protection checkpoint:** The agent added a real Cangjie `fs-source-readonly.cj` fixture to the local regression suite and directly executed it through the normal runner in WSL/gVisor. The checker stages a disposable host source with mode `0666`, records its pre-run SHA-256, verifies that the sole bind mount maps that source read-only to `/input/main.cj`, and compares the exact host bytes and hash after the run. The maintained fixture is not used as the write target.

The program successfully reads the mounted source and uses `File.writeTo` to overwrite the disposable compiler copy `/work/main.cj` with `XYZ`, then reads back the expected bytes. The same write to `/input/main.cj` raises `FSException` with a read-only-filesystem diagnostic. The program verifies the mounted source remains byte-for-byte unchanged and exits 0. The checker also verifies unchanged host bytes, successful compilation/execution and container cleanup. A subsequent fresh concurrent-task compilation/run succeeds. The already-configured read-only bind supplies this boundary; no default runner isolation settings were changed for the checkpoint.

The agent independently inspected the saved runner report `mcj-probe-a3202d6d5e494f4e86b8252f8ab3c0c7.json`: compilation succeeded in `0.908` seconds; execution exited 0 in `0.136` seconds with 152 captured bytes, the expected denial/preservation markers, empty stderr and confirmed cleanup. The image ID matches the recorded prototype baseline. The inspected suite record confirms source mode `0o666` and matching before/after SHA-256 `9bd9cc450729153f0c958889314fa0168630fa571e7ad9c3694ca70db71f08a4`. Full regression `regression-check-8a4977368c8a48d4a4edce23969187c2.json` passed all eleven ordinary fixtures and six dedicated helpers, process exit 0, with no remaining probe containers. Reports and the disposable source remain local under `~/master-cangjie-evaluator/runner/results/`.

This demonstrates the tested Cangjie file-overwrite boundary with readable input, writable task-storage control and a host source whose write permissions are permissive. It does not establish every unlink/rename/mmap/native access path, compromised-compiler containment or general escape resistance. Cross-job retention, interrupted cleanup/recovery, broader/native-thread compatibility, credential/queue permissions, production budgets and deployment-host verification remain outstanding. RISK-01 remains In progress.

**2026-11-01 sequential-job storage-isolation checkpoint:** The agent implemented `sequential-check.py` for the local prototype. It generates real Cangjie programs and runs four distinct containers sequentially with the same image and ordinary runner restrictions: normal writer, fresh reader, timeout writer, fresh reader. Each writer creates a unique payload at the same two fixed paths, `/work/mcj-sequential-marker.txt` and `/tmp/mcj-sequential-marker.txt`, verifies existence and exact readback, and explicitly flushes its completion marker. The timeout writer then loops until the normal five-second execution deadline.

Each reader requires `std.fs.exists` to return false at both paths before attempting a read, requires the reads to fail, then creates and reads back its own markers at those same paths with existence now true. The checker verifies successful real compilation, expected execution outcomes, the sole read-only source bind and separate writable task tmpfs configuration, source/report/container association, runner cleanup and an exact-name Docker listing confirming the previous container is gone before the next job starts. Sources, payload, source hashes, execution evidence and exact report references remain local under `~/master-cangjie-evaluator/runner/results/`.

Three earlier checker attempts were rejected rather than counted as isolation evidence: Cangjie's read exception combined missing-file and permission-error text, so an ENOENT-text assertion was replaced with explicit existence checks and writable/readable controls; the timeout writer initially captured zero bytes, so its pre-loop evidence was changed to flush explicitly; the pinned compiler rejected a `println` flush argument, so the probe uses `std.env.getStdOut().flush()` instead. These were insufficient probe evidence and probe compatibility corrections, not demonstrated cross-job leaks. Failed reports remain available as `sequential-check-9aaffbb2c5f24f29aac4a61d6d94a18c.json`, `sequential-check-b7a42e3fc6f64002b8094a9c3b8cd135.json` and `sequential-check-e35c9589c4c34714bf7c3d691d4a71bb.json`.

The agent directly ran the corrected four-job checkpoint, exit 0, and independently read saved report `sequential-check-d02051646cba47f8b618c9fc65adf654.json`: all four cases passed on the recorded prototype image. The timeout writer produced both verified-write markers plus its completion marker (114 captured bytes) before `execute_deadline` detection at `5.040` seconds. Both fresh readers recorded explicit false existence checks and failed reads for both paths, followed by successful creation and exact readback, and exited 0. Each of the four exact containers was absent before proceeding. The runner hash remains `2dee073f7612afbbad6a115b0bec060083868e24a8484b972157ba92d017e1ff`; this checkpoint adds verification without changing runner isolation settings. Phase duration excludes subsequent container removal and is not an exact measurement of when sandbox execution stopped.

The agent then directly ran the full expanded regression: `regression-check-42ae09cc80274ccd94a5ff71f67232d0.json` records overall PASS, process exit 0 and no remaining probe containers. All eleven ordinary fixtures and seven dedicated helpers passed, including a repeated four-job check recorded as `sequential-check-1be1ce7f249d411fad19466c5fb7499d.json`. The checker source SHA-256 is `2886690b0d64e0d2bdb95732ea123d83c3c588bb94fc5f0773faa8746a5f8b86`. Dedicated containment helpers retain their previously documented experimental configurations and limitations.

This checkpoint concerns visibility of the tested task-storage files after normal completion and execution timeout. It does not establish secure data erasure, independent residual-process detection, concurrent-job separation, external cache isolation or recovery after coordinator/runtime/host failure. Deliberate interruption cleanup/recovery, broader/native-thread compatibility, credential/queue permissions, production budgets and deployment-host verification remain outstanding. RISK-01 remains In progress.

**2026-11-01 cooperative-interruption cleanup/recovery checkpoint:** The agent implemented `interruption-check.py` and a real Cangjie execution fixture, and directly ran four deliberate signal cases: SIGINT and SIGTERM during a controlled compilation pause, and SIGINT and SIGTERM during real Cangjie execution. Every case waits for an exact-container in-sandbox readiness file before signaling its own runner child. The compilation pause is the explicitly labeled `--compile-probe interrupt` substitute, not evidence of interrupting the real compiler. Execution publishes readiness from the compiled Cangjie program before looping.

The runner explicitly handles both signals and records `interruption_signal` and `interrupted_phase` with outcome `interrupted`, CLI exit 1 and no completed execution result. Compilation-phase interruptions do not produce a completed compilation result or start execution. Execution-phase interruptions retain the successful real compilation result. Each case requires runner-confirmed cleanup and an independent exact-name Docker listing showing its container is absent before any checker-assisted removal. Each is immediately followed by real Hello World compilation/execution in a fresh container. Checker fallback removal cannot establish a passing case.

The agent independently read the initial passing eight-job report `interruption-check-a311be7337df42a396b4b02103fda909.json`. All four signal cases and four recoveries passed on the recorded prototype image, without checker-assisted removal. Signal-to-runner-exit durations were `0.302`/`0.273` seconds for compilation SIGINT/SIGTERM and `0.316`/`0.319` seconds for execution SIGINT/SIGTERM. These durations include cleanup/reporting and are not exact measurements of when sandbox processes stopped. Review found and corrected a checker reporting gap: if its final container listing fails and fallback removal is attempted, the case and overall checkpoint must fail, even after an earlier successful listing. The runner SHA-256 is `2fdf2dfdb3a185ae9dc67f8a34e5f370c6f0d97dcca374e377d225b01a0779f2`.

The full expanded regression `regression-check-53fd05463eec45109947cdd17dac86d6.json` passed all eleven ordinary fixtures and eight dedicated helpers, process exit 0, with no remaining probe containers. After the checker reporting correction, the agent directly repeated the dedicated eight-job check: `interruption-check-ea57ad62aee44fc9995ec3c1c997c213.json` passed, process exit 0, with all four signals and four real Hello World recoveries succeeding under the stricter no-fallback rule. Representative saved compilation and execution interruption reports were also independently read to confirm the signal/phase fields, retained successful compilation for execution interruption, absent completed execution results and cleanup confirmation.

This checkpoint addresses cooperative signals during active phases. It does not establish SIGKILL/hard-crash cleanup, repeated signals during cleanup, interruption during container creation/startup, real-compiler interruption compatibility, daemon/host failure, durable orphan reconciliation or queue/submission recovery. Broader/native-thread compatibility, credential/queue permissions, production budgets and deployment-host verification also remain outstanding. RISK-01 remains In progress.

**2026-11-01 sequencing decision:** Following review of the remaining RISK-01 work, the maintainer approved finishing a bounded orphan-cleanup check and a credential-exposure check, then proceeding toward the first complete integrated coding path below. The accepted modular-monolith/isolated-worker architecture remains the baseline. RISK-01 may remain In progress during that integration; documented coverage limitations are not automatically prerequisites for more standalone prototype work. Queue-role restrictions and real durable dispatch/ingestion will be demonstrated with the actual integration, alongside the applicable RISK-02 recovery evidence. Deployment-host verification remains a release requirement. Exhaustive syscall/protocol testing, secure-erasure proofs, a general recovery framework and speculative multi-worker infrastructure are not prerequisites for this milestone.

**2026-11-01 bounded orphan-cleanup and credential-exposure checkpoint:** The agent implemented `orphan_cleanup.py`, `credential_probe.py` and `boundary-check.py` in the local prototype. The runner now holds a persistent host-side exclusive job lease and labels its sandbox with prototype ownership and job UUID. Startup reconciliation considers only matching labeled containers with valid UUID/name and an existing unlocked lease, removes by full immutable container ID, and skips active leases. Unknown ownership is refused. Lock files are retained to preserve inode/lock identity; the sandbox never mounts their directory. A container disappearing during inspection/removal is tolerated only after an independent successful exact-ID absence check.

The agent directly ran the dedicated check, exit 0, and independently inspected `boundary-check-07bfbe68b87542f39a6acb486a8e985f.json`:

- A controlled-compilation runner was SIGKILLed after sandbox readiness. Its container remained running and no finalized runner report existed. Starting a new normal Hello World runner removed that orphan through startup reconciliation while preserving a separate live runner. Hello World succeeded; repeating reconciliation removed nothing further and still preserved the active control. Local recovery plus verification took `2.852` seconds, below the check's 30-second threshold. The active control was then interrupted cooperatively and removed normally.
- Six harmless application/queue/storage/delivery/Google/database canary environment variables were supplied only to the host runner, and a readable dummy file remained outside the source mount. Same-UID sandbox probes after SDK environment setup, before real compilation and before execution, found none of these environment keys or the host canary path; selected Docker-socket/common credential-file paths also remained unexposed. Real Hello World compilation/execution succeeded. The sole mount was the read-only source. The inspected image recipe copies the SDK, installs build tools and selects UID 10001; it contains no credential injection instructions. Image-config environment inspection reported only `PATH`.
- Sensitivity controls intentionally exposed one dummy environment variable and, separately, the dummy file. The same probe rejected them with exits 21 and 22, respectively; both control containers were removed. No real credentials were injected or printed. Any checker fallback removal or failed final cleanup invalidates the check.

The runner SHA-256 is `f9c6b70474bc5f0d0e6e6bd37a7ccec6827be1e6927c68004467926e4cafe12c`; the image ID remains the recorded prototype baseline. Reports, dummy canary and per-run command output remain local under `~/master-cangjie-evaluator/runner/results/`. Initial checker failures from truncated-ID comparison and treating expected sensitivity-control nonzero statuses as Docker errors were corrected; they are not recorded as successful evidence.

Final full regression `regression-check-4f6d17fedb894a31a48636a7124f8351.json` passed all eleven ordinary fixtures and nine dedicated helpers, process exit 0, with no remaining probe containers. The repeated bounded check passed as `boundary-check-25e5461854d34a6eb98df5f6757d1905.json`. The saved credential runner report was independently inspected to confirm both successful phase-boundary probes, real compilation/execution and cleanup; the image recipe and image-config environment were also inspected. Review found no remaining important correctness/safety gaps within this bounded local scope.

This establishes cleanup at the next runner startup/manual reconciliation, not a periodic watchdog or a wall-time limit while the worker remains down. It does not establish daemon/host restart recovery, production lease/queue integration, exhaustive image-secret scanning or isolation of future real provider credentials. Those integrations must retain and verify the same boundaries. With these two bounded checks completed, standalone prototype coverage is sufficient to proceed toward the first integrated coding path; remaining launch/integration evidence remains tracked. RISK-01 remains In progress.

**2026-11-01 maintained-harness promotion:** Reusable Python harness modules, Cangjie/C fixtures and the inspected image recipe now live under [tools/evaluator](../tools/evaluator/README.md), outside ignored agent artifacts. Duplicate harness sources, obsolete one-time migration scripts and the old latest-report checker were removed from the local artifact directory after promotion. Only the personal command journal and the maintained-source sync helper remain there. Maintained scripts use configurable local image/runtime names and generate their own host canary plus rendered fixture, eliminating the personal home-directory dependency. Scoped ignore rules exclude generated reports/sources/canaries, lease files, caches, SDK image contexts and local environment files. Historical report references and hashes above retain their original meaning; promotion is not a claim that those old artifacts were produced from the new paths. The harness remains local Linux/gVisor feasibility tooling rather than a production service.

The agent directly ran the migrated suite in a separate Linux directory using the existing image/runtime configuration. Report `regression-check-d5d8c19df5e6454689cc7c4f60e05c03.json` records all eleven ordinary fixtures and nine dedicated helpers passing, exit 0 and no remaining probe containers. This includes the newly generated host canary and source template, source-write protection, orphan/credential boundaries, signals and sequential storage. No image rebuild, installation or production-host verification was performed. Python syntax checks and Git ignore checks passed. A final fail-fast path guard was separately verified to reject Cangjie interpolation/escaping hazards while accepting ordinary paths, spaces and Unicode; it is documented in the harness README. Raw reports stay local to the executing Linux copy's ignored `results/` directory. RISK-01 remains In progress.

## RISK-02: Interrupted or repeated evaluations produce inconsistent results

**Failure scenario:** A worker finishes but the application restarts before finalization; an outcome arrives twice; an expired worker reports late; or code and assessment content change while evaluation is underway. The application credits the wrong work, loses an unlock, or leaves a submission pending indefinitely.

**Why it matters:** These failures happen between successful individual steps. A passing compiler test or an isolated score-calculation test does not prove that the entire submission workflow recovers correctly. The queue's delivery behavior does not replace application-level operation identity and duplicate prevention.

**Relevant operations:** UC-07 through UC-11, UC-13 through UC-17, and UC-24. See the domain's result-eligibility and progress invariants and the architecture's [recovery rules](architecture.md#recovery-rules).

**Early action:** Exercise UC-09 and UC-11 through real persistence and deliberately interrupt the workflow at meaningful transitions.

**Evidence required to reduce this risk:**

- A repeated request or repeated result produces one consistent finalized outcome.
- A restart after dispatch, evaluation, ingestion, or before finalization preserves recoverable work.
- Submission finalization and earned progress commit consistently; neither is left without the other.
- Edited code and corrected assessment revisions cannot reuse unrelated historical results.
- An old worker claim cannot replace a newer accepted outcome.
- A service failure remains unevaluated rather than becoming an assumed score of zero.
- Browser reconnect restores the recorded operation outcome without blindly creating another submission.
- Lower retries preserve the best finalized percentage, solved achievements, completion, and earned unlocks.

**Evidence at initial review:** Rules and scenarios are documented; executable recovery evidence is not yet recorded.

**2026-11-02 quiz submission recovery verification:** The
[verification record](development/quiz-submission-recovery-verification.md)
passed `npm run check`, 56 domain tests, 3 real-PostgreSQL quiz journey
integration tests, and 25 scoped Playwright journeys. The browser selection
covers lost and held responses, duplicate prevention, tab ownership, draft
preparation and autosave races, session expiry, account changes, and
confirmed-result validation; the previously failing stalled-autosave scenario
now passes. This reduces the browser and quiz-API side of RISK-02. It does not
establish worker restart, evaluator interruption, or full UC-16 coding-path
recovery. RISK-02 remains In progress.

**2026-11-02 quiz autosave timeout recovery verification:** The
[verification record](development/quiz-autosave-timeout-recovery-verification.md)
passes `npm run check`, 56 domain tests, 32 real-PostgreSQL integration tests
(6 skipped), and 13 scoped Chromium autosave/conflict journeys, including a
real lost-response replay, offline reload recovery, autosave error isolation,
and the identical stale-snapshot PostgreSQL contract. The full browser suite is
still not green: a fresh bounded run discovered 53 journeys, passed the first
two, then failed `hello-world-drafts.spec.ts` while restoring the second tab's
selected code; 50 journeys did not run. A targeted rerun at base `f0422ef`
reproduced that exact coding-draft failure, confirming it predates this change.
An earlier run found that the Hello World recovery fixtures still expect
`/api/workspace` while the coding component uses the topic-specific coding route;
a comparison against base `f0422ef` confirmed that mismatch also predates this
change. These findings leave full coding-path verification open. This evidence
reduces only the quiz browser/API portion of RISK-02; worker restart, evaluator
interruption, and the full UC-16 coding path remain unverified. RISK-02 remains
In progress.

## RISK-03: MVP effort is underestimated

**Failure scenario:** The use-case list is treated as a collection of similarly sized tasks. Profile editing progresses quickly while offline drafts, conflicting edits, durable execution, verification, and historical assessment handling consume much more effort than expected.

**Why it matters:** A single UC identifier does not indicate implementation size. UC-17, resolving conflicting drafts, is materially different from changing a bio. The accepted MVP combines several demanding behaviors even though visual polish has been deferred.

**Relevant operations:** All implementation planning, particularly UC-09, UC-11, UC-16, UC-17, UC-21, and UC-22.

**Early action:** Estimate by risk and dependencies, and deliver complete working paths. UC numbering identifies behavior; it does not establish implementation order, effort, or one-module-per-UC structure.

**Evidence required to reduce this risk:**

- Implementation milestones identify their dependencies and unknowns rather than merely listing UC numbers.
- The core assessment path works before substantial time is spent on optional learner customization.
- Actual effort from early milestones informs later estimates.
- Every delivered UC includes its relevant exceptions and acceptance criteria, rather than only its easiest path.
- The implementation avoids unnecessary modules that merely forward arguments or duplicate existing business decisions.

**Scope constraint:** This register does not remove offline recovery, profile customization, or verification from the accepted MVP. Scheduling these after the first assessment demonstration is sequencing, not a silent release-scope change. Full visual polish remains deferred as already agreed.

**Evidence at initial review:** No implementation estimates or completed application milestones are recorded in this register.

## RISK-04: Curriculum preparation and correctness become bottlenecks

**Failure scenario:** The application is technically functional but release waits on lessons, coding problems, test cases, reference solutions, and reviewed questions. Incorrect expected output or ambiguous instructions then cause learners to fail valid solutions.

**Why it matters:** The current roadmap contains 18 topics, including five multiple-choice activities requiring 50 questions in total. It also contains 13 coding topics, whose problem and test inventory still require preparation. Exact output matching makes unintended whitespace in expected output consequential.

**Relevant operations:** UC-05 through UC-14, UC-23, and UC-24.

**Early action:** Prepare a few complete, reviewed topics alongside the first implementation path. Do not postpone all content authoring until the platform is finished.

**Evidence required to reduce this risk:**

- Reference solutions compile with the pinned Cangjie toolchain and pass every intended coding test.
- Expected outputs, including spaces and line endings, have been reviewed against the product's exact-match policy.
- Multiple-choice activities each contain ten reviewed questions with one correct choice per question and useful instructional context.
- The content inventory tracks readiness of lessons, problems, tests, and questions for every launch topic.
- Representative learners can understand the instructions and feedback without maintainer explanation.
- Content corrections preserve the historical score and unlock behavior already agreed in the product specification.

**Scope constraint:** Early content samples are internal implementation or pilot milestones. They do not redefine the accepted full launch roadmap.

**Evidence at initial review:** The topic inventory and scoring policies are specified; reviewed assessment content and reference-solution execution evidence are not present in the repository.

## RISK-05: Cooldowns are mistaken for capacity and cost control

**Failure scenario:** The per-learner/per-problem Validate cooldown works, but users can still generate work through different problems, individual runs, and submission-required evaluations faster than workers can process it. Verification requests create a separate usage and spending exposure.

**Why it matters:** A five-second cooldown is one eligibility rule, not a complete operating policy. It does not define total simultaneous work, maximum queued work, fair scheduling, execution budgets, or message-provider usage limits.

**Relevant operations:** UC-08, UC-09, UC-11, UC-21, and UC-22; worker deployment and operating configuration.

**Early action:** Measure representative compilation/execution workloads and choose explicit operating limits before exposing unrestricted public use.

**Evidence required to reduce this risk:**

- The pilot hosting budget, worker capacity, and expected simultaneous evaluations are recorded.
- Representative compilation and execution time and memory are measured.
- Total worker concurrency, queued-work limits, and per-account workload controls are defined for all execution entry points.
- Resource limits apply to individual runs and submission-required evaluation as well as manual batch validation.
- Contact-verification retry and usage controls and provider spending limits are established.
- Learners receive understandable busy, retry, or recovery status when capacity is exhausted.
- Queue and outcome retention cannot discard the only copy of work still awaiting ingestion or recovery.

**Scope constraint:** These controls must preserve the accepted per-problem cooldown semantics. They must not silently introduce an unexplained five-second wait between tests or change scoring.

**Evidence at initial review:** Operating parameters are explicitly left for implementation planning in the architecture and stack documents.

## RISK-06: Completion statistics are mistaken for learning evidence

**Failure scenario:** Learners earn scores and unlock topics, but the content and feedback do not help them solve unfamiliar problems. Project progress is judged only by completion counts, without checking whether learners understand the material.

**Why it matters:** Visible tests, retries, fixed multiple-choice activities, and retained best scores support practice. Those choices also limit what passing and unlocking establish about broader understanding. The existing product limitation about mastery still applies.

**Relevant operations:** UC-04, UC-05, UC-10, UC-13, UC-18, and UC-23.

**Early action:** Run a small learner pilot once complete sample topics work. Ask target learners to use the lessons and feedback, then attempt an unfamiliar exercise appropriate to the same concepts.

**Evidence required to reduce this risk:**

- Learner observations identify confusing instructions, unhelpful feedback, and progression friction.
- Topic completion and assessment results are examined alongside performance on unfamiliar exercises.
- Multiple-choice results remain distinguishable from solved coding problems in statistics.
- Product wording does not equate topic unlocks or repeated-test success with verified broad language mastery.
- Findings inform content improvements before the complete curriculum is treated as validated.

**Evidence at initial review:** The repository documents intended learners and workflows but no learner-validation findings.

## First milestone: prove one complete coding path

Implementation breakdown: [Hello World coding workflow plan](superpowers/plans/2026-11-01-hello-world-integration.md).
The plan is a proposed implementation sequence; its checkboxes are not completed evidence.

**2026-11-01 content sequencing decision:** The maintainer accepted the prepared
coding content for Running the First Cangjie Program, Program Structure,
Expressions and introductory Functions as sufficient for this implementation
milestone. Basic Data Types coding-content authoring is deferred until later.
This is a sequencing decision, not a reduction of the launch roadmap or evidence
that lessons and multiple-choice activities have been prepared. Proceed with the
application/persistence/worker integration rather than authoring more coding
topics as a prerequisite. Existing reference execution evidence and content
approval do not by themselves satisfy the integrated milestone below.

Before broad feature implementation, demonstrate one genuine coding topic through the actual application and evaluator:

1. Establish a learner and a valid unlocked-topic state consistent with the roadmap prerequisites.
2. Open and edit a real coding problem: UC-06 and UC-07.
3. Perform batch validation with the actual isolated Cangjie worker: UC-09, with permitted feedback through UC-10.
4. Submit sufficient work for the topic to reach its specified passing threshold: UC-11. Preserve unattempted problems in the denominator where applicable.
5. Record the finalized score, completion, and next-topic unlock consistently.
6. Reopen the application and recover the confirmed outcome and saved work: UC-16.
7. Repeat requests, interrupt execution and finalization, change the draft, and restart the worker/application. Confirm the same recovery and historical-progress rules still hold.

Use real persistence, pinned assessment content, and an actual evaluator for this milestone. The Hello World topic retains its specified one-test structure; broader evaluator stress checks use appropriate additional fixtures or other representative problems rather than silently changing that topic.

**Milestone exit evidence:** A reproducible working path, recorded runtime versions and configuration, confirmed permission/resource restrictions, and recovery checks covering the failures above. A screenshot, mocked evaluator, or completed documentation alone does not meet this milestone.

**2026-11-01 independent implementation verification:** The
[review of commit c5ea8d6](development/hello-world-verification.md) passed the
production build, static checks, 46 domain tests, 13 real PostgreSQL integration
tests, all six browser journeys against the real isolated evaluator, and seven
direct sandbox-adapter checks. This reduces uncertainty about the working coding
path for RISK-01/RISK-02. Unclaimed operations can still remain pending without an
actionable recovery state; failed submissions can be hidden and remain unfinalized
after their evaluation is retried; Dismiss can discard browser tracking while the
server operation remains pending. These reproduced gaps and the unexecuted full
restart/interruption matrix keep recovery acceptance incomplete. No risk is closed
by this verification.

This milestone primarily reduces RISK-01 and RISK-02 while providing effort and workload evidence for RISK-03 and RISK-05. It is an early implementation checkpoint, not completion of the full MVP.

## Maintaining this register

- Keep risk IDs stable. Add new IDs rather than renumbering existing records.
- Review the register when planning milestones, selecting operating limits, completing the first working path, and preparing a learner pilot or release.
- Update status from Open to In progress or Reduced as evidence appears. Record the date, relevant change, runtime/tool versions where applicable, and a link to the evidence.
- Close a risk only when its stated failure conditions are sufficiently addressed and remaining limitations are explicit. An accepted architecture or stack is not evidence that a risk is closed.
- Do not use risk reduction as an implicit authorization to change product scope, remove acceptance criteria, provision infrastructure, or incur provider costs.

No application checks described here have been run as part of creating this register. It is the persistent reference for what must be demonstrated during implementation and validation.


### 2026-11-01 Hello World recovery milestone evidence

The [recovery implementation follow-up](development/hello-world-verification.md#recovery-implementation-follow-up-2026-11-01)
resolves the independent audit findings. The complete Hello World coding-path
recovery milestone is verified: 46 domain tests, 28 real PostgreSQL tests, all six
real Linux sandbox tests, all fourteen browser tests, and the actual
SIGKILL/restart matrix passed. The matrix covers compile/execute interruption,
orphan cleanup, generation fencing, durable outcomes before queue acknowledgement,
ingestion before continuation, and transaction boundaries around dispatch intent
and atomic progress finalization. Lease/stale expiry inputs were explicitly
accelerated in the test database; real process deaths and execution were not mocked.

This provides demonstrated RISK-01/RISK-02 recovery evidence and completes the
first coding-path milestone. RISK-02 is now In progress rather than Open; neither
risk is closed for the complete MVP. Remaining capacity/retention, backup/restore,
provider and curriculum acceptance still require their own evidence. The startup
runbook and guarded isolated test commands support reproducing these checks.


### 2026-11-02 onboarding lesson handouts

Three source-linked handouts now cover Getting Started with Cangjie, Installing
the Cangjie Toolchain, and Running the First Cangjie Program. Shared topic pages
present lessons and summaries before their activity section; the existing Hello
World workspace is linked at `/topics/running-the-first-cangjie-program/activity`.
The first two quizzes are explicitly unavailable. These are public lesson previews
in the current internal build, which conflicts with the approved locked-topic rule:
learners must not see a locked topic's lessons, summaries, or activity before
completing its prerequisite. Treat this as an open UC-04/UC-05 access-enforcement
gap, not an approved preview exception or evidence of earned topic access. RISK-04
remains open: quiz authoring, maintainer content approval and learner validation
still require evidence.
See `content/lessons/README.md` for source/version scope and content ownership.
