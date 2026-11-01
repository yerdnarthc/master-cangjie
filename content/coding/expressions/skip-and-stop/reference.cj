import std.console.*
import std.convert.*

main(): Int64 {
    let n = Int64.parse(Console.stdIn.readln() ?? "")
    for (i in 1..=n) {
        if (i % 7 == 0) {
            break
        }
        if (i % 3 == 0) {
            continue
        }
        println(i)
    }
    println("Done")
    return 0
}
