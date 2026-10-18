# Scala se compila y corre con sbt dentro de la imagen (igual que "sbt run" en tu computadora).
FROM eclipse-temurin:21-jdk

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ARG SBT_VERSION=2.0.9
RUN curl -fsSL https://github.com/sbt/sbt/releases/download/v${SBT_VERSION}/sbt-${SBT_VERSION}.tgz | tar xz -C /opt
ENV PATH="/opt/sbt/bin:${PATH}"

WORKDIR /app

# Primero solo la definición del proyecto: así Docker guarda las dependencias en caché.
COPY project/ project/
COPY build.sbt .
RUN sbt update

# Luego el código fuente, y se compila una vez al construir la imagen.
COPY src/ src/
RUN sbt compile

EXPOSE 8081
CMD ["sbt", "run"]
