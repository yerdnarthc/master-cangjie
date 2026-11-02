When a function performs an effect (like printing output to a terminal or logging data) without returning a value, its return type is `Unit`. You can specify `: Unit` explicitly or omit it:

```cangjie
func notify(message: String): Unit {
    println(message)
}
```
