/* Trusted, bounded anonymous-memory probe, compiled without optimizations. */
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char **argv) {
    int count = argc == 2 ? atoi(argv[1]) : 0;
    if (count < 1 || count > 768) return 2;
    volatile unsigned char *blocks[768];
    puts("allocation-started");
    fflush(stdout);
    for (int i = 0; i < count; ++i) {
        blocks[i] = malloc(1024 * 1024);
        if (!blocks[i]) {
            fprintf(stderr, "allocation-refused-after-mib=%d\n", i);
            return 42;
        }
        for (int j = 0; j < 1024 * 1024; j += 4096) blocks[i][j] = 1;
        blocks[i][1024 * 1024 - 1] = 1;
    }
    printf("allocation-completed-mib=%d\n", count);
    for (int i = 0; i < count; ++i) free((void *)blocks[i]);
    return 0;
}
