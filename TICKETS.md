# TICKETS — GameStats

Cada ticket es un **corte vertical**: entrega algo que se puede ejecutar y comprobar, no una capa suelta.
- **AFK**: Claude puede hacerlo solo y explicarlo.
- **HITL**: requiere una decisión o acción tuya (instalar, confirmar con el profesor, revisar).
- **Estado**: `[ ]` pendiente · `[~]` en curso · `[x]` hecho.
- Se marca como hecho solo si se **probó** y se mostró la evidencia.

## Mapa

| # | Ticket | Tipo | Depende de | Día | Estado |
|---|---|---|---|---|---|
| T0 | Entorno, repo y "hola mundo" Go ↔ Scala | HITL | — | Mié | [X] |
| T1 | Formato de eventos y configs de juegos | HITL | T0 | Mié | [X] |
| T2 | Go recibe y valida un evento | AFK | T1 | Mié | [X] |
| T3 | Go agrupa por partida con goroutines | AFK | T2 | Jue | [X] |
| T4 | Simulador de partidas en paralelo | AFK | T2 | Jue | [ ] |
| T5 | Go envía partida terminada a Scala (flujo completo) | AFK | T3, T0 | Jue | [ ] |
| T6 | Scala: estadísticas por jugador | AFK | T5 | Vie | [ ] |
| T7 | Scala: estadísticas por partida | AFK | T6 | Vie | [ ] |
| T8 | Scala: estadísticas combinadas | AFK | T6 | Vie | [ ] |
| T9 | Scala: detección de patrones | AFK | T6 | Sáb | [ ] |
| T10 | Consultar resultados (GET) | AFK | T7 | Sáb | [ ] |
| T11 | Dockerfiles y docker-compose | AFK | T5 | Sáb | [ ] |
| T12 | CI con GitHub Actions | HITL | T11 | Sáb | [ ] |
| T13 | Documentación, demo y entrega | HITL | todos | Dom | [ ] |
| T14 | (Extra) Tercer juego solo por configuración | AFK | T10 | Si sobra tiempo | [ ] |

Camino crítico: **T0 → T1 → T2 → T3 → T5 → T6 → T7 → T10 → T11 → T13**. T4 puede hacerse en paralelo a T3. T8, T9 y T12 se pueden recortar o acortar si hay prisa, pero T8 y T9 son requisitos mínimos del enunciado, así que no se eliminan.

> **Regla de corte:** si el sábado a mediodía vas atrasado, se recorta en este orden: T14, la parte de combate de T9 (quedarte solo con la racha), refinamientos de T10. Nunca se recortan T5, T11 ni T13.

---

## T0 — Entorno, repo y "hola mundo" Go ↔ Scala  `HITL`
**Qué se construye:** el repositorio con la estructura de carpetas, un servicio Go mínimo y un servicio Scala mínimo, y la prueba de que Go puede llamar a Scala por HTTP.

**Por qué es primero:** es el *tracer bullet*. Si la comunicación Go ↔ Scala no funciona, todo lo demás es inútil. Es mejor descubrirlo hoy.

**Pasos:**
1. Verificar versiones instaladas: `git`, `go`, `java` (JDK 17+), `sbt`, `docker`. Tú instalas lo que falte (Claude guía paso a paso).
2. `git init`, `.gitignore`, primer commit con `CLAUDE.md` y `docs/`.
3. Go (`go-ingest/`): servidor en 8080 con `GET /health` que responde `{"status":"ok"}`.
4. Scala (`scala-analytics/`): servidor Cask en 8081 con `GET /health`.
5. Go, al arrancar, hace `GET` al `/health` de Scala y escribe el resultado en consola.
6. Confirmar versiones de Cask y upickle disponibles y fijarlas en `build.sbt`.

**Criterios de aceptación:**
- [ ] `curl localhost:8080/health` y `curl localhost:8081/health` responden `ok`.
- [ ] Arrancando Go con Scala encendido se ve "Scala responde OK" en consola.
- [ ] Primer commit hecho.

---

## T1 — Formato de eventos y configs de juegos  `HITL`
**Qué se construye:** los documentos y archivos que fijan el contrato: `games/racing.json`, `games/combat.json`, ejemplos de evento y revisión del `SPEC.md`.

**Por qué HITL:** tienes que **entender y aprobar** los eventos, porque los defiendes en la presentación.

**Criterios de aceptación:**
- [ ] `games/racing.json` y `games/combat.json` según `SPEC.md §4`.
- [ ] Carpeta `docs/ejemplos/` con 1 evento válido de cada tipo.
- [ ] Revisaste el spec con Claude y puedes explicar con tus palabras qué es cada evento y qué estadística sale de él.
- [ ] Commit.

