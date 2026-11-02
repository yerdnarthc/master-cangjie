Keep that terminal open and ask the compiler for its version:

```text
cjc -v
```

Look for **1.0.5** in the result. If your terminal cannot find the command, check the SDK path and load the matching setup script again. If you see another version, check which SDK the terminal is using before you continue.

The browser activity works separately from this setup. Its Run and Validate actions use the server evaluator, so changing your local compiler will not change the version used on the website.
