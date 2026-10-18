# SPEC — GameStats

Versión mínima viable. Responde a las secciones 3 a 9 del enunciado.

## 1. Objetivo
Recibir eventos de partidas simuladas de dos juegos (carreras y combate), agruparlos por partida, analizarlos con programación funcional y exponer estadísticas y patrones detectados.

## 2. Arquitectura

```
┌───────────┐  POST /events   ┌──────────────┐  POST /analyze  ┌──────────────────┐
│ Simulador │ ──────────────▶ │  Go (8080)   │ ──────────────▶ │  Scala (8081)    │
│  (Go)     │   JSON, uno a   │ valida,      │  partida        │ stats + patrones │
│ varias    │   uno, en       │ agrupa por   │  completa       │ GET /matches ... │
│ partidas  │   paralelo      │ partida      │  (JSON)         │                  │
└───────────┘                 └──────────────┘                 └──────────────────┘
```

Responsabilidades:
| Componente | Hace | NO hace |
|---|---|---|
| Simulador | Genera eventos realistas de varias partidas y juegos en paralelo | Validar o analizar |
| Go | Recibir, validar, rechazar y registrar inválidos, agrupar por partida, concurrencia, enviar a Scala cuando una partida termina | Calcular estadísticas |
| Scala | Parsear, transformar colecciones, calcular estadísticas, detectar patrones, exponer resultados | Recibir flujo en bruto ni validar estructura básica |

## 3. Modelo de eventos

### 3.1 Campos comunes
| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `eventId` | string | sí | Único (ej. `e-000123`) |
| `timestamp` | string ISO-8601 UTC | sí | Cuándo ocurrió |
| `gameId` | string | sí | `racing` o `combat` |
| `gameVersion` | string | sí | ej. `1.0` |
| `matchId` | string | sí | Identifica la partida |
| `playerId` | string | depende del tipo | Obligatorio salvo `MATCH_STARTED` y `MATCH_FINISHED` |
| `type` | string | sí | Tipo de evento (ver catálogo) |
| `action` | string | no | Reservado para subacciones (opcional, no se usa en el MVP) |
| `data` | objeto | según tipo | Campos específicos |

Ejemplo:
```json
{
  "eventId": "e-000042",
  "timestamp": "2026-10-14T10:02:31Z",
  "gameId": "racing",
  "gameVersion": "1.0",
  "matchId": "racing-001",
  "playerId": "ana",
  "type": "LAP_COMPLETED",
  "data": { "lap": 2, "lapTimeMs": 84210, "position": 3 }
}
```

### 3.2 Eventos generales (ambos juegos)
| type | playerId | data |
|---|---|---|
| `MATCH_STARTED` | no | `{ "players": ["ana","luis","sofia"] }` (+ `totalLaps` en racing) |
| `PLAYER_JOINED` | sí | `{}` |
| `MATCH_FINISHED` | no | `{ "winner": "ana" }` |

### 3.3 Carreras (`racing`)
| type | data requerida | Significado |
|---|---|---|
| `LAP_COMPLETED` | `lap` (int), `lapTimeMs` (int), `position` (int) | Un piloto termina una vuelta |
| `POSITION_CHANGED` | `from` (int), `to` (int) | Un adelantamiento o pérdida de puesto |
| `PENALTY_APPLIED` | `lap` (int), `seconds` (int), `reason` (string) | Penalización en una vuelta |

### 3.4 Combate (`combat`)
| type | data requerida | Significado |
|---|---|---|
| `DAMAGE_DEALT` | `target` (string), `amount` (int), `weapon` (string) | Un jugador daña a otro |
| `PLAYER_ELIMINATED` | `target` (string), `weapon` (string) | `playerId` elimina a `target` |

### 3.5 Justificación
- **Carreras:** eventos periódicos y numéricos; permiten consistencia, evolución de posición y relacionar penalizaciones con tiempos.
- **Combate:** eventos en ráfagas con timestamps muy cercanos; permiten K/D, daño y detectar rachas.
- Son de naturaleza opuesta, lo que demuestra que el núcleo no depende de un juego.

## 4. Validación en Go