---

## T2 — Go recibe y valida un evento  `AFK`
**Qué se construye:** `POST /events` en Go. Recibe un evento, lo valida con las reglas comunes y las de `games/*.json`, responde 202 o 400, y guarda los inválidos con su motivo. `GET /invalid` los lista.

**Criterios de aceptación:**
- [ ] Evento válido → `202`.
- [ ] Sin `matchId`, tipo desconocido, campo de `data` faltante, `timestamp` mal formado, `gameId` sin config, `eventId` repetido → `400` con motivo claro.
- [ ] `GET /invalid` muestra los rechazados.
- [ ] Tests en Go (`go test`) con al menos 6 casos (válidos e inválidos).
- [ ] Commit.

---

## T3 — Go agrupa por partida con goroutines  `AFK`
**Qué se construye:** estado en memoria de partidas. Una goroutine y un channel por partida activa. Ciclo `MATCH_STARTED → eventos → MATCH_FINISHED`. `GET /matches` muestra el estado. Todavía no se envía a Scala; al terminar solo se marca `COMPLETE` y se imprime en consola.

**Criterios de aceptación:**
- [ ] Mandar a mano (curl) eventos de dos partidas intercaladas y ver que quedan separados.
- [ ] Evento de partida inexistente o ya terminada → rechazado.
- [ ] Mapa compartido protegido con mutex; `go test -race` sin advertencias.
- [ ] `GET /matches` muestra partidas con estado, cantidad de eventos y jugadores.
- [ ] Commit.

---

## T4 — Simulador de partidas en paralelo  `AFK`
**Qué se construye:** `simulator/` (Go). Lanza varias partidas de `racing` y `combat` a la vez (una goroutine por partida) y envía los eventos a `POST /events`. Incluye casos especiales e inválidos a propósito (ver `SPEC.md §10`).

**Criterios de aceptación:**
- [ ] `go run ./simulator` con 6 partidas (3 + 3) genera cientos de eventos.
- [ ] Hay al menos una racha de 3 eliminaciones en ≤ 10 s y una remontada en carreras.
- [ ] Incluye ~4 eventos inválidos diferentes.
- [ ] Con semilla fija, la salida es reproducible.
- [ ] Contra Go (T2/T3) se ven las partidas llegar y los inválidos rechazados.
- [ ] Commit.

---

## T5 — Go envía la partida terminada a Scala (flujo completo)  `AFK`
**Qué se construye:** al recibir `MATCH_FINISHED`, la goroutine ordena eventos por `timestamp` y hace `POST /analyze` a Scala. Scala (por ahora) solo parsea el JSON a *case classes*, cuenta los eventos y responde 200. Reintentos y estado `SENT`/`FAILED`.

**Por qué importa:** es el primer flujo de punta a punta: simulador → Go → Scala.

**Criterios de aceptación:**
- [ ] Con los tres procesos corriendo, el simulador provoca que Scala reciba cada partida una sola vez.
- [ ] Scala imprime `matchId`, `gameId` y cantidad de eventos recibidos.
- [ ] Si Scala está apagado, Go reintenta 3 veces y marca la partida `FAILED`.
- [ ] `GET /matches` de Go muestra `SENT` o `FAILED`.
- [ ] Commit.

---

## T6 — Scala: estadísticas por jugador  `AFK`
**Qué se construye:** el trait `GameAnalyzer` y sus dos implementaciones, con estadísticas por jugador.
- Racing: mejor vuelta, vuelta promedio, consistencia (desviación estándar).
- Combat: eliminaciones, muertes, daño total.

Se usan `filter`, `groupBy`, `map` y `foldLeft` / `sum`. Claude explica cada uno con un ejemplo chico antes.

**Criterios de aceptación:**
- [ ] Tests (ScalaTest o munit) con eventos escritos a mano y resultados calculados a mano.
- [ ] Al llegar una partida por `/analyze`, el resultado por jugador queda guardado en memoria y se imprime.
- [ ] Sin `var` ni mutación en el código de análisis.
- [ ] Commit.

---

## T7 — Scala: estadísticas por partida  `AFK`
**Qué se construye:** resumen por partida: duración, ganador, adelantamientos (racing), total de eliminaciones y jugador con más daño (combat). Se arma el JSON de resultado con la estructura de `SPEC.md §7`.

