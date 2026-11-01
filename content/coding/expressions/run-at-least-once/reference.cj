import std.console.*
import std.convert.*

main(): Int64 {
    let n = Int64.parse(Console.stdIn.readln() ?? "")
    var current = n
    do {
        println(current)
        current -= 1
    } while (current > 0)
    return 0
}
