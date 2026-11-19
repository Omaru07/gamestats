// SnakeAnalyzer.scala — estadísticas de la culebrita. Solo transformaciones de listas.
//
// Eventos: FOOD_EATEN (score, length), PLAYER_DIED (cause: "wall" o "self", score, length)
// y MATCH_FINISHED (result: LOSS al morir, ABANDONED si se cerró).

object SnakeAnalyzer extends GameAnalyzer:
  val gameId = "snake"

  def analyze(m: MatchData): MatchResult =
    val events = m.events
    val eaten = events.filter(_.tpe == "FOOD_EATEN")
    val death = events.find(_.tpe == "PLAYER_DIED")
    val duration = Calc.durationSeconds(events)

    val players =
      (events.flatMap(_.playerId) ++ events.flatMap(_.lists.getOrElse("players", Nil))).distinct.sorted

    // --- Por jugador ---
    val playerStats = players.map { p =>
      val mine = events.filter(_.playerId.contains(p))
      val food = mine.count(_.tpe == "FOOD_EATEN")
      PlayerStats(
        p,
        Calc.stats(
          Calc.num("foodEaten", food),
          Calc.num("score", mine.flatMap(_.num("score")).maxOption.getOrElse(0.0)),
          Calc.numOpt("maxLength", mine.flatMap(_.num("length")).maxOption),
          // Combinada (tiempo + comida): qué tan rápido come.
          Calc.numOpt("foodPerMinute", duration.flatMap(d => Calc.ratio(food, d / 60))),
          Calc.text("deathCause", mine.find(_.tpe == "PLAYER_DIED").flatMap(_.str("cause")))
        )
      )
    }

    // --- Por partida ---
    val finished = events.find(_.tpe == "MATCH_FINISHED")
    val summary = Calc.stats(
      Calc.numOpt("durationSeconds", duration),
      Calc.text("result", finished.flatMap(_.str("result"))),
      Calc.num("foodEaten", eaten.size),
      Calc.num("finalScore", (eaten ++ death.toList).flatMap(_.num("score")).maxOption.getOrElse(0.0)),
      Calc.numOpt("maxLength", (eaten ++ death.toList).flatMap(_.num("length")).maxOption),
      Calc.text("deathCause", death.flatMap(_.str("cause")))
    )

    // --- Patrón: racha de comida (3 o más en 10 s), con la misma agrupación que KILL_STREAK ---
    MatchResult(m.matchId, m.gameId, playerStats, summary, Patterns.foodStreaks(events))

  def accumulate(playerId: String, history: List[(MatchResult, PlayerStats)]): Stats =
    val scores = history.flatMap { case (_, ps) => Calc.numOf(ps.stats, "score") }
    val causes = history.flatMap { case (_, ps) => Calc.textOf(ps.stats, "deathCause") }
    Calc.stats(
      Calc.num("matches", history.size),
      Calc.numOpt("bestScore", scores.maxOption),
      Calc.numOpt("avgScore", Calc.mean(scores)),
      Calc.num("foodEaten", Calc.total(history, "foodEaten")),
      Calc.text("mostCommonDeath", Calc.mostCommon(causes))
    )

  override def gameSummary(results: List[MatchResult]): Stats =
    val scores = results.flatMap(r => Calc.numOf(r.summary, "finalScore"))
    super.gameSummary(results) ++ Calc.stats(
      Calc.numOpt("bestScore", scores.maxOption),
      Calc.numOpt("avgScore", Calc.mean(scores)),
      Calc.numOpt("avgFoodPerMatch", Calc.meanOf(results, "foodEaten")),
      Calc.numOpt("bestLength", results.flatMap(r => Calc.numOf(r.summary, "maxLength")).maxOption),
      Calc.num("wallDeaths", Calc.countText(results, "deathCause", "wall")),
      Calc.num("selfDeaths", Calc.countText(results, "deathCause", "self")),
      Calc.num("abandoned", Calc.countText(results, "result", "ABANDONED"))
    )
