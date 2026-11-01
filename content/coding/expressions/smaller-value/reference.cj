import std.console.*
import std.convert.*

main(): Int64 {
    let a = Int64.parse(Console.stdIn.readln() ?? "")
    let b = Int64.parse(Console.stdIn.readln() ?? "")
    let smaller = if (a < b) { a } else { b }
    println(smaller)
    return 0
}
