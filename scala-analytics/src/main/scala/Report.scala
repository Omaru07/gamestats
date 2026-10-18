// Report.scala — texto legible de un resultado, para imprimir en consola.

object Report:
  private def show(s: Stat): String = s match
    case Stat.Num(v)  => if v == v.toLong then v.toLong.toString else f"$v%.2f"
    case Stat.Text(t) => t

  private def line(stats: Stats): String =
    stats.map { case (k, v) => s"$k=${show(v)}" }.mkString(", ")

  def text(r: MatchResult): String =
    val header = s"Partida ${r.matchId} (${r.gameId}) analizada"
    val players = r.players.map(p => s"  ${p.playerId}: ${line(p.stats)}")
    val summary = s"  partida: ${line(r.summary)}"
    val patterns = r.patterns.map(p => s"  patrón ${p.kind} (${p.playerId}): ${line(p.details)}")
    (header :: players ::: (summary :: patterns)).mkString("\n")
