"""Local Docker names; use the same environment for every harness invocation."""
import os

IMAGE = os.environ.get('MCJ_EVALUATOR_IMAGE', 'master-cangjie-evaluator:1.0.5-prototype')
RUNTIME = os.environ.get('MCJ_EVALUATOR_RUNTIME', 'runsc-systrap')
PROCESS_RUNTIME = os.environ.get('MCJ_EVALUATOR_PROCESS_RUNTIME', 'runsc-process-debug')

if not all(value.strip() for value in (IMAGE, RUNTIME, PROCESS_RUNTIME)):
    raise ValueError('Evaluator image/runtime settings must not be empty.')
