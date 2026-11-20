// Overview.scala — estadísticas GENERALES, juntando las partidas de todos los juegos
// (Proyecto 2: panel de la consola). Solo funciones puras sobre la lista de resultados.

object Overview:
  // "cpu" es la computadora de Conecta 4: no cuenta como persona.
  val ComputerId = "cpu"

  def humanPlayers(results: List[MatchResult]): List[String] =
    results.flatMap(_.players.map(_.playerId)).filterNot(_ == ComputerId).distinct.sorted

  // Partidas analizadas por juego, de la más jugada a la menos (en empate, por nombre).
  def matchesByGame(results: List[MatchResult]): List[(String, Int)] =
    results
      .groupMapReduce(_.gameId)(_ => 1)(_ + _)
      .toList
      .sortBy { case (game, n) => (-n, game) }

  def general(results: List[MatchResult]): Stats =
    val byGame = matchesByGame(results)
    Calc.stats(
      Calc.num("totalMatches", results.size),
      Calc.num("gamesPlayed", byGame.size),
      Calc.num("distinctPlayers", humanPlayers(results).size),
      Calc.numOpt("avgDurationSeconds", Calc.meanOf(results, "durationSeconds")),
      Calc.text("mostPlayedGame", byGame.headOption.map(_._1)),
      Calc.num("patternsDetected", results.map(_.patterns.size).sum),
      Calc.num("abandonedMatches", Calc.countText(results, "result", "ABANDONED"))
    )
