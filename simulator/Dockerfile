FROM golang:1.26-alpine AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /out/simulator .

FROM alpine:3.20
COPY --from=build /out/simulator /app/simulator
ENTRYPOINT ["/app/simulator"]
CMD ["-seed", "42"]