Reglas **comunes** (en código, `validator.go`), aplicadas en este orden; la primera que falla rechaza el evento:
1. JSON bien formado.
2. `eventId`, `timestamp`, `gameId`, `gameVersion`, `matchId`, `type` presentes y no vacíos.
3. `timestamp` en formato ISO-8601 (RFC 3339) válido.
4. `gameId` con archivo de configuración en `games/`.
5. `type` existente en la configuración del juego.
6. `playerId` presente si el tipo lo exige (`playerRequired`).
7. Campos obligatorios de `data` presentes (según la configuración del juego).
8. `eventId` no repetido (se comprueba al final, para que un evento inválido no "gaste" su id).

Reglas **por juego** (en `games/<gameId>.json`, no en código). Ejemplo, `games/racing.json`:
```json
{
  "gameId": "racing",
  "playerRequired": ["PLAYER_JOINED", "LAP_COMPLETED", "POSITION_CHANGED", "PENALTY_APPLIED"],
  "types": {
    "MATCH_STARTED": ["players", "totalLaps"],
    "PLAYER_JOINED": [],
    "LAP_COMPLETED": ["lap", "lapTimeMs", "position"],
    "POSITION_CHANGED": ["from", "to"],
    "PENALTY_APPLIED": ["lap", "seconds", "reason"],
    "MATCH_FINISHED": []
  }
}
```
y `games/combat.json`:
```json
{
  "gameId": "combat",
  "playerRequired": ["PLAYER_JOINED", "DAMAGE_DEALT", "PLAYER_ELIMINATED"],
  "types": {
    "MATCH_STARTED": ["players"],
    "PLAYER_JOINED": [],
    "DAMAGE_DEALT": ["target", "amount", "weapon"],
    "PLAYER_ELIMINATED": ["target", "weapon"],
    "MATCH_FINISHED": []
  }
}
```
Un tipo que no está en `types`, un juego sin archivo de configuración, o un campo requerido ausente → evento inválido. `winner` en `MATCH_FINISHED` es opcional.

Reglas de **estado de la partida** (en `match.go`), también rechazadas con 400:
- Evento de una partida que no empezó (falta `MATCH_STARTED`).
- Evento de una partida que ya terminó.
- Segundo `MATCH_STARTED` de la misma partida.
- Evento cuyo `gameId` no coincide con el de su partida.

Respuestas de `POST /events`:
- `202 Accepted` → válido y entregado a la goroutine de su partida.
- `400 Bad Request` → inválido; cuerpo `{"error":"<motivo>"}`; el evento (con su motivo y hora) se guarda y se lista en `GET /invalid`.

## 5. Estado y concurrencia en Go
- Mapa `matchId → partida` protegido con `sync.Mutex` (`Manager`).
- Al llegar `MATCH_STARTED` se crea una **goroutine** dedicada con su **channel** de entrada. Cada partida protege además sus propios datos (eventos, jugadores, estado) con otro mutex, porque la goroutine los escribe mientras `GET /matches` los lee.
- Los eventos de esa partida se acumulan en orden de llegada.
- Al recibir `MATCH_FINISHED`, la goroutine ordena los eventos por `timestamp` (orden estable: ante la misma hora se respeta el orden de llegada), arma el JSON y hace `POST /analyze` a Scala. Se hacen **3 intentos** en total, con 1 segundo de espera entre ellos.
- Estados de una partida: `ACTIVE` (recibiendo eventos) → `COMPLETE` (terminó; se está enviando) → `SENT` (Scala respondió 200) o `FAILED` (Scala no respondió tras 3 intentos; no se reenvía sola).
- `GET /matches` devuelve cada partida con su estado, cantidad de eventos y jugadores vistos.

## 6. Contrato Go → Scala
`POST http://scala-analytics:8081/analyze`
```json
{
  "matchId": "racing-001",
  "gameId": "racing",
  "gameVersion": "1.0",
  "events": [ { ...evento... }, { ...evento... } ]
}
```
Respuesta: `200 OK` con `{"matchId":"racing-001","status":"analyzed"}`. Cualquier otro código → Go lo trata como fallo.

## 7. Estadísticas y reglas (Scala)

