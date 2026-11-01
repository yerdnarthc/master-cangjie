import std.fs.*

main(): Int64 {
    for (path in ["/work/mcj-write-probe.txt", "/tmp/mcj-write-probe.txt"]) {
        File.writeTo(path, "XYZ".toArray())
        let data = File.readFrom(path)
        if (data.size != 3 || data[0] != 88 || data[1] != 89 || data[2] != 90) {
            return 1
        }
        println("write-read-ok: ${path}")
    }
    return 0
}
