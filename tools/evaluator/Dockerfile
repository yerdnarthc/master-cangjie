FROM ubuntu:24.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY cangjie/ /opt/cangjie/

RUN chmod -R a+rX /opt/cangjie \
    && useradd --uid 10001 --create-home evaluator

USER 10001:10001
WORKDIR /work
CMD ["/bin/bash"]
