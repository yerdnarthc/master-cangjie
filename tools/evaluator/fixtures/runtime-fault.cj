func readAt(values: Array<Int64>, index: Int64): Int64 {
    return values[index]
}

main(): Int64 {
    let values: Array<Int64> = [10, 20, 30]
    println("before-bounds-check")
    println(readAt(values, 99))
    println("UNEXPECTED-reached-after-bounds-check")
    return 0
}
