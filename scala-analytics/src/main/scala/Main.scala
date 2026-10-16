// Main.scala — servidor HTTP de Scala (Cask), puerto 8081.
import scala.util.{Failure, Success, Try}

object Main extends cask.MainRoutes:
  override def host = "0.0.0.0"
  override def port = 8081

  // Arma una respuesta JSON con el código de estado que queramos (200, 400...).
  private def jsonResponse(status: Int, body: ujson.Value) =
    cask.Response(
      ujson.write(body),
      statusCode = status,
      headers = Seq("Content-Type" -> "application/json")
    )

  @cask.get("/health")
  def health() = ujson.Obj("status" -> "ok")

  // Recibe una partida completa de Go. Por ahora (T5) solo la lee y cuenta eventos.
  @cask.post("/analyze")
  def analyze(request: cask.Request) =
    Try(Parser.matchData(ujson.read(request.text()))) match
      case Success(m) =>
        // groupBy agrupa los eventos por tipo; map convierte cada grupo en su cantidad.
        val porTipo = m.events.groupBy(_.tpe).map { case (tipo, evs) => tipo -> evs.size }
        println(s"Recibida partida ${m.matchId} (${m.gameId}): ${m.events.size} eventos")
        println(s"  por tipo: $porTipo")
        jsonResponse(200, ujson.Obj("matchId" -> m.matchId, "status" -> "analyzed"))
      case Failure(e) =>
        jsonResponse(400, ujson.Obj("error" -> s"JSON inválido: ${e.getMessage}"))

  initialize()
