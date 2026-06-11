# Build
FROM rust:1.85-slim AS builder
WORKDIR /build
COPY Cargo.toml ./
COPY api/Cargo.toml api/Cargo.toml
COPY migrate/Cargo.toml migrate/Cargo.toml
# Pre-build dependencies against stub sources so they cache across code changes.
RUN mkdir -p api/src migrate/src \
    && echo 'fn main() {}' > api/src/main.rs \
    && touch api/src/lib.rs \
    && echo 'fn main() {}' > migrate/src/main.rs \
    && cargo build --release --locked || cargo build --release
COPY . .
RUN touch api/src/main.rs api/src/lib.rs migrate/src/main.rs \
    && cargo build --release

# Run — rustls everywhere, so no libpq/openssl needed.
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/target/release/enconjunto-api /usr/local/bin/enconjunto-api
COPY --from=builder /build/target/release/enconjunto-migrate /usr/local/bin/enconjunto-migrate
ENV PORT=8080
EXPOSE 8080
USER nobody
CMD ["enconjunto-api"]
