// CombatAnalyzer.scala — estadísticas de combate. Solo transformaciones de listas.

object CombatAnalyzer extends GameAnalyzer:
  val gameId = "combat"

  def analyze(m: MatchData): MatchResult =
    val events = m.events
    val elims = events.filter(_.tpe == "PLAYER_ELIMINATED")
    val hits = events.filter(_.tpe == "DAMAGE_DEALT")

    // groupMapReduce = agrupar + transformar + sumar, todo en un paso.
    val killsBy: Map[String, Int] = elims.flatMap(_.playerId).groupMapReduce(identity)(_ => 1)(_ + _)
    val deathsBy: Map[String, Int] = elims.flatMap(_.str("target")).groupMapReduce(identity)(_ => 1)(_ + _)
    val hitsBy: Map[String, Int] = hits.flatMap(_.playerId).groupMapReduce(identity)(_ => 1)(_ + _)
    val damageBy: Map[String, Double] =
      hits.flatMap(e => e.playerId.zip(e.num("amount"))).groupMapReduce(_._1)(_._2)(_ + _)

    val players =
      (events.flatMap(_.playerId) ++ events.flatMap(_.str("target")) ++
        events.flatMap(_.lists.getOrElse("players", Nil))).distinct.sorted

    // --- Por jugador (T6) + combinadas K/D y daño por eliminación (T8) ---
    val playerStats = players.map { p =>
      val kills = killsBy.getOrElse(p, 0)
      val deaths = deathsBy.getOrElse(p, 0)
      val damage = damageBy.getOrElse(p, 0.0)
      PlayerStats(
        p,
        Calc.stats(
          Calc.num("kills", kills),
          Calc.num("deaths", deaths),
          // K/D: si nunca murió, se divide entre 1 (K/D = sus eliminaciones), no entre 0.
          Calc.num("kd", kills.toDouble / math.max(deaths, 1)),
          Calc.num("totalDamage", damage),
          Calc.numOpt("avgDamagePerHit", Calc.ratio(damage, hitsBy.getOrElse(p, 0))),
          Calc.numOpt("damagePerKill", Calc.ratio(damage, kills))
        )
      )
    }

    // --- Por partida (T7) ---
    val topDamage = damageBy.toList.sortBy { case (p, d) => (-d, p) }.headOption.map(_._1)
    val finished = events.find(_.tpe == "MATCH_FINISHED")

    val summary = Calc.stats(
      Calc.numOpt("durationSeconds", Calc.durationSeconds(events)),
      Calc.num("totalKills", elims.size),
      Calc.text("topDamagePlayer", topDamage),
      Calc.text("winner", finished.flatMap(_.str("winner")))
    )

    // --- Patrón (T9): racha de eliminaciones ---
    val patterns = Patterns.killStreaks(events)

    MatchResult(m.matchId, m.gameId, playerStats, summary, patterns)

  def accumulate(playerId: String, history: List[(MatchResult, PlayerStats)]): Stats =
    val wins = history.count { case (r, _) => Calc.textOf(r.summary, "winner").contains(playerId) }
    val kills = Calc.total(history, "kills")
    val deaths = Calc.total(history, "deaths")
    val damage = Calc.total(history, "totalDamage")
    Calc.stats(
      Calc.num("matches", history.size),
      Calc.num("wins", wins),
      Calc.num("kills", kills),
      Calc.num("deaths", deaths),
      Calc.num("kd", kills / math.max(deaths, 1)),
      Calc.num("totalDamage", damage),
      Calc.numOpt("damagePerKill", Calc.ratio(damage, kills))
    )
