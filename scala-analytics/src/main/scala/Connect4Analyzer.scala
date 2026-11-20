// Connect4Analyzer.scala — estadísticas de Conecta 4 (persona contra la IA en Prolog).
// Solo transformaciones de listas, igual que los otros analizadores.
//
// Eventos: MOVE (column, row, piece, moveNumber), AI_DECISION (column, board, score,
// nodesExplored, depth, thinkMs, reason) y MATCH_FINISHED (result, winner opcional).
// "result" va desde el punto de vista de la persona: WIN, LOSS, DRAW o ABANDONED.

object Connect4Analyzer extends GameAnalyzer:
  val gameId = "connect4"

  def analyze(m: MatchData): MatchResult =
    val events = m.events
    val moves = events.filter(_.tpe == "MOVE")
    val decisions = events.filter(_.tpe == "AI_DECISION")

    val movesBy: Map[String, Int] = moves.flatMap(_.playerId).groupMapReduce(identity)(_ => 1)(_ + _)
    val decisionsBy: Map[String, List[Event]] =
      decisions.flatMap(e => e.playerId.map(_ -> e)).groupMap(_._1)(_._2)

    val players =
      (events.flatMap(_.playerId) ++ events.flatMap(_.lists.getOrElse("players", Nil))).distinct.sorted

    // --- Por jugador: jugadas; para la IA, además, cómo pensó ---
    val playerStats = players.map { p =>
      val mine = decisionsBy.getOrElse(p, Nil)
      PlayerStats(
        p,
        Calc.stats(
          Calc.num("moves", movesBy.getOrElse(p, 0)),
          Calc.numOpt("avgThinkMs", Calc.mean(mine.flatMap(_.num("thinkMs")))),
          Calc.numOpt("avgNodesExplored", Calc.mean(mine.flatMap(_.num("nodesExplored")))),
          // Solo la IA toma decisiones: para la persona estas dos se omiten (no se inventa un 0).
          Calc.numOpt("blocks", Option.when(mine.nonEmpty)(mine.count(_.str("reason").contains("block")).toDouble)),
          Calc.numOpt("winningMoves", Option.when(mine.nonEmpty)(mine.count(_.str("reason").contains("win")).toDouble))
        )
      )
    }

    // --- Por partida ---
    val finished = events.find(_.tpe == "MATCH_FINISHED")
    // La apertura es la primera jugada (columnas de 1 a 7, como se ven en pantalla).
    val opening = moves.sortBy(_.num("moveNumber").getOrElse(Double.MaxValue)).headOption.flatMap(_.num("column"))

    val summary = Calc.stats(
      Calc.numOpt("durationSeconds", Calc.durationSeconds(events)),
      Calc.num("totalMoves", moves.size),
      Calc.text("result", finished.flatMap(_.str("result"))),
      Calc.text("winner", finished.flatMap(_.str("winner"))),
      Calc.numOpt("openingColumn", opening.map(_ + 1)),
      Calc.numOpt("aiAvgThinkMs", Calc.mean(decisions.flatMap(_.num("thinkMs")))),
      Calc.numOpt("aiAvgNodesExplored", Calc.mean(decisions.flatMap(_.num("nodesExplored")))),
      Calc.num("aiBlocks", decisions.count(_.str("reason").contains("block")))
    )

    // --- Patrón: cada vez que la IA tapó un 4 en línea de la persona ---
    val patterns = decisions.filter(_.str("reason").contains("block")).flatMap { e =>
      e.playerId.map { ai =>
        Pattern(
          "AI_BLOCK",
          ai,
          Calc.stats(
            Calc.numOpt("column", e.num("column").map(_ + 1)),
            Calc.text("at", Some(e.timestamp.toString))
          )
        )
      }
    }

    MatchResult(m.matchId, m.gameId, playerStats, summary, patterns)

  def accumulate(playerId: String, history: List[(MatchResult, PlayerStats)]): Stats =
    val winners = history.map { case (r, _) => Calc.textOf(r.summary, "winner") }
    val results = history.map { case (r, _) => Calc.textOf(r.summary, "result") }
    Calc.stats(
      Calc.num("matches", history.size),
      Calc.num("wins", winners.count(_.contains(playerId))),
      Calc.num("losses", winners.count(w => w.exists(_ != playerId))),
      Calc.num("draws", results.count(_.contains("DRAW"))),
      Calc.num("moves", Calc.total(history, "moves"))
    )

  override def gameSummary(results: List[MatchResult]): Stats =
    val openings = results.flatMap(r => Calc.numOf(r.summary, "openingColumn")).map(_.toInt)
    super.gameSummary(results) ++ Calc.stats(
      Calc.num("humanWins", Calc.countText(results, "result", "WIN")),
      Calc.num("aiWins", Calc.countText(results, "result", "LOSS")),
      Calc.num("draws", Calc.countText(results, "result", "DRAW")),
      Calc.num("abandoned", Calc.countText(results, "result", "ABANDONED")),
      Calc.numOpt("avgMovesPerMatch", Calc.meanOf(results, "totalMoves")),
      Calc.numOpt("aiAvgThinkMs", Calc.meanOf(results, "aiAvgThinkMs")),
      Calc.numOpt("aiAvgNodesExplored", Calc.meanOf(results, "aiAvgNodesExplored")),
      Calc.num("aiBlocks", results.flatMap(r => Calc.numOf(r.summary, "aiBlocks")).sum),
      Calc.numOpt("favoriteOpeningColumn", Calc.mostCommon(openings).map(_.toDouble))
    )
