// NightDriveAnalyzer.scala — estadísticas de Ruta Nocturna. Solo transformaciones de listas.
//
// Eventos: LANE_CHANGED (from, to), CAR_DODGED (score, speed), CRASHED (livesLeft, score,
// speed) y MATCH_FINISHED (result: LOSS al perder las 3 vidas, ABANDONED si se cerró).

object NightDriveAnalyzer extends GameAnalyzer:
  val gameId = "nightdrive"

  // Una racha de esquives cuenta desde esta cantidad de autos seguidos sin chocar.
  val StreakMinCars = 10

  def analyze(m: MatchData): MatchResult =
    val events = m.events
    val dodged = events.filter(_.tpe == "CAR_DODGED")
    val crashes = events.filter(_.tpe == "CRASHED")
    val withSpeed = dodged ++ crashes

    val players =
      (events.flatMap(_.playerId) ++ events.flatMap(_.lists.getOrElse("players", Nil))).distinct.sorted

    // --- Por jugador ---
    val playerStats = players.map { p =>
      val mine = events.filter(_.playerId.contains(p))
      val myCrashes = mine.filter(_.tpe == "CRASHED")
      PlayerStats(
        p,
        Calc.stats(
          Calc.num("carsDodged", mine.count(_.tpe == "CAR_DODGED")),
          Calc.num("laneChanges", mine.count(_.tpe == "LANE_CHANGED")),
          Calc.num("crashes", myCrashes.size),
          Calc.numOpt("maxSpeed", mine.flatMap(_.num("speed")).maxOption),
          Calc.num("finalScore", mine.flatMap(_.num("score")).maxOption.getOrElse(0.0)),
          // Combinada (choques + velocidad): a qué velocidad suele chocar.
          Calc.numOpt("avgCrashSpeed", Calc.mean(myCrashes.flatMap(_.num("speed"))))
        )
      )
    }

    // --- Por partida ---
    val finished = events.find(_.tpe == "MATCH_FINISHED")
    val summary = Calc.stats(
      Calc.numOpt("durationSeconds", Calc.durationSeconds(events)),
      Calc.text("result", finished.flatMap(_.str("result"))),
      Calc.num("finalScore", withSpeed.flatMap(_.num("score")).maxOption.getOrElse(0.0)),
      Calc.num("carsDodged", dodged.size),
      Calc.num("crashes", crashes.size),
      Calc.num("laneChanges", events.count(_.tpe == "LANE_CHANGED")),
      Calc.numOpt("maxSpeed", withSpeed.flatMap(_.num("speed")).maxOption)
    )

    MatchResult(m.matchId, m.gameId, playerStats, summary, Patterns.dodgeStreaks(events, StreakMinCars))

  def accumulate(playerId: String, history: List[(MatchResult, PlayerStats)]): Stats =
    val scores = history.flatMap { case (_, ps) => Calc.numOf(ps.stats, "finalScore") }
    Calc.stats(
      Calc.num("matches", history.size),
      Calc.numOpt("bestScore", scores.maxOption),
      Calc.num("carsDodged", Calc.total(history, "carsDodged")),
      Calc.num("crashes", Calc.total(history, "crashes")),
      Calc.numOpt("maxSpeed", history.flatMap { case (_, ps) => Calc.numOf(ps.stats, "maxSpeed") }.maxOption)
    )

  override def gameSummary(results: List[MatchResult]): Stats =
    val scores = results.flatMap(r => Calc.numOf(r.summary, "finalScore"))
    super.gameSummary(results) ++ Calc.stats(
      Calc.numOpt("bestScore", scores.maxOption),
      Calc.numOpt("avgScore", Calc.mean(scores)),
      Calc.numOpt("avgCarsDodged", Calc.meanOf(results, "carsDodged")),
      Calc.numOpt("maxSpeed", results.flatMap(r => Calc.numOf(r.summary, "maxSpeed")).maxOption),
      Calc.num("totalCrashes", results.flatMap(r => Calc.numOf(r.summary, "crashes")).sum),
      Calc.num("abandoned", Calc.countText(results, "result", "ABANDONED"))
    )
