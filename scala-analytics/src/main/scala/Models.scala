// Models.scala — los datos que Scala recibe de Go, como valores inmutables.

// case class = registro inmutable. "tpe" es el campo "type" del JSON
// (en Scala "type" es palabra reservada, por eso se llama distinto).
case class Event(
    eventId: String,
    timestamp: String,
    gameId: String,
    gameVersion: String,
    matchId: String,
    playerId: Option[String], // Option: puede haber un jugador (Some) o no (None)
    tpe: String,
    data: ujson.Value
)

// Una partida completa, tal como la manda Go a POST /analyze (SPEC §6).
case class MatchData(
    matchId: String,
    gameId: String,
    gameVersion: String,
    events: List[Event]
)

// Convierte JSON (ujson.Value) en las case classes de arriba.
// Si falta un campo obligatorio, ujson lanza una excepción; quien llama la captura con Try.
object Parser:
  def event(j: ujson.Value): Event =
    Event(
      eventId = j("eventId").str,
      timestamp = j("timestamp").str,
      gameId = j("gameId").str,
      gameVersion = j("gameVersion").str,
      matchId = j("matchId").str,
      playerId = j.obj.get("playerId").map(_.str),
      tpe = j("type").str,
      data = j.obj.getOrElse("data", ujson.Obj())
    )

  def matchData(j: ujson.Value): MatchData =
    MatchData(
      matchId = j("matchId").str,
      gameId = j("gameId").str,
      gameVersion = j("gameVersion").str,
      events = j("events").arr.toList.map(event) // map: cada JSON de la lista -> un Event
    )
