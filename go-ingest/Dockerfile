# Etapa 1: compilar
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go-ingest/ ./
RUN CGO_ENABLED=0 go build -o /out/ingest .

# Etapa 2: imagen final, pequeña
FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/ingest /app/ingest
COPY games /games
ENV GAMES_DIR=/games
EXPOSE 8080
CMD ["/app/ingest"]