**Criterios de aceptación:**
- [ ] Tests con datos manuales.
- [ ] El resultado JSON contiene `players` y `match`.
- [ ] Se escribe `output/<matchId>.json`.
- [ ] Commit.

---

## T8 — Scala: estadísticas combinadas  `AFK`
**Qué se construye:** estadísticas que relacionan tipos de evento distintos.
- Combat: K/D y daño por eliminación (`PLAYER_ELIMINATED` + `DAMAGE_DEALT`).
- Racing: tiempo promedio de vueltas con y sin penalización (`LAP_COMPLETED` + `PENALTY_APPLIED`).

**Criterios de aceptación:**
- [ ] Tests, incluyendo borde: jugador con 0 muertes (K/D sin dividir por cero).
- [ ] Aparece en el JSON de resultado.
- [ ] Commit.

---

## T9 — Scala: detección de patrones  `AFK`
**Qué se construye:**
- **Racha de eliminaciones** (combat): 3 o más del mismo jugador en una ventana ≤ 10 s. Se resuelve ordenando por tiempo y recorriendo con `sliding` o `foldLeft`.
- **Remontada** (racing): estuvo en el último puesto y terminó en el podio.

**Criterios de aceptación:**
- [ ] Tests con caso positivo y negativo de cada patrón.
- [ ] El simulador (con semilla fija) produce al menos una racha y una remontada, y salen en `patterns` del resultado.
- [ ] Commit.

---

## T10 — Consultar resultados  `AFK`
**Qué se construye:** `GET /matches`, `GET /matches/{matchId}`, `GET /players/{gameId}/{playerId}` en Scala (acumulado entre partidas).

**Criterios de aceptación:**
- [ ] Tras correr el simulador, los tres `GET` devuelven datos coherentes con los tests.
- [ ] Partida inexistente → `404`.
- [ ] Commit.

---

## T11 — Dockerfiles y docker-compose  `AFK`
**Qué se construye:** un `Dockerfile` por servicio (Go y Scala, multi-stage), `docker-compose.yml` con los servicios, red interna, puertos, `depends_on`, volumen para `output/` y servicio opcional `simulator`.

**Criterios de aceptación:**
- [ ] Desde cero: `docker compose up --build` levanta Go y Scala.
- [ ] Go llega a Scala por nombre de servicio (`scala-analytics`), no por `localhost`.
- [ ] `docker compose run simulator` produce resultados consultables.
- [ ] Commit.

---

## T12 — CI con GitHub Actions  `HITL`
**Qué se construye:** `.github/workflows/ci.yml` con: compilar y testear Go, compilar y testear Scala, construir imágenes Docker, smoke test (`compose up`, esperar `/health`, correr el simulador, comprobar que hay resultados).

**Por qué HITL:** necesitas crear el repositorio en GitHub y subir el código.

**Criterios de aceptación:**
- [ ] El pipeline corre en verde en GitHub.
- [ ] Captura de pantalla del pipeline guardada para la presentación.
- [ ] Decisión sobre "deployment" tomada: ver *Pendientes*.

---

## T13 — Documentación, demo y entrega  `HITL`
**Qué se construye:** `README.md` (instalación, ejecución, deployment, cómo agregar un juego), revisión de `SPEC.md`, guion de demo de 5 minutos y ensayo.

**Criterios de aceptación:**
- [ ] Un compañero (o tú en una carpeta limpia) puede ejecutar el sistema siguiendo solo el README.
- [ ] Guion de demo: arrancar, correr simulador, mostrar inválidos, mostrar `GET` con una racha y una remontada.
- [ ] Preparaste respuestas a: *¿por qué Go para esto y Scala para aquello?*, *¿qué ventajas y límites tiene cada paradigma aquí?*, *¿cómo agregas un juego nuevo?*
- [ ] Revisión final contra la lista de **Entregables** del enunciado §11.
- [ ] Entregado en el Tec Digital **antes de las 10:00 pm** (meta: antes de las 6 pm).

---

## T14 — (Extra) Tercer juego solo por configuración  `AFK`
Agregar un tercer juego (p. ej. cartas con `CARD_PLAYED`) con `games/cards.json` y un `CardsAnalyzer` nuevo, **sin tocar** el servidor, el parseo ni el almacenamiento. Demuestra el requisito de genericidad (§12).

---

## Pendientes de decisión (HITL)
1. **¿Cuenta docker-compose local como deployment?** El enunciado pide "deployment de una versión funcional en un entorno definido por el equipo". Preguntar al profesor. Plan B gratis si dice que no: desplegar en una VM o servicio gratuito.
2. Confirmar versiones de herramientas instaladas (T0).
