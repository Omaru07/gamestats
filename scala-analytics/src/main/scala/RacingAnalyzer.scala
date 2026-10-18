// RacingAnalyzer.scala — estadísticas de carreras. Solo transformaciones de listas.

object RacingAnalyzer extends GameAnalyzer:
  val gameId = "racing"

  def analyze(m: MatchData): MatchResult =
    val events = m.events
    val laps = events.filter(_.tpe == "LAP_COMPLETED")

    // Pares (jugador, vuelta) que recibieron penalización.
    val penalized: Set[(String, Int)] =
      events
        .filter(_.tpe == "PENALTY_APPLIED")
        .flatMap(e => e.playerId.zip(e.num("lap")).map { case (p, lap) => (p, lap.toInt) })
        .toSet

    def hasPenalty(e: Event): Boolean =
      e.playerId.zip(e.num("lap")).exists { case (p, lap) => penalized((p, lap.toInt)) }

    def times(es: List[Event]): List[Double] = es.flatMap(_.num("lapTimeMs"))

    // groupMap agrupa las vueltas por jugador.
    val lapsOf: Map[String, List[Event]] =
      laps.flatMap(e => e.playerId.map(p => p -> e)).groupMap(_._1)(_._2)

    val players =
      (events.flatMap(_.playerId) ++ events.flatMap(_.lists.getOrElse("players", Nil))).distinct.sorted

    // --- Por jugador (T6) + combinada con penalizaciones (T8) ---
    val playerStats = players.map { p =>
      val mine = lapsOf.getOrElse(p, Nil)
      val (withPen, without) = mine.partition(hasPenalty)
      PlayerStats(
        p,
        Calc.stats(
          Calc.num("lapsCompleted", mine.size),
          Calc.numOpt("bestLapMs", times(mine).minOption),
          Calc.numOpt("avgLapMs", Calc.mean(times(mine))),
          Calc.numOpt("consistencyMs", Calc.stdDev(times(mine))),
          Calc.numOpt("avgLapMsWithPenalty", Calc.mean(times(withPen))),
          Calc.numOpt("avgLapMsWithoutPenalty", Calc.mean(times(without)))
        )
      )
    }

    // --- Por partida (T7) + combinada (T8) ---
    val (allWithPen, allWithout) = laps.partition(hasPenalty)
    val finished = events.find(_.tpe == "MATCH_FINISHED")
    val started = events.find(_.tpe == "MATCH_STARTED")
    val overtakes = events.count(e =>
      e.tpe == "POSITION_CHANGED" && e.num("from").zip(e.num("to")).exists { case (from, to) => to < from }
    )

    val summary = Calc.stats(
      Calc.numOpt("durationSeconds", Calc.durationSeconds(events)),
      Calc.numOpt("totalLaps", started.flatMap(_.num("totalLaps"))),
      Calc.num("overtakes", overtakes),
      Calc.text("winner", finished.flatMap(_.str("winner"))),
      Calc.numOpt("avgLapMsWithPenalty", Calc.mean(times(allWithPen))),
      Calc.numOpt("avgLapMsWithoutPenalty", Calc.mean(times(allWithout)))
    )

    // --- Patrón (T9): remontada ---
    val patterns = Patterns.comebacks(events, players.size)

    MatchResult(m.matchId, m.gameId, playerStats, summary, patterns)

  def accumulate(playerId: String, history: List[(MatchResult, PlayerStats)]): Stats =
    val wins = history.count { case (r, _) => Calc.textOf(r.summary, "winner").contains(playerId) }
    val laps = Calc.total(history, "lapsCompleted")
    // Promedio ponderado: cada partida pesa según cuántas vueltas dio el jugador en ella.
    val weightedSum = history.flatMap { case (_, ps) =>
      for
        l <- Calc.numOf(ps.stats, "lapsCompleted")
        a <- Calc.numOf(ps.stats, "avgLapMs")
      yield l * a
    }.sum
    Calc.stats(
      Calc.num("matches", history.size),
      Calc.num("wins", wins),
      Calc.num("lapsCompleted", laps),
      Calc.numOpt("bestLapMs", history.flatMap { case (_, ps) => Calc.numOf(ps.stats, "bestLapMs") }.minOption),
      Calc.numOpt("avgLapMs", Calc.ratio(weightedSum, laps))
    )
