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

  // T10: consultar resultados.
  @cask.get("/matches")
  def matches() = jsonResponse(200, ResultJson.summaries(Store.all))

  @cask.get("/matches/:matchId")
  def matchById(matchId: String) =
    Store.get(matchId) match
      case Some(r) => jsonResponse(200, ResultJson.toJson(r))
      case None    => jsonResponse(404, ujson.Obj("error" -> s"partida no encontrada: $matchId"))

  @cask.get("/players/:gameId/:playerId")
  def playerStats(gameId: String, playerId: String) =
    Analyzers.playerSummary(gameId, playerId, Store.all) match
      case Some(stats) => jsonResponse(200, ResultJson.playerSummary(gameId, playerId, stats))
      case None        => jsonResponse(404, ujson.Obj("error" -> s"sin datos de $playerId en $gameId"))

  // Proyecto 2: lo que consulta el panel de la consola. La consola solo muestra estos
  // valores; todos los cálculos se hacen aquí.
  @cask.get("/stats")
  def stats() =
    val results = Store.all
    jsonResponse(200, ResultJson.overview(Overview.general(results), Analyzers.allSummaries(results)))

  @cask.get("/games/:gameId/stats")
  def gameStats(gameId: String) =
    Analyzers.gameSummary(gameId, Store.all) match
      case Some(stats) => jsonResponse(200, ResultJson.gameSummary(gameId, stats))
      case None        => jsonResponse(404, ujson.Obj("error" -> s"juego no soportado: $gameId"))

  // Recibe una partida completa de Go, la analiza, la guarda y responde.
  @cask.post("/analyze")
  def analyze(request: cask.Request) =
    val parsed: Either[String, MatchData] =
      Try(Parser.matchData(ujson.read(request.text()))).toEither.left.map(e => s"JSON inválido: ${e.getMessage}")

    parsed.flatMap(Analyzers.run) match
      case Right(result) =>
        Store.save(result)
        Store.writeFile(result) match
          case Failure(e) => println(s"No se pudo escribir el archivo de ${result.matchId}: ${e.getMessage}")
          case Success(_) => ()
        println(Report.text(result))
        jsonResponse(200, ujson.Obj("matchId" -> result.matchId, "status" -> "analyzed"))
      case Left(message) =>
        jsonResponse(400, ujson.Obj("error" -> message))

  initialize()
