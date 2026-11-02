Cangjie distinguishes between values that remain constant and variables that change:

- **`let` (Immutable binding):** Binds a name to a value that cannot be reassigned later. Trying to reassign a `let` binding causes a compile-time error.
- **`var` (Mutable binding):** Binds a variable whose value can be updated using the assignment operator `=`:

```cangjie
let platform = "MasterCangjie" // cannot be reassigned
var status = "In Progress"
status = "Completed"          // valid reassignment
```

Prefer `let` by default; use `var` only when a value genuinely needs to change during execution.
