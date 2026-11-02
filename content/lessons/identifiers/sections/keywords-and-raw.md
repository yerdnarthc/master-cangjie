Cangjie reserves specific keywords for language syntax, such as `let`, `var`, `func`, `class`, and `struct`. You cannot use these words as regular identifiers.

However, if you ever need to use a keyword as an identifier—for example, when interfacing with external data or foreign APIs with a field named `var`—Cangjie provides **raw identifiers**. You create a raw identifier by enclosing the keyword in backticks, such as `` `var` `` or `` `class` ``. This tells the compiler to treat the token strictly as a name rather than as a keyword.
