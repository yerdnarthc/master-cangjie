Cangjie enforces clear rules on what can form an identifier:

- **Starting character:** An identifier must begin with a letter (ASCII or Unicode) or an underscore (`_`). It can never begin with a numeric digit. For example, `_count` and `player1` are valid, but `1player` is rejected by the compiler.
- **Subsequent characters:** After the initial letter or underscore, you may use letters, digits, and underscores.
- **Forbidden symbols:** Punctuation marks (like `-`, `@`, `$`, `#`) and whitespace cannot appear in an identifier.
- **Case sensitivity:** Cangjie is strictly case-sensitive. `userScore`, `UserScore`, and `USERSCORE` are three completely different identifiers.
