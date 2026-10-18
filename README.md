# GameStats

Sistema que recibe eventos de partidas de videojuegos (simulados), los agrupa por partida y produce estadísticas y patrones. Proyecto del curso de Lenguajes de Programación.

- **Go** (paradigma imperativo): recibe, valida y agrupa los eventos con goroutines y channels. No calcula estadísticas.
- **Scala** (paradigma funcional): analiza cada partida con transformaciones de colecciones (`filter`, `groupMapReduce`, `foldLeft`, `partition`…), detecta patrones y expone los resultados.
- Los dos son **servicios independientes** que se comunican por **HTTP/REST con JSON**.
- Juegos incluidos: **carreras** (`racing`) y **combate** (`combat`). Agregar un juego no obliga a reescribir el sistema (ver [Cómo agregar un juego](#cómo-agregar-un-juego)).

## Arquitectura

```
┌───────────┐  POST /events   ┌──────────────┐  POST /analyze  ┌──────────────────┐
│ Simulador │ ──────────────▶ │  Go (8080)   │ ──────────────▶ │  Scala (8081)    │
│  (Go)     │   un evento     │ valida,      │  partida        │ estadísticas +   │
│ varias    │   a la vez, en  │ agrupa por   │  completa       │ patrones         │
│ partidas  │   paralelo      │ partida      │  (JSON)         │ GET /matches ... │
└───────────┘                 └──────────────┘                 └──────────────────┘
```

| Componente | Hace | No hace |
|---|---|---|
| Simulador (`simulator/`) | Genera eventos de varias partidas y juegos en paralelo, incluidos casos especiales e inválidos | Validar ni analizar |
| Go (`go-ingest/`) | Recibe, valida, rechaza y registra inválidos, agrupa por partida, y envía la partida terminada a Scala | Calcular estadísticas |
| Scala (`scala-analytics/`) | Lee la partida, calcula estadísticas, detecta patrones, guarda y expone resultados | Recibir el flujo en bruto ni validar la estructura básica |

## Requisitos

- **Para ejecutar el sistema:** solo [Docker Desktop](https://www.docker.com/products/docker-desktop/) (incluye Docker Compose).
- **Para desarrollar sin Docker:** Go 1.26+, JDK 17+ y sbt 2.0.x. Versiones usadas: Go 1.26.5, JDK 25 (21 dentro de Docker), sbt 2.0.9, Scala 3.3.7, Cask 0.11.3.

## Instalación y ejecución (Docker)

Desde la raíz del repositorio:

```powershell
# 1. Construir y arrancar Go y Scala (la primera vez tarda varios minutos)
docker compose up --build

# 2. En OTRA terminal: enviar las partidas simuladas (semilla fija 42)
docker compose run --rm simulator

# 3. Consultar resultados
curl.exe http://localhost:8080/matches                  # estado de las partidas en Go
curl.exe http://localhost:8081/matches                  # resultados en Scala
curl.exe http://localhost:8081/matches/combat-001       # una partida completa

# 4. Apagar
docker compose down
```

En PowerShell se usa `curl.exe` (en Linux/macOS, `curl`). Los resultados también se escriben como archivos JSON en `./output/<matchId>.json`.

Opciones del simulador (se pasan después del nombre del servicio):

```powershell
docker compose run --rm simulator -seed 7 -prefix r2-   # otra simulación, sin chocar con los matchId anteriores
docker compose run --rm simulator -racing 5 -combat 2   # otra cantidad de partidas
```

Los puertos son **8080** (Go) y **8081** (Scala). Dentro de Docker, Go llega a Scala por el nombre del servicio (`http://scala-analytics:8081`), no por `localhost`.

## Ejecución sin Docker (desarrollo)

Tres terminales, en este orden:

```powershell
cd scala-analytics ; sbt run          # 1. Scala (puerto 8081)
cd go-ingest       ; go run .         # 2. Go (puerto 8080); debe decir "Scala responde OK"
cd simulator       ; go run . -seed 42   # 3. Simulador
```

Variables de entorno opcionales: `SCALA_URL` (Go → Scala, por defecto `http://localhost:8081`), `GAMES_DIR` (config de juegos, por defecto `../games`), `OUTPUT_DIR` (resultados de Scala, por defecto `output`), `INGEST_URL` (simulador → Go).

## API

**Go (8080)**

| Método y ruta | Descripción |
|---|---|
| `POST /events` | Recibe un evento. `202` si es válido; `400` con `{"error": "..."}` si no (y queda registrado) |
| `GET /invalid` | Lista de eventos rechazados con su motivo |
| `GET /matches` | Partidas con estado (`ACTIVE`, `SENT`, `FAILED`), cantidad de eventos y jugadores |
| `GET /health` | `{"status":"ok"}` |

**Scala (8081)**

| Método y ruta | Descripción |
|---|---|
| `POST /analyze` | Recibe una partida completa desde Go (no se usa a mano) |
| `GET /matches` | Resumen de todas las partidas analizadas |
| `GET /matches/{matchId}` | Resultado completo de una partida; `404` si no existe |
| `GET /players/{gameId}/{playerId}` | Estadísticas acumuladas del jugador en todas sus partidas; `404` si no hay datos |
| `GET /health` | `{"status":"ok"}` |

## Eventos y estadísticas

El formato completo de los eventos, la justificación de los juegos y las reglas de validación están en [`docs/SPEC.md`](docs/SPEC.md). Un evento de cada tipo está en [`docs/ejemplos/`](docs/ejemplos/).

| Juego | Eventos |
|---|---|
| Ambos | `MATCH_STARTED`, `PLAYER_JOINED`, `MATCH_FINISHED` |
| Carreras | `LAP_COMPLETED`, `POSITION_CHANGED`, `PENALTY_APPLIED` |
| Combate | `DAMAGE_DEALT`, `PLAYER_ELIMINATED` |

**Estadísticas calculadas en Scala**

| | Carreras | Combate |
|---|---|---|
| Por jugador | vueltas, mejor vuelta, vuelta promedio, consistencia (desviación estándar) | eliminaciones, muertes, daño total, daño por golpe |
| Por partida | duración, ganador, total de vueltas, adelantamientos | duración, ganador, total de eliminaciones, jugador con más daño |
| Combinada (varios tipos de evento) | tiempo promedio de vuelta **con** y **sin** penalización | **K/D** y daño por eliminación |
| Patrón de secuencia | **Remontada**: estuvo último y terminó en el podio (solo con 4+ jugadores) | **Racha**: 3+ eliminaciones del mismo jugador en ≤ 10 s |

Criterios de cálculo:
- **Consistencia:** desviación estándar poblacional de los tiempos de vuelta.
- **K/D:** eliminaciones ÷ muertes; si el jugador no murió, se divide entre 1 (nunca entre 0).
- **Adelantamiento:** un `POSITION_CHANGED` en el que el jugador sube de puesto.
- Una estadística sin datos suficientes **se omite** del JSON (no se inventa un 0).
- Cuatro eliminaciones seguidas en la ventana cuentan como **una** racha de 4.

Ejemplo de resultado (`combat-001`, resumido):

```json
{
  "matchId": "combat-001", "gameId": "combat",
  "players": [ { "playerId": "ana", "kills": 7, "deaths": 6, "kd": 1.17, "totalDamage": 750,
                 "avgDamagePerHit": 24.19, "damagePerKill": 107.14 } ],
  "match": { "durationSeconds": 238, "totalKills": 23, "topDamagePlayer": "luis", "winner": "luis" },
  "patterns": [ { "type": "KILL_STREAK", "playerId": "ana", "kills": 3, "windowSeconds": 6,
                  "startedAt": "2026-10-16T10:31:00Z" } ]
}
```

## Qué es imperativo y qué es funcional

**Go (imperativo, estado mutable controlado)**
- Un mapa `matchId → partida` protegido con `sync.Mutex`.
- **Una goroutine por partida activa**, con su propio **channel** de entrada: los eventos de cada partida se procesan por separado.
- Validación paso a paso (`Validate` devuelve en cuanto encuentra un error) y reintentos de envío a Scala (3 intentos; si fallan, la partida queda `FAILED`).
- `go test -race` verifica que no hay condiciones de carrera.

**Scala (funcional, sin `var` ni mutación en el análisis)**
- Case classes inmutables, `Option` en lugar de `null`, `Either` para errores.
- Estadísticas con `filter`, `groupMap`, `groupMapReduce`, `partition`, `flatMap`; patrones con `foldLeft`.
- La lógica de análisis no conoce ni JSON ni HTTP: son funciones puras que se prueban con datos escritos a mano. JSON, memoria y servidor viven en la frontera (`Parser`, `ResultJson`, `Store`, `Main`).

## Cómo agregar un juego

1. **Go:** crear `games/<nuevo>.json` con sus tipos de evento y los campos obligatorios de cada uno (ver `games/racing.json`). **Cero cambios de código en Go.**
2. **Scala:** crear `<Nuevo>Analyzer.scala` con `object <Nuevo>Analyzer extends GameAnalyzer` (implementa `analyze` y `accumulate`) y agregarlo a la lista `Analyzers.all` en `GameAnalyzer.scala`. El parseo, el servidor, el JSON y el almacenamiento no cambian porque todos los juegos devuelven el mismo formato de resultado (`Stats`).
3. Reconstruir: `docker compose up --build` (la config de juegos se copia a la imagen de Go).

Ejemplo de la ventaja: Go acepta eventos de un juego nuevo apenas existe su `.json`; Scala responde `400 juego no soportado` hasta que se agrega su analizador.

## Pruebas

```powershell
cd go-ingest       ; go test -race ./...   # validación, partidas, concurrencia, reintentos (Scala falso)
cd simulator       ; go test ./...         # la racha y la remontada están garantizadas
cd scala-analytics ; sbt test              # 26 tests con resultados calculados a mano
```

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) se ejecuta en cada `push` y `pull request`:
1. Compila y prueba Go (con `-race`) y el simulador.
2. Compila y prueba Scala.
3. Construye las imágenes Docker, levanta Go y Scala con `docker compose`, corre el simulador y comprueba que Scala analizó las 6 partidas, con una racha y una remontada (*smoke test*).

## Deployment

El entorno de despliegue definido por el equipo es **Docker Compose**: un solo comando (`docker compose up --build`) construye y levanta ambos servicios en cualquier máquina con Docker, con red interna, healthchecks, puertos y volumen para los resultados. El pipeline de CI valida ese mismo despliegue en cada cambio.

## Decisiones y límites conocidos

- **Estado en memoria:** Go (partidas) y Scala (resultados) pierden su estado al reiniciar. Los resultados de Scala además quedan en `output/`. Una base de datos queda fuera del alcance.
- **Partidas `FAILED`:** si Scala no responde tras 3 intentos, la partida queda marcada y **no se reenvía sola**.
- **HTTP síncrono entre servicios:** simple y fácil de probar; una cola de mensajes escalaría mejor, pero no se pidió.
- **Scala en Docker corre con `sbt run`**, igual que en desarrollo; un jar empaquetado daría una imagen más pequeña.
- **Remontada:** se mide por la posición al final de cada vuelta (`LAP_COMPLETED`).

## Estructura del repositorio

```
gamestats/
├── README.md
├── CLAUDE.md                  # contexto del proyecto para el asistente
├── docker-compose.yml
├── .github/workflows/ci.yml
├── docs/
│   ├── SPEC.md                # especificación: eventos, validación, estadísticas, API
│   ├── CONCEPTOS.md           # APIs, Go y Scala desde cero
│   ├── TICKETS.md             # plan de trabajo
│   ├── DEMO.md                # guion de la demo y preguntas de defensa
│   └── ejemplos/              # un evento de cada tipo
├── games/                     # configuración de juegos para Go (racing.json, combat.json)
├── go-ingest/                 # servicio Go
├── simulator/                 # simulador de eventos (Go)
├── scala-analytics/           # servicio Scala
└── output/                    # resultados JSON generados (no se versiona)
```
