// GameAnalyzer.scala — el contrato que cumple cada juego, y el registro de juegos.

trait GameAnalyzer:
  def gameId: String
  def analyze(m: MatchData): MatchResult
  // Estadísticas acumuladas de un jugador a lo largo de todas sus partidas (T10).
  def accumulate(playerId: String, history: List[(MatchResult, PlayerStats)]): Stats

object Analyzers:
  // Para agregar un juego nuevo: crear su Analyzer y añadirlo a esta lista. Nada más cambia.
  val all: List[GameAnalyzer] = List(RacingAnalyzer, CombatAnalyzer)

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
