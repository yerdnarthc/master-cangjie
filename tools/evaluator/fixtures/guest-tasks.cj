import std.collection.*

main(): Int64 {
    let jobs = ArrayList<Future<Int64>>()
    for (i in 0..8) {
        let taskId = i
        jobs.add(spawn {
            sleep(20 * Duration.millisecond)
            var sum: Int64 = 0
            for (n in 0..100000) {
                sum += n
            }
            return sum + taskId
        })
    }
    var total: Int64 = 0
    for (job in jobs) {
        total += job.get()
    }
    if (total != 39999600028) {
        return 1
    }
    println("tasks=8 total=${total}")
    return 0
}
