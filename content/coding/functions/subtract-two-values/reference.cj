import std.console.*
import std.convert.*

func difference(first: Int64, second: Int64): Int64 {
    return first - second
}

main(): Int64 {
    let a = Int64.parse(Console.stdIn.readln() ?? "")
    let b = Int64.parse(Console.stdIn.readln() ?? "")
    println(difference(a, b))
    return 0
}
