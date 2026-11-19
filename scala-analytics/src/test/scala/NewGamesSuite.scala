import java.time.Instant

// Proyecto 2: tests de los juegos de la consola (Conecta 4, culebrita y Ruta Nocturna),
// del resumen por juego y de las estadísticas generales. Eventos escritos a mano y
// resultados calculados a mano, como en AnalyzerSuite.
class NewGamesSuite extends munit.FunSuite:

  private val t0 = Instant.parse("2026-11-19T15:00:00Z")

  private def ev(
      sec: Int,
      tpe: String,
      player: Option[String] = None,
      nums: Map[String, Double] = Map.empty,
      strs: Map[String, String] = Map.empty,
      lists: Map[String, List[String]] = Map.empty,
      game: String = "x"
  ): Event =
    Event(s"e-$sec-$tpe", t0.plusSeconds(sec), game, "1.0", "m1", player, tpe, strs, nums, lists)

  private def num(s: Stats, key: String): Option[Double] = s.get(key).collect { case Stat.Num(v) => v }
  private def text(s: Stats, key: String): Option[String] = s.get(key).collect { case Stat.Text(v) => v }
  private def player(r: MatchResult, id: String): PlayerStats = r.players.find(_.playerId == id).get

  // ---------- Conecta 4 ----------
  // omar abre en la columna 4 (índice 3). La IA piensa 100 ms y luego 300 ms (promedio 200),
  // revisa 1000 y 3000 tableros (promedio 2000) y la segunda vez tapa. Gana la IA.
  private def connect4(result: String, winner: String): List[Event] =
    val o = Some("omar")
    val cpu = Some("cpu")
    List(
      ev(0, "MATCH_STARTED", None, strs = Map("difficulty" -> "hard"), lists = Map("players" -> List("omar", "cpu"))),
      ev(1, "MOVE", o, Map("column" -> 3.0, "row" -> 5.0, "moveNumber" -> 1.0), Map("piece" -> "R")),
      ev(2, "AI_DECISION", cpu,
        Map("column" -> 3.0, "score" -> 5.0, "nodesExplored" -> 1000.0, "depth" -> 5.0, "thinkMs" -> 100.0),
        Map("reason" -> "minimax", "board" -> "...")),
      ev(3, "MOVE", cpu, Map("column" -> 3.0, "row" -> 4.0, "moveNumber" -> 2.0), Map("piece" -> "Y")),
      ev(4, "MOVE", o, Map("column" -> 2.0, "row" -> 5.0, "moveNumber" -> 3.0), Map("piece" -> "R")),
      ev(5, "AI_DECISION", cpu,
        Map("column" -> 1.0, "score" -> 9.0, "nodesExplored" -> 3000.0, "depth" -> 5.0, "thinkMs" -> 300.0),
        Map("reason" -> "block", "board" -> "...")),
      ev(6, "MOVE", cpu, Map("column" -> 1.0, "row" -> 5.0, "moveNumber" -> 4.0), Map("piece" -> "Y")),
      ev(10, "MATCH_FINISHED", None, strs = Map("result" -> result, "winner" -> winner))
    )

  private val c4Loss = Connect4Analyzer.analyze(MatchData("m1", "connect4", "1.0", connect4("LOSS", "cpu")))
  private val c4Win = Connect4Analyzer.analyze(MatchData("m2", "connect4", "1.0", connect4("WIN", "omar")))

  test("connect4: por jugador, la IA tiene sus tiempos y nodos; la persona no") {
    val omar = player(c4Loss, "omar")
    assertEquals(num(omar.stats, "moves"), Some(2.0))
    assertEquals(num(omar.stats, "avgThinkMs"), None)
    assertEquals(num(omar.stats, "blocks"), None)
    val cpu = player(c4Loss, "cpu")
    assertEquals(num(cpu.stats, "moves"), Some(2.0))
    assertEquals(num(cpu.stats, "avgThinkMs"), Some(200.0))
    assertEquals(num(cpu.stats, "avgNodesExplored"), Some(2000.0))
    assertEquals(num(cpu.stats, "blocks"), Some(1.0))
    assertEquals(num(cpu.stats, "winningMoves"), Some(0.0))
  }

  test("connect4: por partida") {
    val s = c4Loss.summary
    assertEquals(num(s, "durationSeconds"), Some(10.0))
    assertEquals(num(s, "totalMoves"), Some(4.0))
    assertEquals(text(s, "result"), Some("LOSS"))
    assertEquals(text(s, "winner"), Some("cpu"))
    assertEquals(num(s, "openingColumn"), Some(4.0)) // columna 3 vista como 4
    assertEquals(num(s, "aiAvgThinkMs"), Some(200.0))
    assertEquals(num(s, "aiBlocks"), Some(1.0))
  }

  test("connect4: patrón AI_BLOCK cuando la IA tapa") {
    assertEquals(c4Loss.patterns.map(_.kind), List("AI_BLOCK"))
    assertEquals(c4Loss.patterns.head.playerId, "cpu")
    assertEquals(num(c4Loss.patterns.head.details, "column"), Some(2.0))
  }

  test("connect4: resumen del juego con dos partidas (una ganada y una perdida)") {
    val s = Connect4Analyzer.gameSummary(List(c4Loss, c4Win))
    assertEquals(num(s, "matches"), Some(2.0))
    assertEquals(num(s, "humanWins"), Some(1.0))
    assertEquals(num(s, "aiWins"), Some(1.0))
    assertEquals(num(s, "draws"), Some(0.0))
    assertEquals(num(s, "distinctPlayers"), Some(1.0)) // la computadora no cuenta como persona
    assertEquals(num(s, "avgMovesPerMatch"), Some(4.0))
    assertEquals(num(s, "favoriteOpeningColumn"), Some(4.0))
    assertEquals(num(s, "aiBlocks"), Some(2.0))
  }

  test("connect4: acumulado de la persona") {
    val Some(omar) = Analyzers.playerSummary("connect4", "omar", List(c4Loss, c4Win)): @unchecked
    assertEquals(num(omar, "matches"), Some(2.0))
    assertEquals(num(omar, "wins"), Some(1.0))
    assertEquals(num(omar, "losses"), Some(1.0))
    assertEquals(num(omar, "moves"), Some(4.0))
  }

  // ---------- Culebrita ----------
  // Come a los 10, 12 y 15 s (racha de 3 en 5 s) y a los 50 s; muere mordiéndose a los 60 s.
  private val o = Some("omar")
  private val snakeEvents = List(
    ev(0, "MATCH_STARTED", None, Map("gridSize" -> 20.0), lists = Map("players" -> List("omar"))),
    ev(10, "FOOD_EATEN", o, Map("score" -> 10.0, "length" -> 4.0)),
    ev(12, "FOOD_EATEN", o, Map("score" -> 20.0, "length" -> 5.0)),
    ev(15, "FOOD_EATEN", o, Map("score" -> 30.0, "length" -> 6.0)),
    ev(50, "FOOD_EATEN", o, Map("score" -> 40.0, "length" -> 7.0)),
    ev(60, "PLAYER_DIED", o, Map("score" -> 40.0, "length" -> 7.0), Map("cause" -> "self")),
    ev(60, "MATCH_FINISHED", None, strs = Map("result" -> "LOSS"))
  )
  private val snake = SnakeAnalyzer.analyze(MatchData("s1", "snake", "1.0", snakeEvents))

  test("snake: por jugador, con comida por minuto (combinada)") {
    val omar = player(snake, "omar")
    assertEquals(num(omar.stats, "foodEaten"), Some(4.0))
    assertEquals(num(omar.stats, "score"), Some(40.0))
    assertEquals(num(omar.stats, "maxLength"), Some(7.0))
    assertEquals(num(omar.stats, "foodPerMinute"), Some(4.0)) // 4 comidas en 60 s
    assertEquals(text(omar.stats, "deathCause"), Some("self"))
  }

  test("snake: por partida y patrón FOOD_STREAK") {
    val s = snake.summary
    assertEquals(num(s, "durationSeconds"), Some(60.0))
    assertEquals(text(s, "result"), Some("LOSS"))
    assertEquals(num(s, "finalScore"), Some(40.0))
    assertEquals(text(s, "deathCause"), Some("self"))
    assertEquals(snake.patterns.map(_.kind), List("FOOD_STREAK"))
    assertEquals(num(snake.patterns.head.details, "food"), Some(3.0))
    assertEquals(num(snake.patterns.head.details, "windowSeconds"), Some(5.0))
  }

  test("snake: muere sin comer -> puntaje 0, sin racha") {
    val r = SnakeAnalyzer.analyze(MatchData("s2", "snake", "1.0", List(
      ev(0, "MATCH_STARTED", None, Map("gridSize" -> 20.0), lists = Map("players" -> List("omar"))),
      ev(5, "PLAYER_DIED", o, Map("score" -> 0.0, "length" -> 3.0), Map("cause" -> "wall")),
      ev(5, "MATCH_FINISHED", None, strs = Map("result" -> "LOSS"))
    )))
    assertEquals(num(r.summary, "finalScore"), Some(0.0))
    assertEquals(num(r.summary, "maxLength"), Some(3.0))
    assertEquals(num(player(r, "omar").stats, "foodPerMinute"), Some(0.0))
    assertEquals(r.patterns, Nil)
    val g = SnakeAnalyzer.gameSummary(List(snake, r))
    assertEquals(num(g, "bestScore"), Some(40.0))
    assertEquals(num(g, "avgScore"), Some(20.0))
    assertEquals(num(g, "wallDeaths"), Some(1.0))
    assertEquals(num(g, "selfDeaths"), Some(1.0))
  }

  // ---------- Ruta Nocturna ----------
  // 10 esquives seguidos (2..11 s), choque, 1 esquive, dos choques más y fin.
  private val driveEvents =
    ev(0, "MATCH_STARTED", None, Map("lanes" -> 4.0, "lives" -> 3.0), lists = Map("players" -> List("omar"))) ::
      ev(1, "LANE_CHANGED", o, Map("from" -> 1.0, "to" -> 2.0)) ::
      (2 to 11).toList.map(s => ev(s, "CAR_DODGED", o, Map("score" -> (s - 1) * 10.0, "speed" -> 120.0))) :::
      List(
        ev(12, "CRASHED", o, Map("livesLeft" -> 2.0, "score" -> 100.0, "speed" -> 150.0)),
        ev(13, "CAR_DODGED", o, Map("score" -> 110.0, "speed" -> 156.0)),
        ev(14, "CRASHED", o, Map("livesLeft" -> 1.0, "score" -> 110.0, "speed" -> 160.0)),
        ev(15, "CRASHED", o, Map("livesLeft" -> 0.0, "score" -> 110.0, "speed" -> 170.0)),
        ev(15, "MATCH_FINISHED", None, strs = Map("result" -> "LOSS"))
      )
  private val drive = NightDriveAnalyzer.analyze(MatchData("n1", "nightdrive", "1.0", driveEvents))

  test("nightdrive: por jugador, con velocidad promedio al chocar (combinada)") {
    val omar = player(drive, "omar")
    assertEquals(num(omar.stats, "carsDodged"), Some(11.0))
    assertEquals(num(omar.stats, "laneChanges"), Some(1.0))
    assertEquals(num(omar.stats, "crashes"), Some(3.0))
    assertEquals(num(omar.stats, "maxSpeed"), Some(170.0))
    assertEquals(num(omar.stats, "finalScore"), Some(110.0))
    assertEquals(num(omar.stats, "avgCrashSpeed"), Some(160.0)) // (150 + 160 + 170) / 3
  }

  test("nightdrive: patrón DODGE_STREAK solo con 10 o más esquives seguidos") {
    assertEquals(drive.patterns.map(_.kind), List("DODGE_STREAK"))
    assertEquals(num(drive.patterns.head.details, "cars"), Some(10.0))
    assertEquals(num(drive.patterns.head.details, "seconds"), Some(9.0))
    val nueve = driveEvents.filterNot(e => e.tpe == "CAR_DODGED" && e.timestamp == t0.plusSeconds(11))
    assertEquals(Patterns.dodgeStreaks(nueve, 10), Nil)
  }

  test("nightdrive: por partida") {
    val s = drive.summary
    assertEquals(num(s, "durationSeconds"), Some(15.0))
    assertEquals(num(s, "carsDodged"), Some(11.0))
    assertEquals(num(s, "crashes"), Some(3.0))
    assertEquals(num(s, "maxSpeed"), Some(170.0))
    assertEquals(text(s, "result"), Some("LOSS"))
  }

  // ---------- Resumen por juego y generales ----------
  test("Analyzers registra los 3 juegos nuevos y Go -> Scala los acepta") {
    assert(Analyzers.run(MatchData("m1", "connect4", "1.0", connect4("DRAW", "nadie"))).isRight)
    assert(Analyzers.run(MatchData("s1", "snake", "1.0", snakeEvents)).isRight)
    assert(Analyzers.run(MatchData("n1", "nightdrive", "1.0", driveEvents)).isRight)
  }

  test("gameSummary: un juego sin partidas da matches = 0; un juego desconocido da None") {
    val Some(vacio) = Analyzers.gameSummary("snake", List(c4Loss)): @unchecked
    assertEquals(num(vacio, "matches"), Some(0.0))
    assertEquals(num(vacio, "avgDurationSeconds"), None)
    assertEquals(Analyzers.gameSummary("ajedrez", Nil), None)
    assertEquals(Analyzers.allSummaries(Nil).map(_._1), List("racing", "combat", "connect4", "snake", "nightdrive"))
  }

  test("Overview: estadísticas generales de todos los juegos juntos") {
    val g = Overview.general(List(c4Loss, c4Win, snake))
    assertEquals(num(g, "totalMatches"), Some(3.0))
    assertEquals(num(g, "gamesPlayed"), Some(2.0))
    assertEquals(num(g, "distinctPlayers"), Some(1.0))
    assertEquals(num(g, "avgDurationSeconds"), Some(26.67)) // (10 + 10 + 60) / 3, a 2 decimales
    assertEquals(text(g, "mostPlayedGame"), Some("connect4"))
    assertEquals(num(g, "patternsDetected"), Some(3.0)) // 2 AI_BLOCK + 1 FOOD_STREAK
    assertEquals(Overview.matchesByGame(List(c4Loss, c4Win, snake)), List("connect4" -> 2, "snake" -> 1))
  }

  test("ResultJson.overview separa lo general de cada juego") {
    val j = ResultJson.overview(Overview.general(List(snake)), Analyzers.allSummaries(List(snake)))
    assertEquals(j("general")("totalMatches").num, 1.0)
    assertEquals(j("games").arr.size, 5)
    val s = j("games").arr.find(_("gameId").str == "snake").get
    assertEquals(s("matches").num, 1.0)
    assertEquals(s("bestScore").num, 40.0)
  }
