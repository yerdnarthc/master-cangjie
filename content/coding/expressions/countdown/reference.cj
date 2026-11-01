import std.console.*
import std.convert.*

main(): Int64 {
    let n = Int64.parse(Console.stdIn.readln() ?? "")
    var remaining = n
    while (remaining > 0) {
        println(remaining)
        remaining -= 1
    }
    println("Done")
    return 0
}
