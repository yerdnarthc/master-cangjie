import std.console.*
import std.convert.*

func pouchCount(crew: Int64): Int64 {
    return crew * 2
}

main(): Int64 {
    let n = Int64.parse(Console.stdIn.readln() ?? "")
    println(pouchCount(n))
    return 0
}
