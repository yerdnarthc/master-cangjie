A Cangjie application begins execution at the `main` function. The entry point can return `Int64` (where `0` conventionally denotes success) or `Unit` when no return code is needed:

```cangjie
main(): Int64 {
    println("Program initialized.")
    return 0
}
```

Execution starts with the first statement in `main` and progresses sequentially until the function returns.
