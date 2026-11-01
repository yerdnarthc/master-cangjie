import std.console.*
import std.convert.*

main(): Int64 {
    let n = Int64.parse(Console.stdIn.readln() ?? "")
    if (n < 60) {
        println("Foundation")
    } else if (n < 80) {
        println("Developing")
    } else {
        println("Ready")
    }
    return 0
}
