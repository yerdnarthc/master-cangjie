Open a terminal with the toolchain environment loaded, and go to the directory containing your source file. On Linux or macOS, compile the file and then run the executable:

```bash
cjc hello.cj -o hello
./hello
```

In Windows PowerShell, use these commands instead:

```powershell
cjc hello.cj -o hello.exe
.\hello.exe
```

The name after `-o` is the executable you are creating. If compilation fails, read the diagnostic, the message explaining what went wrong. Fix the source and compile again before trying to run it.
