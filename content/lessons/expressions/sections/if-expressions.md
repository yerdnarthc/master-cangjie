In Cangjie, `if-else` is an expression that yields a value, not merely a statement. Both branches must produce compatible types:

```cangjie
let score = 85
let result = if (score >= 60) { "Pass" } else { "Retry" }
```

This functional style eliminates the need for uninitialized mutable variables before conditional checks.