### Carreras
| Nivel | Métrica | Eventos usados |
|---|---|---|
| Por jugador | Mejor vuelta, vuelta promedio, **consistencia** (desviación estándar de vueltas) | `LAP_COMPLETED` |
| Por partida | Ganador, cantidad de adelantamientos, duración total | `POSITION_CHANGED`, `MATCH_STARTED/FINISHED` |
| **Combinada** (§9.8) | Tiempo promedio de vueltas **con** penalización vs **sin** penalización | `LAP_COMPLETED` + `PENALTY_APPLIED` |
| **Patrón** (§9.9) | **Remontada**: el jugador estuvo en la última posición en algún momento y terminó en el podio (top 3) | secuencia de `POSITION_CHANGED` / `LAP_COMPLETED` |

### Combate
| Nivel | Métrica | Eventos usados |
|---|---|---|
| Por jugador | Eliminaciones, muertes, daño total, daño promedio por golpe | `PLAYER_ELIMINATED`, `DAMAGE_DEALT` |
| Por partida | Total de eliminaciones, duración, jugador con más daño | todos |
| **Combinada** (§9.8) | **K/D** (eliminaciones ÷ muertes) y daño por eliminación | `PLAYER_ELIMINATED` + `DAMAGE_DEALT` |
| **Patrón** (§9.9) | **Racha**: 3 o más eliminaciones del mismo jugador en una ventana de ≤ 10 segundos | secuencia temporal de `PLAYER_ELIMINATED` |

### Nombres de las estadísticas en el resultado
| | Carreras (`racing`) | Combate (`combat`) |
|---|---|---|
| Por jugador | `lapsCompleted`, `bestLapMs`, `avgLapMs`, `consistencyMs`, `avgLapMsWithPenalty`, `avgLapMsWithoutPenalty` | `kills`, `deaths`, `kd`, `totalDamage`, `avgDamagePerHit`, `damagePerKill` |
| Por partida (`match`) | `durationSeconds`, `totalLaps`, `overtakes`, `winner`, `avgLapMsWithPenalty`, `avgLapMsWithoutPenalty` | `durationSeconds`, `totalKills`, `topDamagePlayer`, `winner` |
| Patrón (`patterns`) | `COMEBACK` (`worstPosition`, `finalPosition`) | `KILL_STREAK` (`kills`, `windowSeconds`, `startedAt`) |

### Criterios de cálculo
- **Consistencia:** desviación estándar *poblacional* de los tiempos de vuelta (`lapTimeMs`).
- **Vuelta con penalización:** la vuelta `n` de un jugador que tiene un `PENALTY_APPLIED` con `lap = n`. El `lapTimeMs` ya incluye la penalización.
- **Adelantamiento:** un `POSITION_CHANGED` con `to < from` (el jugador sube de puesto).
- **K/D:** eliminaciones ÷ muertes. Si el jugador no murió, se divide entre 1 (K/D = sus eliminaciones); nunca entre 0.
- **Estadística sin datos suficientes** (por ejemplo, daño por eliminación de quien no eliminó a nadie): se **omite** del JSON; no se inventa un 0.
- **Racha:** las eliminaciones de un jugador, ordenadas por tiempo, se agrupan: cada una entra al grupo actual si ocurre a lo más 10 s después de la *primera* del grupo. Un grupo de 3 o más es una racha; 4 seguidas son una sola racha de 4.
- **Remontada:** la posición se toma de `LAP_COMPLETED`. Cuenta si el jugador estuvo en la última posición en alguna vuelta y terminó en el top 3. Solo aplica con **4 o más jugadores** (con 3, "último" ya es podio).

### Ejemplo de resultado (`combat-001`, resumido; se guarda en `output/<matchId>.json`)
```json
{
  "matchId": "combat-001",
  "gameId": "combat",
  "players": [
    { "playerId": "ana", "kills": 7, "deaths": 6, "kd": 1.17, "totalDamage": 750,
      "avgDamagePerHit": 24.19, "damagePerKill": 107.14 }
  ],
  "match": { "durationSeconds": 238, "totalKills": 23, "topDamagePlayer": "luis", "winner": "luis" },
  "patterns": [
    { "type": "KILL_STREAK", "playerId": "ana", "kills": 3, "windowSeconds": 6, "startedAt": "2026-10-16T10:31:00Z" }
  ]
}
```

