/** Public lesson handouts and curriculum catalog; activity authorization remains in the activity operations. */
export type Category = {
  id: string;
  title: string;
  description: string;
};

export type Lesson = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  introduction: string;
  sections: { id: string; title: string; body: string }[];
  summary: string[];
  sources: { label: string; href: string }[];
  activity: 'quiz' | 'coding';
};

const manual = 'https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/';

export const categories: Category[] = [
  {
    id: 'getting-started-with-cangjie',
    title: 'Getting Started with Cangjie',
    description: 'Learn the essentials, prepare your tools, and run your first program.',
  },
  {
    id: 'basic-concepts',
    title: 'Basic Concepts',
    description: 'Master Cangjie syntax, declarations, control flow expressions, and functions.',
  },
];

export const curriculum: Lesson[] = [
  // 1. Getting Started with Cangjie
  {
    id: 'getting-started-with-cangjie',
    title: 'Getting Started with Cangjie',
    categoryId: 'getting-started-with-cangjie',
    categoryTitle: 'Getting Started with Cangjie',
    introduction: 'Start with a simple question: how does the code you write become a program you can run?',
    activity: 'quiz',
    sections: [
      {
        id: 'meet-cangjie',
        title: 'Meet Cangjie',
        body: 'Cangjie is a general-purpose programming language. You can write step-by-step instructions, build programs around functions, or organize them into objects. These styles are called imperative, functional, and object-oriented programming. For now, start with a small program and learn the rest as you need it.\n\nCangjie checks types when you compile your code. That makes it statically typed. It can also infer some types, so you do not always need to write a type annotation yourself. A successful compilation means the code passed those checks; you still need to run it and check whether it does what you intended.',
      },
      {
        id: 'source-to-output',
        title: 'From source code to output',
        body: 'Your source code is the text you write in a `.cj` file. The compiler, `cjc`, turns that text into an executable: a program your computer can run. Compiling creates the executable. Running it is the next step.\n\nSuppose you want your program to print a greeting. You write the instructions in an editor, compile the file, then run the executable in a terminal. The terminal shows you the output. Keep those three tools in mind: the editor is where you write, the compiler builds the program, and the terminal is where you run it.',
      },
      {
        id: 'your-first-topics',
        title: 'Your first three topics',
        body: 'You have met the main tools. In **Installing the Cangjie Toolchain**, you will prepare them on your computer. Then **Running the First Cangjie Program** walks you through a greeting program, from its source file to the output you can check.\n\nYou can also practice in the MasterCangjie browser editor without installing anything locally. Your code runs on the server using Cangjie 1.0.5. Learning the local steps gives you another place to practice when you want to write programs outside the website.',
      },
    ],
    summary: [
      'Source code is the text you write; an executable is the compiled program you run.',
      'Cangjie checks types during compilation.',
      'An editor, a compiler, and a terminal have different jobs.',
    ],
    sources: [
      { label: 'Official language introduction', href: manual + 'first_understanding/basic.html' },
      { label: 'Official program structure guide', href: manual + 'basic_programming_concepts/program_structure.html' },
    ],
  },
  {
    id: 'installing-the-cangjie-toolchain',
    title: 'Installing the Cangjie Toolchain',
    categoryId: 'getting-started-with-cangjie',
    categoryTitle: 'Getting Started with Cangjie',
    introduction: 'Before you compile a program on your computer, get the tools ready and check that your terminal can find them.',
    activity: 'quiz',
    sections: [
      {
        id: 'choose-sdk',
        title: 'Choose the SDK for your machine',
        body: 'Choose **Cangjie 1.0.5 LTS** to match the version used here. The SDK, or software development kit, contains the tools you need. On the official download page, select the package for your operating system and processor architecture. Follow its installation guide for any required system dependencies.\n\nThe toolchain includes the compiler and other development tools. You can add an editor extension later if you want help while writing code. The extension alone does not install the SDK.',
      },
      {
        id: 'prepare-terminal',
        title: 'Prepare your terminal',
        body: 'On Windows, you can use the executable installer or extract the ZIP. If you use the ZIP, load the setup script for your shell, the program that reads your terminal commands. Here is the PowerShell command; replace the sample path with the location of your extracted SDK:\n\n```powershell\n. C:/tools/cangjie/envsetup.ps1\n```\n\nOn Linux or macOS, extract the matching archive. Then load its environment in your shell, using the path where you extracted it:\n\n```bash\nsource /path/to/cangjie/envsetup.sh\n```\n\nThis setup applies to the terminal you have open. If you open a new one, run the setup script there too, unless you have configured your shell to load it automatically.',
      },
      {
        id: 'verify-compiler',
        title: 'Verify the compiler',
        body: 'Keep that terminal open and ask the compiler for its version:\n\n```text\ncjc -v\n```\n\nLook for **1.0.5** in the result. If your terminal cannot find the command, check the SDK path and load the matching setup script again. If you see another version, check which SDK the terminal is using before you continue.\n\nThe browser activity works separately from this setup. Its Run and Validate actions use the server evaluator, so changing your local compiler will not change the version used on the website.',
      },
    ],
    summary: [
      'Match the SDK to your operating system and architecture.',
      'Load the environment for the shell you actually use.',
      'Verify version 1.0.5 in the same terminal before compiling.',
    ],
    sources: [
      { label: 'Official Cangjie 1.0.5 downloads and installation guides', href: 'https://cangjie-lang.cn/download/1.0.5' },
      { label: 'Official toolchain installation overview', href: manual + 'first_understanding/install_Community.html' },
    ],
  },
  {
    id: 'running-the-first-cangjie-program',
    title: 'Running the First Cangjie Program',
    categoryId: 'getting-started-with-cangjie',
    categoryTitle: 'Getting Started with Cangjie',
    introduction: "Let's make the steps concrete: read a greeting program, run it, and check exactly what it prints.",
    activity: 'coding',
    sections: [
      {
        id: 'read-program',
        title: 'Read the program',
        body: 'Create a file named `hello.cj` and save this example in it:\n\n```cangjie\nmain(): Int64 {\n    println("Hello, World!")\n    return 0\n}\n```\n\nStart at `main`: this is the entry point, where your program begins. The braces enclose its body. Inside, `println` prints the quoted message and adds a newline. The integer `0` returned by this example indicates successful completion. Comments beginning with `//` are notes for readers; they do not print anything.',
      },
      {
        id: 'compile-run',
        title: 'Compile, then run',
        body: 'Open a terminal with the toolchain environment loaded, and go to the directory containing your source file. On Linux or macOS, compile the file and then run the executable:\n\n```bash\ncjc hello.cj -o hello\n./hello\n```\n\nIn Windows PowerShell, use these commands instead:\n\n```powershell\ncjc hello.cj -o hello.exe\n.\\hello.exe\n```\n\nThe name after `-o` is the executable you are creating. If compilation fails, read the diagnostic, the message explaining what went wrong. Fix the source and compile again before trying to run it.',
      },
      {
        id: 'practice-output',
        title: 'Check the output',
        body: 'What should appear when you run this program? Expect `Hello, World!` followed by one newline. Compare it carefully: the activity checks capitalization, punctuation, spaces, and line endings exactly.\n\nWhen you open the browser activity, use **Run test** to check your output without earning points. **Validate** evaluates the whole problem. When you are ready to submit, choose **Review submission** and confirm the topic submission. Only a passing finalized submission completes this coding topic. Reading the handout or validating code alone does not complete it.',
      },
    ],
    summary: [
      'Execution begins at main; println adds a newline.',
      'Compilation and execution are separate steps.',
      'Use the activity to run, validate, review, and submit your program.',
    ],
    sources: [
      { label: 'Official first-program guide', href: manual + 'first_understanding/hello_world.html' },
      { label: 'Official program entry and structure', href: manual + 'basic_programming_concepts/program_structure.html' },
    ],
  },

  // 2. Basic Concepts
  {
    id: 'identifiers',
    title: 'Identifiers',
    categoryId: 'basic-concepts',
    categoryTitle: 'Basic Concepts',
    introduction: 'Names bring clarity and structure to code. Learn how Cangjie identifies variables, functions, and types—and the rules that keep your code clean and valid.',
    activity: 'quiz',
    sections: [
      {
        id: 'naming-elements',
        title: 'Naming elements in Cangjie',
        body: 'In Cangjie, you give names to variables, functions, types, and packages. These names are called identifiers. An identifier connects a clear, human-readable name to a value, variable, or definition in your program.\n\nGood identifiers tell you at a glance what a value represents. For example, `totalScore` or `calculateTax` immediately communicates purpose, whereas cryptic names like `x1` or `temp2` create confusion as programs grow.',
      },
      {
        id: 'syntax-rules',
        title: 'Starting characters and character sets',
        body: 'Cangjie enforces clear rules on what can form an identifier:\n\n- **Starting character:** An identifier must begin with a letter (ASCII or Unicode) or an underscore (`_`). It can never begin with a numeric digit. For example, `_count` and `player1` are valid, but `1player` is rejected by the compiler.\n- **Subsequent characters:** After the initial letter or underscore, you may use letters, digits, and underscores.\n- **Forbidden symbols:** Punctuation marks (like `-`, `@`, `$`, `#`) and whitespace cannot appear in an identifier.\n- **Case sensitivity:** Cangjie is strictly case-sensitive. `userScore`, `UserScore`, and `USERSCORE` are three completely different identifiers.',
      },
      {
        id: 'keywords-and-raw',
        title: 'Reserved keywords and raw identifiers',
        body: 'Cangjie reserves specific keywords for language syntax, such as `let`, `var`, `func`, `class`, and `struct`. You cannot use these words as regular identifiers.\n\nHowever, if you ever need to use a keyword as an identifier—for example, when interfacing with external data or foreign APIs with a field named `var`—Cangjie provides **raw identifiers**. You create a raw identifier by enclosing the keyword in backticks, such as `` `var` `` or `` `class` ``. This tells the compiler to treat the token strictly as a name rather than as a keyword.',
      },
      {
        id: 'wildcard-and-conventions',
        title: 'The wildcard identifier and naming conventions',
        body: 'A standalone single underscore `_` is a special wildcard identifier. It acts as a discard placeholder when you intentionally want to ignore an unused parameter, return value, or pattern match. Because it represents a discarded value, you cannot read from `_` like an ordinary variable.\n\nTo keep Cangjie code consistent and readable, follow standard naming conventions:\n\n- **Types (classes, structs, enums, interfaces):** Use `UpperCamelCase` (PascalCase), such as `StudentRecord` or `Point2D`.\n- **Variables, functions, and parameters:** Use `lowerCamelCase`, such as `itemCount` or `printReceipt()`.\n- **Constants:** Use `UPPER_SNAKE_CASE` or `UpperCamelCase`, such as `MAX_RETRY_COUNT`.\n- **Packages:** Use lowercase words without underscores.',
      },
    ],
    summary: [
      'Identifiers must begin with a letter or underscore, never a digit.',
      'Cangjie is strictly case-sensitive.',
      'Use backticks (`let`) for raw identifiers when you must use a keyword as a name.',
      'Follow standard conventions: UpperCamelCase for types, lowerCamelCase for variables and functions.',
    ],
    sources: [
      { label: 'Official Cangjie program structure guide', href: manual + 'basic_programming_concepts/program_structure.html' },
    ],
  },
  {
    id: 'program-structure',
    title: 'Program Structure',
    categoryId: 'basic-concepts',
    categoryTitle: 'Basic Concepts',
    introduction: 'Every program needs an entry point and an organized way to handle data. Learn how Cangjie manages the main entry point, mutable vs. immutable bindings, and scope boundaries.',
    activity: 'coding',
    sections: [
      {
        id: 'entry-point',
        title: 'The main entry point',
        body: 'A Cangjie application begins execution at the `main` function. The entry point can return `Int64` (where `0` conventionally denotes success) or `Unit` when no return code is needed:\n\n```cangjie\nmain(): Int64 {\n    println("Program initialized.")\n    return 0\n}\n```\n\nExecution starts with the first statement in `main` and progresses sequentially until the function returns.',
      },
      {
        id: 'bindings-and-mutability',
        title: 'Immutable and mutable bindings',
        body: 'Cangjie distinguishes between values that remain constant and variables that change:\n\n- **`let` (Immutable binding):** Binds a name to a value that cannot be reassigned later. Trying to reassign a `let` binding causes a compile-time error.\n- **`var` (Mutable binding):** Binds a variable whose value can be updated using the assignment operator `=`: \n\n```cangjie\nlet platform = "MasterCangjie" // cannot be reassigned\nvar status = "In Progress"\nstatus = "Completed"          // valid reassignment\n```\n\nPrefer `let` by default; use `var` only when a value genuinely needs to change during execution.',
      },
      {
        id: 'scopes-and-shadowing',
        title: 'Block scopes and shadowing',
        body: 'Curly braces `{ ... }` define a block scope. Identifiers declared inside a block exist only within that block and are destroyed when execution leaves it.\n\nAn inner scope can declare an identifier with the same name as an outer identifier. This is known as **shadowing**. Within the inner block, the inner identifier takes precedence without modifying or destroying the outer binding.',
      },
    ],
    summary: [
      'Execution begins at main, returning Int64 or Unit.',
      'Use let for immutable values and var for mutable variables.',
      'Curly braces create block scopes; inner scopes can shadow outer identifiers.',
    ],
    sources: [
      { label: 'Official program structure and bindings', href: manual + 'basic_programming_concepts/program_structure.html' },
    ],
  },
  {
    id: 'expressions',
    title: 'Expressions',
    categoryId: 'basic-concepts',
    categoryTitle: 'Basic Concepts',
    introduction: 'In Cangjie, constructs compute values and control program flow. Explore conditional branches, loops, and how block expressions evaluate.',
    activity: 'coding',
    sections: [
      {
        id: 'if-expressions',
        title: 'Conditionals as expressions',
        body: 'In Cangjie, `if-else` is an expression that yields a value, not merely a statement. Both branches must produce compatible types:\n\n```cangjie\nlet score = 85\nlet result = if (score >= 60) { "Pass" } else { "Retry" }\n```\n\nThis functional style eliminates the need for uninitialized mutable variables before conditional checks.',
      },
      {
        id: 'loops',
        title: 'Loops: while and for-in',
        body: 'Cangjie provides loops for repeating actions:\n\n- **`while` loop:** Executes its block as long as a boolean condition evaluates to `true`.\n- **`for-in` loop:** Iterates sequentially through intervals or collections.\n\n```cangjie\nvar counter = 3\nwhile (counter > 0) {\n    println(counter)\n    counter = counter - 1\n}\n```',
      },
      {
        id: 'flow-control',
        title: 'Break and continue',
        body: 'You can control loop execution with jump keywords:\n\n- **`break`:** Terminates the enclosing loop immediately.\n- **`continue`:** Skips the remainder of the current iteration and jumps directly to the next loop cycle.',
      },
    ],
    summary: [
      'if-else in Cangjie is an expression that evaluates to a value.',
      'while and for-in loops repeat code over conditions or ranges.',
      'Use break to exit loops early and continue to advance to the next cycle.',
    ],
    sources: [
      { label: 'Official expressions documentation', href: manual + 'basic_programming_concepts/expressions.html' },
    ],
  },
  {
    id: 'functions',
    title: 'Functions',
    categoryId: 'basic-concepts',
    categoryTitle: 'Basic Concepts',
    introduction: 'Package reusable logic into functions with parameters, return types, and expressive calls.',
    activity: 'coding',
    sections: [
      {
        id: 'declaring-functions',
        title: 'Declaring functions with func',
        body: 'Define functions using the `func` keyword, followed by the function name, parentheses enclosing parameter declarations, and the return type preceded by a colon:\n\n```cangjie\nfunc calculateTotal(subtotal: Int64, tax: Int64): Int64 {\n    return subtotal + tax\n}\n```',
      },
      {
        id: 'parameters-and-returns',
        title: 'Parameters and return values',
        body: 'Parameters are strongly typed and act as immutable bindings inside the function body. Return values are produced using the `return` keyword, or the value of the final expression in the function body.',
      },
      {
        id: 'unit-functions',
        title: 'Functions without return values (Unit)',
        body: 'When a function performs an effect (like printing output to a terminal or logging data) without returning a value, its return type is `Unit`. You can specify `: Unit` explicitly or omit it:\n\n```cangjie\nfunc notify(message: String): Unit {\n    println(message)\n}\n```',
      },
    ],
    summary: [
      'Declare functions using func name(params): ReturnType { ... }.',
      'Parameters are immutable within the function body.',
      'Functions producing no meaningful value return Unit.',
    ],
    sources: [
      { label: 'Official functions documentation', href: manual + 'basic_programming_concepts/functions.html' },
    ],
  },
];

export const onboarding = curriculum.filter((topic) => topic.categoryId === 'getting-started-with-cangjie');
export const lessonFor = (id: string) => curriculum.find((topic) => topic.id === id);
export const lessonsForCategory = (categoryId: string) => curriculum.filter((topic) => topic.categoryId === categoryId);
