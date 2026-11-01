import std.fs.*

main(): Int64 {
    try {
        File.writeTo("/var/tmp/mcj-readonly-probe.txt", "probe".toArray())
    } catch (e: FSException) {
        println("readonly-write-denied")
        println(e)
        return 0
    }
    println("UNEXPECTED-write-succeeded")
    return 1
}
