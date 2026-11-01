import std.fs.*
import std.env.*

main(): Int64 {
    File.writeTo("/tmp/mcj-interrupt-ready", "ready".toArray())
    println("execution-ready")
    getStdOut().flush()
    while (true) {}
    return 0
}
