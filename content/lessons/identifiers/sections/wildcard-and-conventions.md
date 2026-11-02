A standalone single underscore `_` is a special wildcard identifier. It acts as a discard placeholder when you intentionally want to ignore an unused parameter, return value, or pattern match. Because it represents a discarded value, you cannot read from `_` like an ordinary variable.

To keep Cangjie code consistent and readable, follow standard naming conventions:

- **Types (classes, structs, enums, interfaces):** Use `UpperCamelCase` (PascalCase), such as `StudentRecord` or `Point2D`.
- **Variables, functions, and parameters:** Use `lowerCamelCase`, such as `itemCount` or `printReceipt()`.
- **Constants:** Use `UPPER_SNAKE_CASE` or `UpperCamelCase`, such as `MAX_RETRY_COUNT`.
- **Packages:** Use lowercase words without underscores.
