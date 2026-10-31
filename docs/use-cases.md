# MasterCangjie Use Cases

## Purpose and source

This catalog turns [the product specification](product.md) into operations that can be referenced as implementation work, such as **Implement UC-09**. The product specification remains the source of product scope and business rules. This catalog defines observable behavior, without choosing technical architecture.

The [domain and business model](domain-model.md) defines the concepts, invariants, and algorithms behind these operations. Use the [glossary](../GLOSSARY.md) for canonical terminology.

The accepted [architecture](architecture.md) assigns these operations to modules and runtime hosts. The accepted [MVP technology stack](mvp-stack.md) supplies the implementation baseline, with a clean, functional UI first and full visual polish deferred.

Use-case IDs are permanent. Add new IDs when scope grows; do not renumber existing cases. An acceptance criterion such as **UC-09-AC2** belongs to that use case and can be referenced in implementation tasks or later verification.

All learner-facing cases below are in MVP scope. UC-23 and UC-24 describe content-maintainer operations needed to run the product; they do not introduce a product-facing authoring or administration interface.

## Actors

| Actor | Role |
| --- | --- |
| Visitor | Registers or signs in using Google. |
| Learner | Uses the learning path, activities, saved work, statistics, and profile. |
| Content maintainer | Prepares and corrects the curriculum and assessment material. |
| Google | Supporting external service for sign-in and Google account recovery. |

The product evaluates work, records results, and applies progression as part of the learner's operations. These automated behaviors are included in their parent use cases rather than treated as separate user roles.

## Use-case index

