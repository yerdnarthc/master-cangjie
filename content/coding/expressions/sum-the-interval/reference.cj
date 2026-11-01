import std.console.*
import std.convert.*

main(): Int64 {
    let n = Int64.parse(Console.stdIn.readln() ?? "")
    var total: Int64 = 0
    for (i in 1..=n) {
        total += i
    }
    println(total)
    return 0
}