## 8. API de consulta (Scala, puerto 8081)
| Método y ruta | Devuelve |
|---|---|
| `GET /health` | `{"status":"ok"}` |
| `GET /matches` | Lista de resultados de todas las partidas analizadas (resumen: `matchId`, `gameId`, cantidad de jugadores, `match` y `patterns`) |
| `GET /matches/{matchId}` | Resultado completo de una partida; `404` con `{"error":...}` si no existe |
| `GET /players/{gameId}/{playerId}` | Estadísticas acumuladas del jugador en todas sus partidas de ese juego (carreras: partidas, victorias, vueltas, mejor vuelta, promedio ponderado; combate: partidas, victorias, eliminaciones, muertes, K/D recalculado, daño); `404` si no hay datos |

`POST /analyze` lo usa Go (§6); responde `400` si el JSON es inválido o si el juego no tiene analizador. Además, cada resultado se escribe en `output/<matchId>.json`.

## 9. Genericidad (§12 del enunciado)
- **Go:** agregar un juego = agregar `games/<nuevo>.json`. Cero cambios de código.
- **Scala:** un trait `GameAnalyzer` (métodos `analyze` y `accumulate`) con una implementación por juego (`RacingAnalyzer`, `CombatAnalyzer`) y una lista `Analyzers.all` que actúa como registro `gameId → analizador`. Agregar un juego = un archivo nuevo + una línea en esa lista. El parseo, el servidor, el JSON y el almacenamiento no cambian, porque todos los juegos devuelven el mismo formato de resultado (nombre de estadística → número o texto).
- El procedimiento está documentado en el README.

## 10. Simulador
- Genera `N` partidas (por defecto 6: 3 racing + 3 combat) **concurrentemente**, con 3-4 jugadores cada una.
- Envía los eventos por HTTP a Go con pausas pequeñas aleatorias.
- Incluye casos especiales a propósito: una partida de combate con racha garantizada, una carrera con remontada garantizada, y algunos eventos inválidos (sin `matchId`, tipo desconocido, campo faltante, duplicado) para demostrar la validación.
- Usa una semilla fija opcional para que la demo sea reproducible.
- Opciones: `-seed` (semilla), `-racing` / `-combat` (cantidad de partidas), `-prefix` (prefijo de los `matchId`, para repetir sin reiniciar), `-pause` (pausa máxima entre eventos), `-dry` (imprime los eventos sin enviarlos), `-url`.
- Con la semilla 42 genera 521 eventos válidos y 5 inválidos (sin `matchId`, tipo desconocido, falta `data.amount`, `timestamp` mal formado y `eventId` duplicado).

## 11. Fuera de alcance
Base de datos, autenticación, interfaz gráfica, mensajería (Kafka), más de dos juegos obligatorios, persistencia entre reinicios.

## 12. Requisitos no funcionales y entregables
- `docker compose up --build` levanta Go, Scala y (opcional) el simulador.
- CI en GitHub Actions: build de Go, build de Scala, build de imágenes Docker, smoke test.
- Entregables: código, este spec como "especificación del formato de eventos", justificación de juegos (§3.5), descripción de estadísticas (§7), Dockerfiles, CI, README de instalación/ejecución/deployment, demo.

## 13. Mapa requisito → dónde se cumple
| Funcionalidad mínima del enunciado (§9) | Cumplida en |
|---|---|
| 1. Recibir eventos | Go: `POST /events` (`handlers.go`) |
| 2. Validar y procesar | Go: `validator.go` (reglas comunes + `games/*.json`) |
| 3. Identificar juegos/partidas/jugadores | Modelo de eventos (§3) y `match.go` |
| 4. Múltiples eventos por partida | Go: una goroutine y un channel por partida (`match.go`) |
| 5. Estadísticas | Scala: `RacingAnalyzer.scala`, `CombatAnalyzer.scala` |
| 6. Agregada por jugador | `players` del resultado (§7) |
| 7. Agregada por partida | `match` del resultado (§7) |
| 8. Combinación de tipos de evento | K/D y daño por eliminación (combate); vueltas con y sin penalización (carreras) |
| 9. Patrón de secuencia | `Patterns.scala`: `KILL_STREAK` y `COMEBACK` |
| 10. Consultar resultados | `GET /matches`, `/matches/{id}`, `/players/{gameId}/{playerId}` en Scala |
