# CLAUDE.md — Proyecto GameStats (Curso de Lenguajes de Programación)

> Léelo completo al empezar cada sesión. Es el contexto persistente del proyecto.

## 1. Quién es el usuario y cómo trabajar con él
- Estudiante, trabaja **solo**. Idioma: **español**.
- Nivel: **Go mínimo, Scala cero, APIs desde cero**. Explica cada concepto nuevo con un ejemplo corto antes de usarlo. No asumas conocimiento previo.
- Material de apoyo para explicar: `docs/CONCEPTOS.md` (APIs/HTTP/JSON, Go, Scala).
- Trabaja **ticket por ticket** (`docs/TICKETS.md`). No avances a otro ticket sin que el actual cumpla sus criterios de aceptación y el usuario lo haya visto funcionar.
- Prefiere lo **simple y que funcione** sobre lo elegante. Alcance mínimo pero completo. Nada de frameworks o infraestructura extra.
- Un commit por ticket (o más), con mensaje claro. Historial de Git es parte de la nota.
- Cuando escribas código, explica brevemente *qué hace y por qué*, porque el usuario debe poder **defenderlo oralmente** ante el profesor (justificar qué es imperativo/Go y qué es funcional/Scala).

## 2. Qué es el proyecto (resumen del enunciado)
Enunciado original: `docs/enunciado.docx`. Resumen:
- **GameStats** recibe eventos de partidas de videojuegos (simulados) y produce estadísticas.
- **Go**: ingestión. Recibe eventos por HTTP, los valida, los agrupa por partida (estado en memoria), usa **goroutines + channels**, y envía cada partida terminada a Scala. NO calcula estadísticas.
- **Scala**: análisis **funcional** (`filter`, `map`, `groupBy`, `fold`, etc.). Calcula estadísticas y detecta patrones. Devuelve/guarda JSON y permite consultarlo.
- Son **dos servicios independientes** que se comunican por **HTTP/REST con JSON**.
- Se pide: Git con historial, Docker, docker-compose, CI/CD (GitHub Actions: al menos compilar y construir imágenes), documentación, demo.
- Debe ser **genérico**: un juego nuevo no debe obligar a reescribir el sistema.
- **Entrega: domingo 18 de octubre de 2026, antes de las 10:00 pm, por el Tec Digital.** (El enunciado dice "18 de Setiembre"; el usuario confirmó que la fecha vigente es el 18 de octubre.)

## 3. Decisiones ya tomadas (no re-discutir sin motivo)
| Tema | Decisión |
|---|---|
| Juegos | **Carreras (`racing`) y Combate (`combat`)**, simulados en paralelo |
| Entrada a Go | API REST de Go (`POST /events`) + **simulador** aparte que la llama |
| Go → Scala | **HTTP/REST con JSON**. Go envía la partida completa a `POST /analyze` cuando recibe `MATCH_FINISHED` |
| Resultados | Scala los guarda **en memoria** y los expone por `GET`; además los escribe a un archivo JSON |
| Stack Scala | Scala 3 + sbt + **Cask** (servidor HTTP simple) + **upickle** (JSON). Verificar versiones actuales en el ticket T0 |
| Stack Go | Go (última estable), solo librería estándar (`net/http`, `encoding/json`, `sync`) |
| Simulador | Programa Go separado (`simulator/`) |
| Genericidad | Go valida con **archivos de configuración por juego** (`games/*.json`); Scala tiene un módulo de estadísticas por juego |
| Deploy | `docker-compose` local. CI en GitHub Actions construye imágenes y corre un smoke test. **Pendiente (HITL):** confirmar con el profesor si esto cuenta como "deployment" |

## 4. Estructura del repositorio (objetivo)
```
gamestats/
├── CLAUDE.md
├── README.md                  # instalación, ejecución, deployment (entregable)
├── docs/
│   ├── enunciado.docx
│   ├── SPEC.md                # especificación (eventos, stats, reglas, API)
│   ├── CONCEPTOS.md           # APIs, Go y Scala desde cero
│   └── TICKETS.md             # tickets + estado
├── games/                     # config de juegos para Go (racing.json, combat.json)
├── go-ingest/                 # servicio Go (API + validación + estado + concurrencia)
├── simulator/                 # simulador de eventos (Go)
├── scala-analytics/           # servicio Scala (análisis funcional)
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## 5. Contrato (resumen; detalle en `docs/SPEC.md`)
- Evento: `eventId, timestamp, gameId, gameVersion, matchId, playerId (opcional), type, action (opcional), data{}`.
- Go expone: `POST /events`, `GET /health`, `GET /matches`, `GET /invalid`.
- Scala expone: `POST /analyze`, `GET /health`, `GET /matches`, `GET /matches/{matchId}`, `GET /players/{gameId}/{playerId}`.
- Puertos: Go `8080`, Scala `8081`.

## 6. Reglas de oro
1. Go **no** calcula estadísticas; Scala **no** recibe/valida/almacena flujo. Respeta la separación: es lo que se evalúa.
2. En Scala evita `var` y mutación; usa `val`, colecciones inmutables y operaciones funcionales. Si usas `foldLeft`, `groupBy`, etc., que sea por una razón que se pueda explicar.
3. En Go debe verse **concurrencia real**: una goroutine por partida activa, channels, `sync.Mutex` donde haya mapas compartidos.
4. Eventos inválidos: se rechazan con HTTP 400 y se **registran** (visibles en `GET /invalid`).
5. Todo debe arrancar con `docker compose up --build`.
6. Antes de dar un ticket por terminado: probarlo (curl o test) y mostrar la evidencia al usuario.
7. No agregar dependencias, bases de datos ni servicios que el spec no pida.

## 7. Estado actual
Actualizar esta sección al cerrar cada sesión.
- [x] Enunciado leído y entendido.
- [x] Decisiones de diseño tomadas (ver §3).
- [x] Spec, conceptos y tickets escritos (`docs/`).
- [ ] T0 en adelante: ver `docs/TICKETS.md` (columna Estado).

**Siguiente paso:** empezar por T0 (preparar entorno y repo). Verificar primero qué hay instalado (`go version`, `java -version`, `sbt --version`, `docker --version`, `git --version`).

## 8. Plan de tiempo (hoy mié 14-oct → entrega dom 18-oct, 10 pm)
- Mié 14: T0, T1, T2
- Jue 15: T3, T4, T5 (primer flujo completo Go → Scala)
- Vie 16: T6, T7, T8 (estadísticas)
- Sáb 17: T9, T10, T11, T12 (patrones, consulta, Docker, CI)
- Dom 18: T13 (docs, demo, ensayo), colchón y entrega **antes de las 6 pm** para no arriesgar.
