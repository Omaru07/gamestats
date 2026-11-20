// ResultJson.scala — frontera: convierte un MatchResult en JSON (estructura de SPEC §7).

object ResultJson:
  private def stat(s: Stat): ujson.Value = s match
    case Stat.Num(v)  => ujson.Num(v)
    case Stat.Text(t) => ujson.Str(t)

  // Agrega todas las estadísticas como campos de un objeto JSON.
  private def addStats(o: ujson.Obj, stats: Stats): ujson.Obj =
    stats.foreach { case (k, v) => o(k) = stat(v) }
    o

  private def playerJson(p: PlayerStats): ujson.Value =
    addStats(ujson.Obj("playerId" -> ujson.Str(p.playerId)), p.stats)

  private def patternJson(p: Pattern): ujson.Value =
    addStats(ujson.Obj("type" -> ujson.Str(p.kind), "playerId" -> ujson.Str(p.playerId)), p.details)

  // Versión corta de una partida, para GET /matches.
  def summaryJson(r: MatchResult): ujson.Value =
    val playerCount: ujson.Value = ujson.Num(r.players.size)
    val summary: ujson.Value = addStats(ujson.Obj(), r.summary)
    val patterns: ujson.Value = ujson.Arr(r.patterns.map(patternJson)*)
    ujson.Obj(
      "matchId" -> ujson.Str(r.matchId),
      "gameId" -> ujson.Str(r.gameId),
      "players" -> playerCount,
      "match" -> summary,
      "patterns" -> patterns
    )

  def summaries(rs: List[MatchResult]): ujson.Value = ujson.Arr(rs.map(summaryJson)*)

  // Acumulado de un jugador, para GET /players/{gameId}/{playerId}.
  def playerSummary(gameId: String, playerId: String, stats: Stats): ujson.Value =
    addStats(ujson.Obj("gameId" -> ujson.Str(gameId), "playerId" -> ujson.Str(playerId)), stats)

  // Resumen de un juego, para GET /games/{gameId}/stats.
  def gameSummary(gameId: String, stats: Stats): ujson.Value =
    addStats(ujson.Obj("gameId" -> ujson.Str(gameId)), stats)

  // Panel completo, para GET /stats: lo general y el resumen de cada juego, por separado.
  def overview(general: Stats, byGame: List[(String, Stats)]): ujson.Value =
    val games: ujson.Value = ujson.Arr(byGame.map { case (g, s) => gameSummary(g, s) }*)
    ujson.Obj(
      "general" -> addStats(ujson.Obj(), general),
      "games" -> games
    )

  def toJson(r: MatchResult): ujson.Value =
    val players: ujson.Value = ujson.Arr(r.players.map(playerJson)*)
    val summary: ujson.Value = addStats(ujson.Obj(), r.summary)
    val patterns: ujson.Value = ujson.Arr(r.patterns.map(patternJson)*)
    ujson.Obj(
      "matchId" -> ujson.Str(r.matchId),
      "gameId" -> ujson.Str(r.gameId),
      "players" -> players,
      "match" -> summary,
      "patterns" -> patterns
    )
