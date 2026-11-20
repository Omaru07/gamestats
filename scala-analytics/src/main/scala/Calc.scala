// Calc.scala — funciones matemáticas puras, reutilizadas por todos los juegos.
import java.time.Duration
import scala.collection.immutable.ListMap

object Calc:
  def mean(xs: List[Double]): Option[Double] =
    if xs.isEmpty then None else Some(xs.sum / xs.size)

  // Desviación estándar poblacional: raíz del promedio de (x - media)^2.
  def stdDev(xs: List[Double]): Option[Double] =
    mean(xs).map(m => math.sqrt(xs.map(x => (x - m) * (x - m)).sum / xs.size))

  // División que no truena: si el denominador es 0 devuelve None.
  def ratio(a: Double, b: Double): Option[Double] =
    if b == 0 then None else Some(a / b)

  // Segundos entre el primer y el último evento (None si no hay eventos).
  def durationSeconds(events: List[Event]): Option[Double] =
    val times = events.map(_.timestamp)
    for
      first <- times.minOption
      last <- times.maxOption
    yield Duration.between(first, last).getSeconds.toDouble

  private def round2(v: Double): Double =
    BigDecimal(v).setScale(2, BigDecimal.RoundingMode.HALF_UP).toDouble

  // Constructores de entradas para armar un Stats. Las que valen None se omiten.
  def num(key: String, v: Double): (String, Option[Stat]) = key -> Some(Stat.Num(round2(v)))
  def numOpt(key: String, v: Option[Double]): (String, Option[Stat]) = key -> v.map(x => Stat.Num(round2(x)))
  def text(key: String, v: Option[String]): (String, Option[Stat]) = key -> v.map(Stat.Text(_))

  // Lee un valor numérico o de texto de un Stats (None si no existe o es de otro tipo).
  def numOf(s: Stats, key: String): Option[Double] = s.get(key).collect { case Stat.Num(v) => v }
  def textOf(s: Stats, key: String): Option[String] = s.get(key).collect { case Stat.Text(v) => v }

  // Suma de una estadística a lo largo del historial de un jugador (partida, sus stats).
  def total(history: List[(MatchResult, PlayerStats)], key: String): Double =
    history.flatMap { case (_, ps) => numOf(ps.stats, key) }.sum

  // El valor que más se repite (en empate, el menor, para que el resultado sea estable).
  def mostCommon[A: Ordering](xs: List[A]): Option[A] =
    xs.groupMapReduce(identity)(_ => 1)(_ + _)
      .toList
      .sortBy { case (x, n) => (-n, x) }
      .headOption
      .map(_._1)

  // Cuántos resultados tienen ese texto en una estadística de la partida (p. ej. result = "WIN").
  def countText(results: List[MatchResult], key: String, value: String): Int =
    results.count(r => textOf(r.summary, key).contains(value))

  // Promedio de una estadística numérica de la partida, entre las partidas que la tienen.
  def meanOf(results: List[MatchResult], key: String): Option[Double] =
    mean(results.flatMap(r => numOf(r.summary, key)))

  // ListMap conserva el orden en que se escribieron las estadísticas.
  def stats(entries: (String, Option[Stat])*): Stats =
    ListMap.from(entries.collect { case (k, Some(s)) => k -> s })