| ID | Operation | Primary actor | Main outcome |
| --- | --- | --- | --- |
| [UC-01](#uc-01-register-or-sign-in-with-google) | Register or sign in with Google | Visitor | Access the correct learner account and dashboard. |
| [UC-02](#uc-02-sign-out) | Sign out | Learner | End account access while retaining saved work. |
| [UC-03](#uc-03-obtain-account-recovery-guidance) | Obtain account recovery guidance | Visitor / learner | Reach Google's recovery process. |
| [UC-04](#uc-04-view-the-dashboard-and-roadmap) | View the dashboard and roadmap | Learner | Understand progress, availability, and the next step. |
| [UC-05](#uc-05-open-an-unlocked-topic-and-learning-material) | Open an unlocked topic and learning material | Learner | Access the topic's lessons and activity. |
| [UC-06](#uc-06-open-a-coding-problem-and-inspect-its-tests) | Open a coding problem and inspect its tests | Learner | Understand the task and permitted test details. |
| [UC-07](#uc-07-edit-and-save-a-code-draft) | Edit and save a code draft | Learner | Preserve current code and identify outdated results. |
| [UC-08](#uc-08-run-one-test-case) | Run one test case | Learner | Receive individual feedback without points. |
| [UC-09](#uc-09-validate-all-tests-for-a-coding-problem) | Validate all tests for a coding problem | Learner | Receive a current problem score. |
| [UC-10](#uc-10-inspect-coding-feedback) | Inspect coding feedback | Learner | Understand permitted output, differences, and failures. |
| [UC-11](#uc-11-submit-a-coding-topic) | Submit a coding topic | Learner | Finalize a topic score and earn eligible completion and unlocks. |
| [UC-12](#uc-12-answer-and-save-a-multiple-choice-activity) | Answer and save a multiple-choice activity | Learner | Preserve selections for exactly ten questions. |
| [UC-13](#uc-13-submit-a-multiple-choice-activity) | Submit a multiple-choice activity | Learner | Finalize a score out of 100. |
| [UC-14](#uc-14-mark-a-passed-multiple-choice-topic-complete) | Mark a passed multiple-choice topic complete | Learner | Complete the topic and unlock the next one. |
| [UC-15](#uc-15-retry-a-topic-activity) | Retry a topic activity | Learner | Make another attempt while retaining earned achievements. |
| [UC-16](#uc-16-resume-work-after-an-interruption) | Resume work after an interruption | Learner | Recover drafts, selections, location, and recorded progress. |
| [UC-17](#uc-17-resolve-conflicting-drafts) | Resolve conflicting drafts | Learner | Choose current work without silent data loss. |
| [UC-18](#uc-18-view-performance-statistics) | View performance statistics | Learner | Understand coding, multiple-choice, and topic achievements. |
| [UC-19](#uc-19-edit-username-and-bio) | Edit username and bio | Learner | Save optional profile changes. |
| [UC-20](#uc-20-add-or-update-a-profile-photo) | Add or update a profile photo | Learner | Save an optional profile image. |
| [UC-21](#uc-21-change-and-verify-a-contact-email) | Change and verify a contact email | Learner | Activate a verified contact without changing sign-in identity. |
| [UC-22](#uc-22-bind-or-change-and-verify-a-mobile-number) | Bind or change and verify a mobile number | Learner | Activate a verified mobile contact. |
| [UC-23](#uc-23-prepare-the-launch-curriculum) | Prepare the launch curriculum | Content maintainer | Make the specified roadmap and assessments available. |
| [UC-24](#uc-24-correct-published-assessment-content) | Correct published assessment content | Content maintainer | Apply corrections while protecting earned progress. |

## Shared rules and outcome boundaries

These rules apply wherever the corresponding behavior occurs, even when a use case does not repeat them in full.

1. **Access:** Learner operations require the learner's Google-authenticated account and an unlocked topic where applicable. A direct link does not bypass prerequisites. Only that learner's work and progress are restored or changed.
2. **Learning order:** Follow the exact topic order in the product's MVP roadmap, within and across categories. Categories have no separate assessment. Only the first onboarding topic is initially unlocked. Completing the last topic finishes the path without unlocking an additional topic.
3. **Coding scores:** Every passed test earns 10 points, including hidden tests. Individual runs award no points. Batch results apply to the code version evaluated. Topic percentages use all possible test points, including those belonging to unattempted problems.
4. **Multiple-choice scores:** Every activity has exactly ten questions with one correct answer each. Correct answers earn 10 points; incorrect and unanswered questions earn zero. A score of at least 60/100 passes.
5. **Finalization:** A coding topic is complete only after a passing topic submission. A multiple-choice topic requires a passing submission and then "Mark complete." Merely reading a lesson, passing one individual test, or receiving a problem score does not complete a topic.
6. **Historical achievements:** Retain the highest finalized topic percentage, preserving its original earned and possible points. Compare percentages even when possible points change; keep the earlier best on a tie. Retain all earned completion, unlocks, and solved achievements. Show a lower current attempt separately. A passing multiple-choice score remains eligible for completion even after a later failed retry.
7. **Incomplete work:** Unattempted coding problems and unanswered multiple-choice questions may contribute zero after explicit incomplete-submission confirmation. Attempted coding work needing evaluation cannot be finalized using zero as a substitute for a missing service result.
8. **Evaluation failures:** Compilation, runtime, and timeout outcomes in learner code are evaluated failures. A service failure is unevaluated: do not award an assumed score, replace a prior recorded score, or finalize an affected submission.
9. **Visibility:** Hidden tests reveal existence and pass/fail only. Their inputs, expected output, console output, differences, and revealing diagnostics remain hidden in every workflow, including final submission and restored results.
10. **Persistence:** Preserve code drafts, answer selections, resume location, and confirmed results and progress. Identify unsynced work and conflicting drafts. Later edits never rewrite an already submitted attempt.
11. **Repeated actions:** Repeated clicks during a pending run, submission, or completion produce one consistent action and outcome. Manual batch validation has a cooldown of at least five seconds per learner/problem pair, shared across tabs and devices, and remains unavailable while that validation is pending. Different problems have independent windows. Automatic submission-required evaluation does not introduce a five-second wait between tests or different problems.
12. **Contacts:** Contact-email and mobile changes require verification. Keep the old verified contact active until replacement succeeds. Neither contact is an alternative sign-in method; Google remains the sign-in identity.

| Event | Score or achievement recorded | Completion / unlock outcome |
| --- | --- | --- |
| Individual coding test passes | Feedback only; no points or solved achievement | No change. |
| All tests pass in a batch validation | Current problem points and retained solved achievement | No topic completion until topic submission. |
| Coding topic submission is below 60% | Finalized attempt; update best score if higher | No new completion or unlock. Existing achievements remain. |
| Coding topic submission reaches 60% | Finalized attempt and best-score comparison | Complete topic and unlock the next one. Hello World has one test, so only 10/10 passes. |
| Multiple-choice submission reaches 60/100 | Finalized attempt and best-score comparison | Show "Mark complete"; do not newly unlock the next topic yet. |
| Learner marks an eligible multiple-choice topic complete | Retain its passing score | Complete topic and unlock the next one. |
| A later attempt has a lower score | Record current outcome without reducing best | No loss of solved status, completion, or unlocks. |
| A service fails to return an evaluation | No assumed evaluation score | Affected submission remains unfinalized; previous progress remains. |

## Detailed use cases

### UC-01: Register or sign in with Google

**Primary actor:** Visitor. **Supporting actor:** Google.  
**Trigger:** Select Google registration or sign-in.  
**Preconditions:** None; an existing MasterCangjie account is not required.

**Main flow**

1. Visitor chooses Google sign-in and completes Google's account-access flow.
2. The product identifies whether this Google identity already has a learner account.
3. For a new identity, create the learner account with initial roadmap progress. For a returning identity, use the existing account and progress.
4. Show the dashboard through UC-04.

**Alternatives and failures:** Cancellation leaves the visitor signed out. Failed sign-in explains the failure and offers retry or UC-03. Do not substitute a contact email for Google identity or link unrelated accounts by matching emails.

**Successful outcome:** The learner accesses their account; returning access does not create duplicate learner progress.

**Acceptance criteria**

- **UC-01-AC1:** New Google registration opens an account with only the first onboarding topic initially unlocked.
- **UC-01-AC2:** Returning Google sign-in restores the same account, scores, and progress.
- **UC-01-AC3:** Failed or cancelled sign-in does not grant learner access. Password, Facebook, GitHub, and account linking are absent from MVP sign-in choices.

**Source:** Product → Account access; MVP scope → Account access.

### UC-02: Sign out

**Primary actor:** Learner. **Trigger:** Select sign out.  
**Preconditions:** Signed in.

**Main flow**

1. Preserve the current code or answer draft and resume location using the persistence rules.
2. Clearly identify any edits not yet synced; keep recoverable offline work associated with the learner.
3. End signed-in account access and show signed-out navigation.

**Alternatives and failures:** Signing out during an unconfirmed evaluation does not manufacture a result or erase recorded progress. UC-16 recovers confirmed results on return. Do not report unsynced edits as safely synced.

**Successful outcome:** Account access ends; saved work and progress remain recoverable.

**Acceptance criteria**

- **UC-02-AC1:** Signed-out access cannot continue changing learner account data.
- **UC-02-AC2:** Signing back into the same account recovers saved work and progress without resetting scores or unlocks.
- **UC-02-AC3:** Unsynced work remains clearly distinguished from confirmed saved work.

**Source:** Product → Account access; interruption recovery.

### UC-03: Obtain account recovery guidance

**Primary actor:** Visitor or learner. **Supporting actor:** Google.  
**Trigger:** The person cannot access their Google account.  
**Preconditions:** None; available without successful sign-in.

**Main flow**

1. Explain that Google provides account recovery for the MVP's sign-in method.
2. Direct the person to Google's account recovery process.
3. After recovery, they may return to UC-01.

**Alternatives and failures:** If recovery remains unsuccessful, keep account access unavailable. Do not offer a MasterCangjie password reset, contact-email login, or mobile login as a substitute.

**Successful outcome:** The person knows where to recover access; MasterCangjie does not claim that recovery succeeded before Google access is restored.

**Acceptance criteria**

- **UC-03-AC1:** Recovery guidance is accessible while signed out and points to Google's recovery process.
- **UC-03-AC2:** A verified MasterCangjie contact does not become another sign-in or account-recovery credential.

**Source:** Product → Account access; Google account loss edge case.

### UC-04: View the dashboard and roadmap

**Primary actor:** Learner. **Trigger:** Sign in or open the dashboard.  
**Preconditions:** Signed in; roadmap prepared through UC-23.

**Main flow**

1. Display the ordered categories and topics with their availability and completion status.
2. Show recorded best scores, the previous learning location, and the next available action where applicable.
3. Let the learner open an unlocked topic through UC-05 or resume through UC-16.

**Alternatives and failures:** A locked topic explains its prerequisite instead of opening its activity. A new learner is directed to onboarding. After the last topic, show path completion without inventing another prerequisite or topic.

**Successful outcome:** The learner can distinguish what is completed, available, awaiting "Mark complete," and locked.

**Acceptance criteria**

- **UC-04-AC1:** The roadmap follows the product's specified order and does not assign scores to categories.
- **UC-04-AC2:** Every locked topic identifies the preceding topic that must be completed.
- **UC-04-AC3:** Returning learners can identify their saved location; new learners have a clear first action.

**Source:** Product → Topic access, Topic selection; MVP roadmap and statistics.

### UC-05: Open an unlocked topic and learning material

**Primary actor:** Learner. **Trigger:** Select a topic or follow its link.  
**Preconditions:** Signed in; selected topic is unlocked.

**Main flow**

1. Check topic availability and present its lessons or summaries and activity type.
2. Let the learner read the material and open coding problems through UC-06 or the multiple-choice activity through UC-12.
3. Update the learner's resume location.

**Alternatives and failures:** A direct link to a locked topic is denied with prerequisite guidance. After onboarding, opening or reading lessons is not required before starting the activity. Reading alone never awards a passing score or unlock.

**Successful outcome:** The learner accesses appropriate material and the correct activity for the topic.

**Acceptance criteria**

- **UC-05-AC1:** Locked-topic access is enforced for dashboard navigation and direct links alike.
- **UC-05-AC2:** Every non-coding topic leads to its ten-question activity, including the first two onboarding topics, Identifiers, Unit, and Nothing.
- **UC-05-AC3:** After onboarding, an unlocked activity is accessible without proving that its lessons were read.

**Source:** Product → Activity types, Topic access, Optional reading and completion.

### UC-06: Open a coding problem and inspect its tests

**Primary actor:** Learner. **Trigger:** Choose a problem within a coding topic.  
**Preconditions:** Signed in; coding topic is unlocked.

**Main flow**

1. Show the instructions, constraints, starter code or saved draft, and test list.
2. Allow visible tests to expand to show their permitted details and expected output.
3. For hidden tests, show their existence and available pass/fail status with "This test case is hidden."
4. Allow navigation among the topic's problems in any order and save the current location.

**Alternatives and failures:** A problem without a previous attempt shows no invented pass/fail result. Hidden details remain unavailable when expanded or restored from earlier results.

**Successful outcome:** The learner understands the task without receiving hidden-test information.

**Acceptance criteria**

- **UC-06-AC1:** Merely opening a problem does not mark it attempted or award points.
- **UC-06-AC2:** Visible inputs and expected outputs are inspectable; hidden inputs, outputs, differences, and diagnostics are concealed.
- **UC-06-AC3:** Navigation does not impose a problem-by-problem prerequisite within an unlocked topic.

**Source:** Product → Topic access, Attempted and unattempted coding problems, Visible and hidden tests.

### UC-07: Edit and save a code draft

**Primary actor:** Learner. **Trigger:** Edit code in an opened problem.  
**Preconditions:** UC-06 has opened an accessible problem.

**Main flow**

1. Let the learner edit the problem's Cangjie code and mark the problem attempted.
2. Preserve the draft and show whether the latest edits are saved or unsynced.
3. If code differs from its last evaluated version, mark it "Changed since last validation."
4. Keep earlier results associated with the code they evaluated; do not present them as current.

**Alternatives and failures:** Offline edits remain recoverable and sync when possible through UC-16. Conflicting drafts invoke UC-17. A draft change does not overwrite an already submitted attempt or reduce a historical best score.

**Successful outcome:** Current work is preserved, and the learner can distinguish current code from previously evaluated code.

**Acceptance criteria**

- **UC-07-AC1:** Editing code makes the problem attempted; reopening restores its saved draft.
- **UC-07-AC2:** Editing validated code makes its earlier result outdated for current-work scoring.
- **UC-07-AC3:** The editor supports Cangjie console exercises; no other-language, server, or UI-application workflow is offered.

**Source:** Product → Supported language, Attempted and unattempted coding problems; changed-code and interruption edge cases.

### UC-08: Run one test case

**Primary actor:** Learner. **Trigger:** Run a selected test.  
**Preconditions:** A coding problem is open and its current code is available.

**Main flow**

1. Mark the problem attempted and evaluate the current code against the selected test.
2. Show the confirmed test outcome and permitted feedback through UC-10.
3. Associate that result with the code version and test evaluated.

**Alternatives and failures:** Compilation failure prevents execution; a runtime error or timeout fails the selected test. Service failure leaves the run unevaluated and retryable. A hidden test still exposes pass/fail only. Repeated clicks during the pending action do not create duplicate runs.

**Successful outcome:** The learner receives feedback for one test without a scored batch result.

**Acceptance criteria**

- **UC-08-AC1:** Passing an individual test adds no points, solved achievement, topic completion, or unlock.
- **UC-08-AC2:** Individual hidden-test runs do not reveal hidden output or diagnostics.
- **UC-08-AC3:** Service failure is distinct from a learner's failing test and does not become a zero-point batch result.

**Source:** Product → Individual versus batch runs, Coding failures, Visible and hidden tests.

### UC-09: Validate all tests for a coding problem

**Primary actor:** Learner. **Trigger:** Select Validate, or UC-11 requires evaluation of current attempted code.  
**Preconditions:** An accessible coding problem has current code; no overlapping validation for the action is pending. Manual batch validation respects its cooldown.

**Main flow**

1. Mark the problem attempted and evaluate one current code version against all its tests.
2. Record each confirmed result, including hidden-test pass/fail, and calculate earned and maximum points.
3. Show the current problem score and feedback through UC-10.
4. If all tests pass, record the solved achievement. Keep any previously earned solved achievement on later failures.
5. For manual validation, share the learner/problem cooldown across tabs and devices. Disable Validate for at least five seconds from the request and while that problem's validation is pending; show remaining status. Another problem has an independent window.

**Alternatives and failures:** Compilation failure gives zero for that validation. A runtime error or timeout fails the affected test; continue other tests where possible. A service failure leaves evaluation incomplete rather than supplying a score. If code changes during evaluation, the result belongs to the evaluated version and cannot represent the new draft as validated.

**Successful outcome:** A confirmed batch result and score exist for a specific code version.

**Acceptance criteria**

- **UC-09-AC1:** Passing four of seven tests yields 40/70; each hidden test has the same ten-point weight as a visible one.
- **UC-09-AC2:** For the same learner/problem pair, Validate remains disabled across tabs and devices for at least five seconds and until the pending validation ends. Another problem has its own cooldown window.
- **UC-09-AC3:** An all-tests-passed batch adds a solved problem but does not complete the topic before UC-11.
- **UC-09-AC4:** A service interruption does not fabricate missing test outcomes, replace a prior recorded score with zero, or label changed code validated.

**Source:** Product → Coding problem score, Coding failures, Individual versus batch runs, Learner statistics, Validation cooldown.

### UC-10: Inspect coding feedback

**Primary actor:** Learner. **Trigger:** Open results from UC-08, UC-09, or UC-11.  
**Preconditions:** A confirmed result or identifiable evaluation failure exists.

**Main flow**

1. Identify the run and whether its result applies to the current code.
2. For a visible test, show permitted actual output, expected output, differences, and diagnostics.
3. Distinguish wrong answers, compilation errors, runtime failures, timeouts, excessive output, and service failures.
4. Use green for matching output, orange for formatting differences, and red for other differences, accompanied by text or symbols.

**Alternatives and failures:** Hidden tests show pass/fail only. Exact output matching applies: any whitespace or line-ending difference fails. A result for an earlier code draft is labeled accordingly rather than reused as proof that the current draft passes.

**Successful outcome:** The learner understands the permitted feedback and can revise their solution.

**Acceptance criteria**

- **UC-10-AC1:** A trailing-space, tab, or newline difference is shown as a formatting mismatch and fails the test.
- **UC-10-AC2:** Feedback remains understandable without relying on color alone.
- **UC-10-AC3:** Viewing or restoring hidden-test results never reveals concealed details; viewing results never changes scores.

**Source:** Product → Coding failures, Visible and hidden tests; output-comparison and changed-code edge cases.

### UC-11: Submit a coding topic

**Primary actor:** Learner. **Trigger:** Submit a coding topic attempt.  
**Preconditions:** Signed in; coding topic is unlocked.

**Main flow**

1. Present the attempted, unattempted, and outdated-result problems for review.
2. Obtain submission confirmation, explicitly identifying any unattempted problems that will earn zero.
3. Through UC-09, evaluate the latest code of each attempted problem lacking a current batch result. Reuse only results for the current code; do not run unattempted problems.
4. Sum the current eligible problem points. Divide by all possible topic points, including unattempted problems, to determine whether the submission reaches 60%.
5. Finalize the attempt's score and compare it with the retained best finalized topic score.
6. On a passing submission, complete the topic and unlock the next topic, or record path completion at the end of the roadmap.

**Alternatives and failures:** Cancellation leaves the attempt unfinalized. Unattempted problems are permitted after confirmation. Service failure during required evaluation leaves the topic submission unfinalized, preserves prior results and progress, and offers retry. Learner compilation or execution failures are valid evaluated failures. Repeated submission clicks do not create duplicate outcomes.

**Successful outcome:** A finalized topic attempt has a score derived from the submitted work and appropriate progression.

**Acceptance criteria**

- **UC-11-AC1:** Unattempted problems contribute zero and remain in the maximum possible score; attempted unvalidated problems must be evaluated before finalization.
- **UC-11-AC2:** If problem maxima are 100 and 50, earning 90/150 passes at exactly 60%; earning 80/150 does not pass. A problem with more tests intentionally has more weight.
- **UC-11-AC3:** Hello World's single passed test gives 10/10 and completes its onboarding topic; a failed test gives 0/10 and does not complete it.
- **UC-11-AC4:** A service failure never substitutes zero for missing evaluation. A lower finalized retry never removes an existing best score, completion, or unlock.

**Source:** Product → Passing a topic, Attempted and unattempted coding problems, Final submission, Progress after retry; submission and evaluation-failure edge cases.

### UC-12: Answer and save a multiple-choice activity

**Primary actor:** Learner. **Trigger:** Open a non-coding topic's activity.  
**Preconditions:** Signed in; topic is unlocked and has a multiple-choice activity.

**Main flow**

1. Show exactly ten questions with answer choices.
2. Allow one selected answer per question and allow selection changes before submission.
3. Preserve answer selections and the resume location, identifying unsynced work.
4. Let the learner review and proceed to UC-13.

**Alternatives and failures:** Learners may leave questions unanswered. Offline selections follow UC-16; conflicting selections follow UC-17. Editing after a finalized submission belongs to a new attempt and does not modify the recorded answers or score of the earlier attempt.

**Successful outcome:** An editable answer draft exists for the learner's activity attempt.

**Acceptance criteria**

- **UC-12-AC1:** The activity has ten questions and allows one answer per question.
- **UC-12-AC2:** Selected answers can be changed before submission and recovered on return.
- **UC-12-AC3:** Draft selections alone award no score, topic completion, or unlock.

**Source:** Product → Activity types, Multiple-choice scoring; interruption recovery.

### UC-13: Submit a multiple-choice activity

**Primary actor:** Learner. **Trigger:** Submit multiple-choice answers.  
**Preconditions:** UC-12 has opened an unlocked topic's activity.

**Main flow**

1. Show the ten current selections for review and identify unanswered questions.
2. Obtain confirmation, explaining that unanswered questions earn zero.
3. Evaluate the submitted selections: ten points per correct answer and zero per incorrect or unanswered question.
4. Record per-question results and the finalized activity/topic attempt score out of 100, comparing it with the retained best score.
5. If the learner has earned at least 60/100, offer UC-14. Do not newly unlock the next topic merely because this submission passed.

**Alternatives and failures:** Cancellation leaves selections editable. Unanswered questions are allowed after confirmation. A failed evaluation does not finalize an assumed result. A lower retry does not reduce best score or undo earlier completion, unlocks, or eligibility to mark complete.

**Successful outcome:** Submitted selections and a confirmed score are recorded; the learner knows whether marking complete is available.

**Acceptance criteria**

- **UC-13-AC1:** Six correct answers yield 60/100 and pass; five yield 50/100 and fail. Incorrect and unanswered questions earn zero, with no partial credit.
- **UC-13-AC2:** A first passing submission does not unlock the next topic before UC-14.
- **UC-13-AC3:** Recorded submitted answers remain unchanged by later edits, and repeated clicks do not finalize duplicate attempts.

**Source:** Product → Multiple-choice scoring, Passing a topic, Final submission, Progress after retry.

### UC-14: Mark a passed multiple-choice topic complete

**Primary actor:** Learner. **Trigger:** Select "Mark complete."  
**Preconditions:** Signed in; topic is unlocked and has a finalized multiple-choice score of at least 60/100 from any retained attempt.

**Main flow**

1. Confirm the learner has an eligible passing submitted score.
2. Mark the topic complete and preserve its retained best score.
3. Unlock the next topic or show completed-path status for the last topic.
4. Reflect the change on the roadmap and statistics.

**Alternatives and failures:** Without a passing submission, keep the action unavailable and direct the learner to the activity. If the topic is already complete, repeated actions do not duplicate progress. A lower recent retry does not invalidate an earlier passing submission. The learner is not required to prove every lesson was read.

**Successful outcome:** The topic is complete and progression advances exactly once.

**Acceptance criteria**

- **UC-14-AC1:** A passing score without this action leaves the next topic locked; selecting it completes the topic and unlocks the next.
- **UC-14-AC2:** A retained 70/100 followed by a 40/100 retry still permits completion.
- **UC-14-AC3:** This operation applies to the first two onboarding topics, Identifiers, Unit, and Nothing, and is not a replacement for their scored assessment.

**Source:** Product → Onboarding completion, Optional reading and completion, Progress after retry; passed-but-unmarked edge case.

### UC-15: Retry a topic activity

**Primary actor:** Learner. **Trigger:** Return to an available topic and attempt its activity again.  
**Preconditions:** Topic remains unlocked; previous results may be passing or failing.

**Main flow**

1. Show existing best results and allow an editable current attempt.
2. For coding, use UC-07 through UC-11 as applicable; for multiple choice, use UC-12 and UC-13.
3. Record the new finalized outcome without rewriting earlier submissions.
4. Increase the best score only if the new finalized score is higher. Preserve completion and unlocks in all cases.

**Alternatives and failures:** An unfinalized attempt does not replace a finalized topic score. Manual batch-validation retries respect UC-09's cooldown. A failed retry cannot remove previously earned eligibility for UC-14 or require a completed topic to be marked complete again.

**Successful outcome:** The learner can practice repeatedly without losing earned progress.

**Acceptance criteria**

- **UC-15-AC1:** An 80% best score followed by 40% retains the 80% best score and displays 40% as the current attempt result.
- **UC-15-AC2:** A later 90% replaces the retained 80% best score without losing history or previously unlocked access.
- **UC-15-AC3:** A failed coding or multiple-choice retry does not reduce completed-topic or solved-problem achievements.
- **UC-15-AC4:** If corrected content changes possible points, compare finalized percentages and preserve the original points: 80/100 remains the best after a 90/150 retry. Equal percentages retain the earlier best result.

**Source:** Product → Topic selection, Progress after retry, Learner statistics.

### UC-16: Resume work after an interruption

**Primary actor:** Learner. **Trigger:** Return after navigation, closing the page, signing out, or losing connectivity.  
**Preconditions:** The learner has prior work associated with their account; account access is restored where needed.

**Main flow**

1. Recover confirmed scores, achievements, topic status, and the saved learning location.
2. Restore the corresponding code draft or multiple-choice answer selections.
3. Identify offline or unsynced edits and sync them when connectivity returns, subject to UC-17 if there is a conflict.
4. Restore confirmed evaluation results with their correct code or submitted-answer context; keep changed drafts labeled unvalidated.
5. Let the learner continue editing or retry an evaluation whose outcome remains unconfirmed.

**Alternatives and failures:** If connectivity remains unavailable, preserve drafts and show their unsynced status without inventing results. If evaluation completed before the interruption, recover its confirmed outcome rather than duplicate submission. If its outcome cannot yet be confirmed, show that uncertainty and do not replace prior progress with zero.

**Successful outcome:** The learner continues from recoverable work with accurate save and evaluation status.

**Acceptance criteria**

- **UC-16-AC1:** Saved code and answer selections survive leaving and signing out; saved scores and unlocks do not reset.
- **UC-16-AC2:** Offline edits are not described as synced until they are confirmed saved, and conflicting work is not silently overwritten.
- **UC-16-AC3:** Unconfirmed evaluations produce no assumed score or completion; restored results do not validate a different draft.

**Source:** Product → Resume learning, Final submission; interruption and service-failure edge cases.

### UC-17: Resolve conflicting drafts

**Primary actor:** Learner. **Trigger:** Different tabs or devices have competing code or answer drafts.  
**Preconditions:** More than one conflicting draft exists for the learner's same activity.

**Main flow**

1. Notify the learner that the drafts conflict and preserve both versions.
2. Present enough of each draft to let the learner choose which to keep as current.
3. Make the chosen draft current and clearly report the resolution.
4. Apply the normal validation or submission requirements to the chosen work.

**Alternatives and failures:** If the learner postpones the choice, preserve both drafts and keep the conflict visible. Existing submitted attempts, best scores, completion, and unlocks remain intact regardless of the chosen draft.

**Successful outcome:** One current draft is chosen without silent loss or mismatched results.

**Acceptance criteria**

- **UC-17-AC1:** Neither conflicting draft is silently discarded before a choice is made.
- **UC-17-AC2:** Choosing unvalidated code does not inherit a passing result from a different code version.
- **UC-17-AC3:** Resolving answer selections changes only the current draft, not an earlier submitted answer record.

**Source:** Product → Conflicting drafts edge case; current-work evaluation rules.

### UC-18: View performance statistics

**Primary actor:** Learner. **Trigger:** Open the profile's performance view or dashboard statistics.  
**Preconditions:** Signed in.

**Main flow**

1. Show completed topics, solved coding problems, multiple-choice results, best finalized topic scores, and the next learning step.
2. Distinguish current attempt outcomes from historical best scores when they differ.
3. Count coding completion after a passing topic submission and multiple-choice completion only after UC-14.

**Alternatives and failures:** With no history, explain that no practice has been recorded and offer the first onboarding action. Do not imply that lack of history is a failing assessment. Retain solved and completed achievements after later lower retries.

**Successful outcome:** Statistics accurately reflect the learner's different kinds of assessment and progress.

**Acceptance criteria**

- **UC-18-AC1:** Solved-problem counts require an all-tests-passed batch result and exclude individual runs and multiple-choice questions.
- **UC-18-AC2:** A passed-but-unmarked multiple-choice topic is not counted as completed.
- **UC-18-AC3:** A current 40% retry does not replace a retained 80% best in historical statistics.

**Source:** Product → Learner statistics, Progress after retry; new-learner edge case.

### UC-19: Edit username and bio

**Primary actor:** Learner. **Trigger:** Edit profile text.  
**Preconditions:** Signed in to the learner's account.

**Main flow**

1. Show the current username and bio.
2. Let the learner edit the chosen fields and confirm the changes.
3. Save accepted changes and display the updated profile.

**Alternatives and failures:** Cancellation preserves previous values. If saving fails or input cannot be accepted, explain the issue and keep the edit available for correction or retry; do not falsely report success. Customization is optional and does not gate learning.

**Successful outcome:** The learner's accepted profile text is updated without changing account identity or progress.

**Acceptance criteria**

- **UC-19-AC1:** Saved username and bio changes appear when the profile is reopened.
- **UC-19-AC2:** Skipping customization does not block activities or progression.
- **UC-19-AC3:** Editing profile text changes neither Google identity nor recorded learning results.

**Source:** Product → Manage profile, Profile changes; MVP profile customization.

### UC-20: Add or update a profile photo

**Primary actor:** Learner. **Trigger:** Choose a new profile photo.  
**Preconditions:** Signed in to the learner's account.

**Main flow**

1. Open profile photo customization and select an image.
2. Confirm the choice and save the accepted photo.
3. Show the resulting profile image.

**Alternatives and failures:** Cancellation, an unreadable or unsupported image, or a failed save preserves the prior photo and explains what the learner can do next. Do not require a photo to use learning activities.

**Successful outcome:** The selected accepted photo becomes the learner's profile photo.

**Acceptance criteria**

- **UC-20-AC1:** A successfully saved photo appears on the learner's reopened profile.
- **UC-20-AC2:** A failed or cancelled change does not erase the prior photo or alter learning progress.

**Source:** Product → Profile changes; MVP profile customization.

### UC-21: Change and verify a contact email

**Primary actor:** Learner. **Trigger:** Add or change the contact email in the profile.  
**Preconditions:** Signed in; Google remains the sign-in method.

**Main flow**

1. Enter a replacement contact email and request verification.
2. Keep the replacement pending and retain the currently verified email, if any.
3. Let the learner complete verification of the new address.
4. Activate the replacement only after successful verification and show confirmation.

**Alternatives and failures:** Expired or unsuccessful verification, an address already in use, or an interrupted request does not replace the existing verified address. Explain the issue and allow retry or another address. Cancellation leaves the active contact unchanged.

**Successful outcome:** The profile has the verified replacement contact email; the Google sign-in identity is unchanged.

**Acceptance criteria**

- **UC-21-AC1:** An unverified replacement never displaces the currently verified contact email.
- **UC-21-AC2:** Verification failures preserve account access and provide a recovery action.
- **UC-21-AC3:** Neither changing nor verifying a contact email enables email/password sign-in or links another Google account.

**Source:** Product → Profile changes; verification and Google identity rules.

### UC-22: Bind or change and verify a mobile number

**Primary actor:** Learner. **Trigger:** Add or change a mobile number in the profile.  
**Preconditions:** Signed in; mobile binding is optional.

**Main flow**

1. Enter the proposed mobile number and request verification.
2. Keep it pending; retain any existing verified number.
3. Let the learner verify the proposed number.
4. Activate it only after successful verification and show the updated contact status.

**Alternatives and failures:** An expired verification, a number already in use, or unsuccessful verification preserves the existing contact and permits retry or a different number. If none existed, the account remains unbound rather than treating the pending number as verified.

**Successful outcome:** A verified mobile number is bound without changing Google account access.

**Acceptance criteria**

- **UC-22-AC1:** A new or replacement number becomes active only after verification.
- **UC-22-AC2:** Failed replacement verification preserves the prior verified number and all learning access.
- **UC-22-AC3:** Binding a number is optional and does not enable mobile-based sign-in or recovery in the MVP.

**Source:** Product → Profile changes; verification and account-recovery edge cases.

### UC-23: Prepare the launch curriculum

**Primary actor:** Content maintainer. **Trigger:** Prepare the product's initial content for release.  
**Preconditions:** The product's MVP roadmap and assessment rules are available. This is an operational case, not a requirement for an authoring interface.

**Main flow**

1. Prepare the exact ordered categories and topics listed in the product specification, with lessons and prerequisites.
2. For coding topics, prepare problem instructions, starter code, visible or hidden tests, expected output, and test counts reflecting intended scoring weight.
3. For every topic without coding, prepare exactly one ten-question activity with answer choices and one correct answer per question.
4. Include the two multiple-choice onboarding topics, the one-test Hello World exercise, and the multiple-choice activities for Identifiers, Unit, and Nothing.
5. Review content against Cangjie LTS 1.0.5, console-only execution, exact output matching, scoring, and the complete progression path.
6. Make the reviewed content available to learner workflows.

**Alternatives and failures:** Incorrect answers, missing tests, an activity with other than ten questions, or a broken prerequisite path require correction before that content is considered ready. Categories do not acquire separate assessments or scores.

**Successful outcome:** The bounded curriculum supports completion of the advertised beginner path.

**Acceptance criteria**

- **UC-23-AC1:** The published topic inventory and order match the MVP roadmap, with Unit and Nothing having no coding exercises.
- **UC-23-AC2:** Every multiple-choice activity has ten single-answer questions worth 100 total points; Hello World has one ten-point test.
- **UC-23-AC3:** The path can progress from initial onboarding to its final topic using only the specified completion rules.
- **UC-23-AC4:** This operation does not introduce learner-facing or maintainer-facing topic creation/deletion screens into MVP scope.

**Source:** Product → Content maintainer actor, Supported language, Activity types; complete MVP roadmap; authoring non-goal.

### UC-24: Correct published assessment content

**Primary actor:** Content maintainer. **Trigger:** Discover an error in a lesson, coding problem, test, or multiple-choice question.  
**Preconditions:** Published content exists; learners may already have recorded results. This is an operational case without an MVP authoring-interface requirement.

**Main flow**

1. Identify the affected content and whether the correction changes wording only or could affect assessment scoring.
2. Prepare and review the correction while preserving activity size and scoring rules.
3. Apply the corrected content to future evaluations.
4. For score-affecting corrections, notify affected learners and permit a voluntary retry through UC-15.
5. Preserve existing recorded best scores, solved achievements, completion, and unlocks.

**Alternatives and failures:** A wording-only correction does not change results or require a retry. If a voluntary attempt under the corrected content scores lower, retain the historical best; if it scores higher, retain the higher finalized score. A service failure on retry does not become a learner failure.

**Successful outcome:** Future evaluations use corrected content without retroactively taking earned progress away.

**Acceptance criteria**

- **UC-24-AC1:** Correcting an expected output or correct answer affects future evaluations and informs affected learners.
- **UC-24-AC2:** No correction requires a learner retry or reduces recorded best scores, solved status, completion, or unlocks.
- **UC-24-AC3:** A corrected multiple-choice activity still has exactly ten questions and a maximum score of 100.

**Source:** Product → Content maintainer actor; content-correction edge case; Progress after retry.

## Product coverage map

The section names below refer to [product.md](product.md). A rule may be implemented within several use cases; it does not require a separate feature or screen.

| Product requirement | Responsible use cases |
| --- | --- |
| Google registration, returning sign-in, sign-out, and recovery guidance | UC-01, UC-02, UC-03 |
| Ordered roadmap, unlocked selection, onboarding, and direct-link enforcement | UC-04, UC-05, UC-11, UC-14, UC-23 |
| Optional reading after onboarding; scored non-coding topics | UC-05, UC-12, UC-13, UC-14 |
| Cangjie LTS 1.0.5 and console-only exercises | UC-07, UC-23 |
| Coding problem navigation and visible/hidden test details | UC-06, UC-08, UC-09, UC-10 |
| Ten points per test, individual runs without points, and problem scoring | UC-08, UC-09 |
| Attempted versus unattempted work and incomplete-submission confirmation | UC-06, UC-07, UC-08, UC-09, UC-11, UC-13 |
| Current-code evaluation, 60% topic threshold, and intentional test-count weighting | UC-09, UC-11 |
| Ten-question activities, answer scoring, and explicit completion | UC-12, UC-13, UC-14, UC-23 |
| Validation cooldown, overlapping actions, and duplicate prevention | UC-08, UC-09, UC-11, UC-13, UC-14 |
| Best-score retention, current versus historical results, and permanent unlocks | UC-11, UC-13, UC-14, UC-15, UC-18 |
| Exact output matching, permitted diagnostics, and accessible difference feedback | UC-09, UC-10, UC-23 |
| Evaluation service failures and interrupted evaluations | UC-08, UC-09, UC-11, UC-13, UC-16 |
| Saved code, saved answers, resume location, sign-out, and offline work | UC-02, UC-07, UC-12, UC-16 |
| Competing drafts across tabs or devices | UC-17 |
| Completed topics, solved problems, multiple-choice results, and empty statistics | UC-04, UC-18 |
| Optional username, bio, and profile photo customization | UC-19, UC-20 |
| Contact verification, expired or conflicting contacts, and separate Google identity | UC-21, UC-22 |
| Curriculum preparation and score-preserving content corrections | UC-23, UC-24 |
| Deferred account linking and alternative providers | UC-01, UC-03, UC-21, UC-22; excluded by MVP scope |

## Referring to use cases during implementation

An instruction such as **Implement UC-09** refers to that case's complete main flow, applicable exceptions, acceptance criteria, and shared rules. Linked related operations must be respected; a use-case ID does not imply those operations are already implemented or authorize unrelated scope.

Examples:

- **Implement UC-07:** Edit and preserve code drafts, including changed-since-validation status and offline/conflict behavior defined by UC-16 and UC-17.
- **Implement UC-09:** Batch validation and its scores, cooldown, visibility rules, failure handling, and solved achievement; not the entire online editor or topic submission flow.
- **Implement UC-11:** Coding-topic submission, current-work evaluation, incomplete-work handling, final scoring, and progression, using UC-09 for required validation.
- **Implement UC-14:** The explicit completion action for passed multiple-choice topics; scoring the answers belongs to UC-13.

Use these references to scope later work. This catalog does not prescribe implementation order, technologies, interfaces, storage, or deployment.
