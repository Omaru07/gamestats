import java.time.Instant

// Tests con eventos escritos a mano y resultados calculados a mano.
class AnalyzerSuite extends munit.FunSuite:

  private val t0 = Instant.parse("2026-10-16T10:00:00Z")

  // Crea un evento que ocurre "sec" segundos después de t0.
  private def ev(
      sec: Int,
      tpe: String,
      player: Option[String] = None,
      nums: Map[String, Double] = Map.empty,
      strs: Map[String, String] = Map.empty,
      lists: Map[String, List[String]] = Map.empty
  ): Event =
    Event(s"e-$sec-$tpe", t0.plusSeconds(sec), "x", "1.0", "m1", player, tpe, strs, nums, lists)

  private def num(p: PlayerStats, key: String): Option[Double] =
    p.stats.get(key).collect { case Stat.Num(v) => v }

  private def numOf(s: Stats, key: String): Option[Double] =
    s.get(key).collect { case Stat.Num(v) => v }

  private def textOf(s: Stats, key: String): Option[String] =
    s.get(key).collect { case Stat.Text(v) => v }

  private def player(r: MatchResult, id: String): PlayerStats = r.players.find(_.playerId == id).get

  // ---------- Carreras ----------
  // ana: vueltas 80000 y 90000 (la 2 con penalización). luis: 85000 y 85000.
  private val racingEvents = List(
    ev(0, "MATCH_STARTED", None, Map("totalLaps" -> 2.0), lists = Map("players" -> List("ana", "luis"))),
    ev(80, "LAP_COMPLETED", Some("ana"), Map("lap" -> 1.0, "lapTimeMs" -> 80000.0, "position" -> 1.0)),
    ev(85, "LAP_COMPLETED", Some("luis"), Map("lap" -> 1.0, "lapTimeMs" -> 85000.0, "position" -> 2.0)),
    ev(100, "PENALTY_APPLIED", Some("ana"), Map("lap" -> 2.0, "seconds" -> 5.0), Map("reason" -> "choque")),
    ev(170, "LAP_COMPLETED", Some("ana"), Map("lap" -> 2.0, "lapTimeMs" -> 90000.0, "position" -> 1.0)),
    ev(170, "LAP_COMPLETED", Some("luis"), Map("lap" -> 2.0, "lapTimeMs" -> 85000.0, "position" -> 2.0)),
    ev(171, "POSITION_CHANGED", Some("luis"), Map("from" -> 3.0, "to" -> 2.0)),
    ev(172, "POSITION_CHANGED", Some("ana"), Map("from" -> 1.0, "to" -> 2.0)),
    ev(200, "MATCH_FINISHED", None, strs = Map("winner" -> "ana"))
  )
  private val racingMatch = MatchData("m1", "racing", "1.0", racingEvents)

  test("racing: estadísticas por jugador (T6)") {
    val r = RacingAnalyzer.analyze(racingMatch)
    val ana = player(r, "ana")
    assertEquals(num(ana, "lapsCompleted"), Some(2.0))
    assertEquals(num(ana, "bestLapMs"), Some(80000.0))
    assertEquals(num(ana, "avgLapMs"), Some(85000.0))
    assertEquals(num(ana, "consistencyMs"), Some(5000.0)) // sqrt((5000^2 + 5000^2) / 2)
    assertEquals(num(player(r, "luis"), "consistencyMs"), Some(0.0))
  }

  test("racing: combinada con y sin penalización (T8)") {
    val r = RacingAnalyzer.analyze(racingMatch)
    val ana = player(r, "ana")
    assertEquals(num(ana, "avgLapMsWithPenalty"), Some(90000.0))
    assertEquals(num(ana, "avgLapMsWithoutPenalty"), Some(80000.0))
    // luis nunca tuvo penalización: la estadística no existe (no se inventa un 0)
    assertEquals(num(player(r, "luis"), "avgLapMsWithPenalty"), None)
    assertEquals(numOf(r.summary, "avgLapMsWithPenalty"), Some(90000.0))
    assertEqualsDouble(numOf(r.summary, "avgLapMsWithoutPenalty").get, 83333.33, 0.01) // (80000+85000+85000)/3
  }

  test("racing: estadísticas por partida (T7)") {
    val s = RacingAnalyzer.analyze(racingMatch).summary
    assertEquals(numOf(s, "durationSeconds"), Some(200.0))
    assertEquals(numOf(s, "totalLaps"), Some(2.0))
    assertEquals(numOf(s, "overtakes"), Some(1.0)) // luis 3->2 sube; ana 1->2 baja
    assertEquals(textOf(s, "winner"), Some("ana"))
  }

  test("racing: jugador sin vueltas no rompe nada") {
    val m = MatchData("m1", "racing", "1.0", List(
      ev(0, "MATCH_STARTED", None, Map("totalLaps" -> 1.0), lists = Map("players" -> List("pedro")))
    ))
    val pedro = player(RacingAnalyzer.analyze(m), "pedro")
    assertEquals(num(pedro, "lapsCompleted"), Some(0.0))
    assert(!pedro.stats.contains("bestLapMs"))
  }

  // ---------- Combate ----------
  // ana: 3 golpes (40+60+50) y 1 eliminación (a luis). luis: 1 golpe (30), muere 2 veces.
  // sofia: 1 golpe (20) y 1 eliminación (a luis). ana y sofia nunca mueren.
  private val combatEvents = List(
    ev(0, "MATCH_STARTED", None, lists = Map("players" -> List("ana", "luis", "sofia"))),
    ev(10, "DAMAGE_DEALT", Some("ana"), Map("amount" -> 40.0), Map("target" -> "luis", "weapon" -> "rifle")),
    ev(11, "DAMAGE_DEALT", Some("ana"), Map("amount" -> 60.0), Map("target" -> "luis", "weapon" -> "rifle")),
    ev(11, "PLAYER_ELIMINATED", Some("ana"), strs = Map("target" -> "luis", "weapon" -> "rifle")),
    ev(20, "DAMAGE_DEALT", Some("luis"), Map("amount" -> 30.0), Map("target" -> "ana", "weapon" -> "pistola")),
    ev(30, "DAMAGE_DEALT", Some("ana"), Map("amount" -> 50.0), Map("target" -> "sofia", "weapon" -> "rifle")),
    ev(40, "DAMAGE_DEALT", Some("sofia"), Map("amount" -> 20.0), Map("target" -> "luis", "weapon" -> "cuchillo")),
    ev(41, "PLAYER_ELIMINATED", Some("sofia"), strs = Map("target" -> "luis", "weapon" -> "cuchillo")),
    ev(60, "MATCH_FINISHED", None, strs = Map("winner" -> "ana"))
  )
  private val combatMatch = MatchData("m1", "combat", "1.0", combatEvents)

  test("combat: estadísticas por jugador (T6)") {
    val r = CombatAnalyzer.analyze(combatMatch)
    val ana = player(r, "ana")
    assertEquals(num(ana, "kills"), Some(1.0))
    assertEquals(num(ana, "deaths"), Some(0.0))
    assertEquals(num(ana, "totalDamage"), Some(150.0))
    assertEquals(num(ana, "avgDamagePerHit"), Some(50.0)) // 150 / 3 golpes
    val luis = player(r, "luis")
    assertEquals(num(luis, "kills"), Some(0.0))
    assertEquals(num(luis, "deaths"), Some(2.0))
    assertEquals(num(luis, "totalDamage"), Some(30.0))
  }

  test("combat: K/D y daño por eliminación, con borde de 0 muertes (T8)") {
    val r = CombatAnalyzer.analyze(combatMatch)
    val ana = player(r, "ana")
    assertEquals(num(ana, "kd"), Some(1.0)) // 1 eliminación / 0 muertes -> se divide entre 1
    assertEquals(num(ana, "damagePerKill"), Some(150.0))
    val luis = player(r, "luis")
    assertEquals(num(luis, "kd"), Some(0.0))
    assertEquals(num(luis, "damagePerKill"), None) // 0 eliminaciones: no se divide entre 0
  }

  test("combat: estadísticas por partida (T7)") {
    val s = CombatAnalyzer.analyze(combatMatch).summary
    assertEquals(numOf(s, "durationSeconds"), Some(60.0))
    assertEquals(numOf(s, "totalKills"), Some(2.0))
    assertEquals(textOf(s, "topDamagePlayer"), Some("ana"))
    assertEquals(textOf(s, "winner"), Some("ana"))
  }

  // ---------- Registro y utilidades ----------
  test("Analyzers.run ordena por tiempo: el orden de llegada no cambia el resultado") {
    val Right(a) = Analyzers.run(combatMatch): @unchecked
    val Right(b) = Analyzers.run(combatMatch.copy(events = combatEvents.reverse)): @unchecked
    assertEquals(a, b)
  }

  test("Analyzers.run rechaza un juego sin analizador") {
    val r = Analyzers.run(MatchData("m1", "ajedrez", "1.0", Nil))
    assertEquals(r, Left("juego no soportado: ajedrez"))
  }

  test("Calc.stdDev: ejemplo clásico (2, 4, 4, 4, 5, 5, 7, 9) da 2") {
    assertEquals(Calc.stdDev(List(2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0)), Some(2.0))
    assertEquals(Calc.stdDev(Nil), None)
  }

  test("Calc.ratio no divide entre cero") {
    assertEquals(Calc.ratio(10.0, 0.0), None)
    assertEquals(Calc.ratio(10.0, 4.0), Some(2.5))
  }

  // ---------- T9: patrones ----------
  private def kill(sec: Int, who: String): Event =
    ev(sec, "PLAYER_ELIMINATED", Some(who), strs = Map("target" -> "x", "weapon" -> "rifle"))

  test("KILL_STREAK: 3 eliminaciones en 8 s es una racha") {
    val ps = Patterns.killStreaks(List(kill(0, "ana"), kill(4, "ana"), kill(8, "ana")))
    assertEquals(ps.size, 1)
    assertEquals(ps.head.kind, "KILL_STREAK")
    assertEquals(ps.head.playerId, "ana")
    assertEquals(numOf(ps.head.details, "kills"), Some(3.0))
    assertEquals(numOf(ps.head.details, "windowSeconds"), Some(8.0))
  }

  test("KILL_STREAK: justo 10 s todavía cuenta") {
    assertEquals(Patterns.killStreaks(List(kill(0, "ana"), kill(5, "ana"), kill(10, "ana"))).size, 1)
  }

  test("KILL_STREAK negativo: 3 eliminaciones pero repartidas en 12 s") {
    assertEquals(Patterns.killStreaks(List(kill(0, "ana"), kill(6, "ana"), kill(12, "ana"))), Nil)
  }

  test("KILL_STREAK negativo: las eliminaciones de jugadores distintos no se mezclan") {
    assertEquals(Patterns.killStreaks(List(kill(0, "ana"), kill(2, "luis"), kill(4, "ana"))), Nil)
  }

  test("KILL_STREAK: 4 seguidas son UNA racha de 4, no dos") {
    val ps = Patterns.killStreaks(List(kill(0, "ana"), kill(3, "ana"), kill(6, "ana"), kill(9, "ana")))
    assertEquals(ps.size, 1)
    assertEquals(numOf(ps.head.details, "kills"), Some(4.0))
  }

  test("KILL_STREAK: dos rachas separadas del mismo jugador") {
    val kills = List(0, 2, 4, 100, 102, 104).map(kill(_, "ana"))
    assertEquals(Patterns.killStreaks(kills).size, 2)
  }

  test("el analizador de combate incluye la racha en patterns") {
    val m = MatchData("m1", "combat", "1.0", List(kill(0, "ana"), kill(1, "ana"), kill(2, "ana")))
    assertEquals(CombatAnalyzer.analyze(m).patterns.map(_.kind), List("KILL_STREAK"))
  }

  private def lap(sec: Int, who: String, lapNo: Int, pos: Int): Event =
    ev(sec, "LAP_COMPLETED", Some(who), Map("lap" -> lapNo.toDouble, "lapTimeMs" -> 80000.0, "position" -> pos.toDouble))

  // Carrera de varios jugadores; "luis" sigue las posiciones dadas y el resto va fijo.
  private def race(players: List[String], luisPositions: List[Int]): MatchData =
    val start = ev(0, "MATCH_STARTED", None, Map("totalLaps" -> 3.0), lists = Map("players" -> players))
    val laps = luisPositions.zipWithIndex.map { case (pos, i) => lap(10 * (i + 1), "luis", i + 1, pos) }
    MatchData("m1", "racing", "1.0", start :: laps)

  private val four = List("ana", "luis", "sofia", "pedro")

  test("COMEBACK: último en la vuelta 1 y primero al final") {
    val ps = RacingAnalyzer.analyze(race(four, List(4, 2, 1))).patterns
    assertEquals(ps.map(_.kind), List("COMEBACK"))
    assertEquals(ps.head.playerId, "luis")
    assertEquals(numOf(ps.head.details, "worstPosition"), Some(4.0))
    assertEquals(numOf(ps.head.details, "finalPosition"), Some(1.0))
  }

  test("COMEBACK: terminar 3.º también es podio") {
    assertEquals(RacingAnalyzer.analyze(race(four, List(4, 4, 3))).patterns.size, 1)
  }

  test("COMEBACK negativo: nunca estuvo último") {
    assertEquals(RacingAnalyzer.analyze(race(four, List(2, 2, 1))).patterns, Nil)
  }

  test("COMEBACK negativo: estuvo último y terminó último") {
    assertEquals(RacingAnalyzer.analyze(race(four, List(4, 3, 4))).patterns, Nil)
  }

  test("COMEBACK negativo: con 3 jugadores 'último' ya es podio, no es remontada") {
    assertEquals(RacingAnalyzer.analyze(race(List("ana", "luis", "sofia"), List(3, 1, 1))).patterns, Nil)
  }

  // ---------- T10: acumulado de un jugador ----------
  test("acumulado en combate: suma de dos partidas, K/D recalculado") {
    val r1 = CombatAnalyzer.analyze(combatMatch)
    val r2 = CombatAnalyzer.analyze(combatMatch.copy(matchId = "m2"))
    val Some(ana) = Analyzers.playerSummary("combat", "ana", List(r1, r2)): @unchecked
    assertEquals(numOf(ana, "matches"), Some(2.0))
    assertEquals(numOf(ana, "wins"), Some(2.0))
    assertEquals(numOf(ana, "kills"), Some(2.0))
    assertEquals(numOf(ana, "deaths"), Some(0.0))
    assertEquals(numOf(ana, "kd"), Some(2.0))
    assertEquals(numOf(ana, "totalDamage"), Some(300.0))
    assertEquals(numOf(ana, "damagePerKill"), Some(150.0))
    val Some(luis) = Analyzers.playerSummary("combat", "luis", List(r1, r2)): @unchecked
    assertEquals(numOf(luis, "deaths"), Some(4.0))
    assertEquals(numOf(luis, "wins"), Some(0.0))
    assert(!luis.contains("damagePerKill")) // 0 eliminaciones: no se divide entre 0
  }

  test("acumulado en carreras: vueltas, mejor vuelta y promedio ponderado") {
    val r1 = RacingAnalyzer.analyze(racingMatch)
    val r2 = RacingAnalyzer.analyze(racingMatch.copy(matchId = "m2"))
    val Some(ana) = Analyzers.playerSummary("racing", "ana", List(r1, r2)): @unchecked
    assertEquals(numOf(ana, "matches"), Some(2.0))
    assertEquals(numOf(ana, "wins"), Some(2.0))
    assertEquals(numOf(ana, "lapsCompleted"), Some(4.0))
    assertEquals(numOf(ana, "bestLapMs"), Some(80000.0))
    assertEquals(numOf(ana, "avgLapMs"), Some(85000.0))
  }

  test("acumulado: jugador o juego inexistente da None; no mezcla juegos") {
    val r = CombatAnalyzer.analyze(combatMatch)
    assertEquals(Analyzers.playerSummary("combat", "nadie", List(r)), None)
    assertEquals(Analyzers.playerSummary("ajedrez", "ana", List(r)), None)
    assertEquals(Analyzers.playerSummary("racing", "ana", List(r)), None) // ana solo jugó combate
  }
