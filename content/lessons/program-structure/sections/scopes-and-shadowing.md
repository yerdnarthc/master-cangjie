Curly braces `{ ... }` define a block scope. Identifiers declared inside a block exist only within that block and are destroyed when execution leaves it.

An inner scope can declare an identifier with the same name as an outer identifier. This is known as **shadowing**. Within the inner block, the inner identifier takes precedence without modifying or destroying the outer binding.
