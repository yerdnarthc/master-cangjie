/* A single parent creates at most 320 children. Children never fork. */
#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>
#include <sys/resource.h>
#include <unistd.h>

static int process_count(void) {
    DIR *dir = opendir("/proc");
    if (!dir) return -1;
    int count = 0;
    struct dirent *entry;
    while ((entry = readdir(dir))) {
        const char *s = entry->d_name;
        if (!*s) continue;
        while (isdigit((unsigned char)*s)) ++s;
        if (!*s) ++count;
    }
    closedir(dir);
    return count;
}

int main(int argc, char **argv) {
    int requested = argc == 2 ? atoi(argv[1]) : 0;
    if (requested < 1 || requested > 320) return 2;
    pid_t children[320];
    struct rlimit limit;
    if (getrlimit(RLIMIT_NPROC, &limit) != 0) return 4;
    printf("NPROC_SOFT=%llu\nNPROC_HARD=%llu\n",
           (unsigned long long)limit.rlim_cur, (unsigned long long)limit.rlim_max);
    int baseline = process_count();
    int created = 0, failure = 0, reaped = 0;
    puts("process-probe-started");
    fflush(stdout);
    for (int i = 0; i < requested; ++i) {
        pid_t pid = fork();
        if (pid < 0) { failure = errno; break; }
        if (pid == 0) {
            alarm(10);
            pause();
            _exit(0);
        }
        children[created++] = pid;
        if (created % 16 == 0) fprintf(stderr, "created-so-far=%d\n", created);
        usleep(1000);
    }
    int at_boundary = process_count();
    for (int i = 0; i < created; ++i) kill(children[i], SIGTERM);
    for (int i = 0; i < created; ++i) {
        pid_t result;
        do { result = waitpid(children[i], NULL, 0); } while (result < 0 && errno == EINTR);
        if (result == children[i]) ++reaped;
    }
    printf("BASELINE=%d\nCREATED=%d\nFORK_ERRNO=%d\nEAGAIN_VALUE=%d\nAT_BOUNDARY=%d\nREAPED=%d\n",
           baseline, created, failure, EAGAIN, at_boundary, reaped);
    return reaped == created ? 0 : 3;
}
