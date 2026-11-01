import std.fs.*

main(): Int64 {
    let source = File.readFrom("/input/main.cj")
    if (source.size == 0) {
        return 1
    }
    println("source-read-ok")
    // The compiler copied this source into disposable writable task storage.
    File.writeTo("/work/main.cj", "XYZ".toArray())
    let control = File.readFrom("/work/main.cj")
    if (control.size != 3 || control[0] != 88 || control[1] != 89 || control[2] != 90) {
        return 2
    }
    println("work-source-write-read-ok")
    var denied = false
    try {
        File.writeTo("/input/main.cj", "XYZ".toArray())
    } catch (e: FSException) {
        denied = true
        println("source-write-denied")
        println(e)
    }
    if (!denied) {
        println("UNEXPECTED-source-write-succeeded")
        return 3
    }
    let after = File.readFrom("/input/main.cj")
    if (source.size != after.size) {
        return 4
    }
    for (i in 0..source.size) {
        if (source[i] != after[i]) {
            return 5
        }
    }
    println("mounted-source-bytes-unchanged")
    return 0
}
