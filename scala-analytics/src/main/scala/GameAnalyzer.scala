// GameAnalyzer.scala — el contrato que cumple cada juego, y el registro de juegos.

trait GameAnalyzer:
  def gameId: String
  def analyze(m: MatchData): MatchResult
  // Estadísticas acumuladas de un jugador a lo largo de todas sus partidas (T10).
  def accumulate(playerId: String, history: List[(MatchResult, PlayerStats)]): Stats

  // Estadísticas del juego completo, juntando todas sus partidas analizadas (Proyecto 2).
  // Esta versión sirve para cualquier juego; cada analizador puede agregarle las suyas
  // (override ... = super.gameSummary(results) ++ Calc.stats(...)).
  def gameSummary(results: List[MatchResult]): Stats =
    Calc.stats(
      Calc.num("matches", results.size),
      Calc.numOpt("avgDurationSeconds", Calc.meanOf(results, "durationSeconds")),
      Calc.num("distinctPlayers", Overview.humanPlayers(results).size),
      Calc.num("patternsDetected", results.map(_.patterns.size).sum)
    )

object Analyzers:
  // Para agregar un juego nuevo: crear su Analyzer y añadirlo a esta lista. Nada más cambia.
  val all: List[GameAnalyzer] =
    List(RacingAnalyzer, CombatAnalyzer, Connect4Analyzer, SnakeAnalyzer, NightDriveAnalyzer)

  private val byGame: Map[String, GameAnalyzer] = all.map(a => a.gameId -> a).toMap

  // Busca el analizador del juego, ordena los eventos por tiempo y analiza.
  def run(m: MatchData): Either[String, MatchResult] =
    byGame
      .get(m.gameId)
      .toRight(s"juego no soportado: ${m.gameId}")
      .map(a => a.analyze(m.copy(events = m.events.sortBy(_.timestamp))))

  // Acumulado de un jugador en un juego: junta sus partidas y se las pasa al analizador del juego.
  def playerSummary(gameId: String, playerId: String, results: List[MatchResult]): Option[Stats] =
    for
      analyzer <- byGame.get(gameId)
      history = results
        .filter(_.gameId == gameId)
        .flatMap(r => r.players.find(_.playerId == playerId).map(ps => (r, ps)))
      if history.nonEmpty
    yield analyzer.accumulate(playerId, history)

  // Resumen de un juego con sus partidas; None si el juego no tiene analizador.
  def gameSummary(gameId: String, results: List[MatchResult]): Option[Stats] =
    byGame.get(gameId).map(a => a.gameSummary(results.filter(_.gameId == gameId)))

  // El resumen de cada juego registrado (también los que aún no tienen partidas).
  def allSummaries(results: List[MatchResult]): List[(String, Stats)] =
    all.map(a => a.gameId -> a.gameSummary(results.filter(_.gameId == a.gameId)))
