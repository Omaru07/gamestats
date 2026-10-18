// Models.scala — los datos de entrada, como valores inmutables (sin ninguna librería de JSON).
import java.time.Instant

// Un evento. "tpe" es el campo "type" del JSON (en Scala "type" es palabra reservada).
// Los campos de "data" se separan por tipo de valor: textos, números y listas de textos.
case class Event(
    eventId: String,
    timestamp: Instant,
    gameId: String,
    gameVersion: String,
    matchId: String,
    playerId: Option[String], // Some(jugador) o None: no todos los eventos tienen jugador
    tpe: String,
    strings: Map[String, String] = Map.empty,
    numbers: Map[String, Double] = Map.empty,
    lists: Map[String, List[String]] = Map.empty
):
  def str(key: String): Option[String] = strings.get(key)
  def num(key: String): Option[Double] = numbers.get(key)

// Una partida completa, tal como la manda Go a POST /analyze (SPEC §6).
case class MatchData(
    matchId: String,
    gameId: String,
    gameVersion: String,
    events: List[Event]
)
