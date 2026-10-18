// Parser.scala — frontera: convierte el JSON que llega de Go en las case classes de Models.
// Si falta un campo o está mal, lanza una excepción; quien llama la captura con Try.
import java.time.Instant

object Parser:
  def event(j: ujson.Value): Event =
    // Los campos de "data" se reparten según su tipo de valor.
    val fields = j.obj.get("data").map(_.obj.toList).getOrElse(Nil)
    Event(
      eventId = j("eventId").str,
      timestamp = Instant.parse(j("timestamp").str),
      gameId = j("gameId").str,
      gameVersion = j("gameVersion").str,
      matchId = j("matchId").str,
      playerId = j.obj.get("playerId").map(_.str),
      tpe = j("type").str,
      strings = fields.collect { case (k, ujson.Str(s)) => k -> s }.toMap,
      numbers = fields.collect { case (k, ujson.Num(n)) => k -> n }.toMap,
      lists = fields.collect { case (k, ujson.Arr(items)) =>
        k -> items.toList.collect { case ujson.Str(s) => s }
      }.toMap
    )

  def matchData(j: ujson.Value): MatchData =
    MatchData(
      matchId = j("matchId").str,
      gameId = j("gameId").str,
      gameVersion = j("gameVersion").str,
      events = j("events").arr.toList.map(event)
    )
