// Results.scala — la forma del resultado del análisis. Es igual para cualquier juego:
// cada juego decide QUÉ estadísticas pone, pero todas viajan en el mismo formato.

// Un valor de estadística: un número o un texto.
enum Stat:
  case Num(value: Double)
  case Text(value: String)

// nombre de la estadística -> valor (ej. "kills" -> Num(5))
type Stats = Map[String, Stat]

case class PlayerStats(playerId: String, stats: Stats)

// Un patrón detectado (racha, remontada...). Se implementa en T9.
case class Pattern(kind: String, playerId: String, details: Stats)

case class MatchResult(
    matchId: String,
    gameId: String,
    players: List[PlayerStats],
    summary: Stats,
    patterns: List[Pattern]
)
