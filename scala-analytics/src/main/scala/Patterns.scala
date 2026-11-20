// Patterns.scala — detección de patrones en secuencias de eventos (T9). Solo funciones puras.
import java.time.{Duration, Instant}

object Patterns:
  val StreakWindowSeconds = 10L
  val StreakMinKills = 3

  // Agrupa instantes ORDENADOS en "rachas": un instante entra al grupo actual si ocurre a
  // lo más `windowSeconds` después del PRIMERO del grupo; si no, empieza un grupo nuevo.
  // foldLeft va recorriendo la lista acumulando los grupos (el más reciente va primero).
  def clusters(times: List[Instant], windowSeconds: Long): List[List[Instant]] =
    times
      .foldLeft(List.empty[List[Instant]]) { (groups, t) =>
        groups match
          case current :: older if Duration.between(current.last, t).toMillis <= windowSeconds * 1000 =>
            (t :: current) :: older
          case _ => List(t) :: groups
      }
      .map(_.reverse)
      .reverse

  // RACHA (combate): 3 o más eliminaciones del mismo jugador dentro de una ventana de 10 s.
  def killStreaks(events: List[Event]): List[Pattern] =
    val killsBy: Map[String, List[Instant]] =
      events
        .filter(_.tpe == "PLAYER_ELIMINATED")
        .flatMap(e => e.playerId.map(p => p -> e.timestamp))
        .groupMap(_._1)(_._2)
    killsBy.toList.sortBy(_._1).flatMap { case (player, times) =>
      clusters(times.sorted, StreakWindowSeconds)
        .filter(_.size >= StreakMinKills)
        .map { group =>
          Pattern(
            "KILL_STREAK",
            player,
            Calc.stats(
              Calc.num("kills", group.size),
              Calc.num("windowSeconds", Duration.between(group.head, group.last).getSeconds),
              Calc.text("startedAt", Some(group.head.toString))
            )
          )
        }
    }

  // RACHA DE COMIDA (culebrita, Proyecto 2): 3 o más comidas del mismo jugador en ≤ 10 s.
  // Es la misma agrupación de clusters que la racha de eliminaciones.
  val FoodStreakMin = 3

  def foodStreaks(events: List[Event]): List[Pattern] =
    val eatenBy: Map[String, List[Instant]] =
      events
        .filter(_.tpe == "FOOD_EATEN")
        .flatMap(e => e.playerId.map(p => p -> e.timestamp))
        .groupMap(_._1)(_._2)
    eatenBy.toList.sortBy(_._1).flatMap { case (player, times) =>
      clusters(times.sorted, StreakWindowSeconds)
        .filter(_.size >= FoodStreakMin)
        .map { group =>
          Pattern(
            "FOOD_STREAK",
            player,
            Calc.stats(
              Calc.num("food", group.size),
              Calc.num("windowSeconds", Duration.between(group.head, group.last).getSeconds),
              Calc.text("startedAt", Some(group.head.toString))
            )
          )
        }
    }

  // RACHA DE ESQUIVES (Ruta Nocturna, Proyecto 2): minCars o más CAR_DODGED seguidos del
  // mismo jugador sin un CRASHED en medio. foldLeft arma las rachas recorriendo los eventos
  // en orden: un choque cierra la racha actual y empieza una nueva (la más reciente va primero).
  def dodgeStreaks(events: List[Event], minCars: Int): List[Pattern] =
    val relevant = events.filter(e => e.tpe == "CAR_DODGED" || e.tpe == "CRASHED")
    relevant.flatMap(_.playerId).distinct.sorted.flatMap { player =>
      val streaks =
        relevant
          .filter(_.playerId.contains(player))
          .foldLeft(List(List.empty[Instant])) { (runs, e) =>
            if e.tpe == "CRASHED" then List.empty[Instant] :: runs
            else (e.timestamp :: runs.head) :: runs.tail
          }
          .map(_.reverse)
          .reverse
      streaks.filter(_.size >= minCars).map { run =>
        Pattern(
          "DODGE_STREAK",
          player,
          Calc.stats(
            Calc.num("cars", run.size),
            Calc.num("seconds", Duration.between(run.head, run.last).getSeconds),
            Calc.text("startedAt", Some(run.head.toString))
          )
        )
      }
    }

  // REMONTADA (carreras): el jugador estuvo en la ÚLTIMA posición en alguna vuelta y terminó
  // en el podio (top 3). Con 3 jugadores o menos, "último" ya es podio, así que no cuenta.
  def comebacks(events: List[Event], numPlayers: Int): List[Pattern] =
    if numPlayers < 4 then Nil
    else
      val positionsBy: Map[String, List[Int]] =
        events
          .filter(_.tpe == "LAP_COMPLETED")
          .flatMap(e => e.playerId.zip(e.num("position")).map { case (p, pos) => p -> pos.toInt })
          .groupMap(_._1)(_._2)
      positionsBy.toList.sortBy(_._1).collect {
        case (player, positions) if positions.contains(numPlayers) && positions.last <= 3 =>
          Pattern(
            "COMEBACK",
            player,
            Calc.stats(
              Calc.num("worstPosition", numPlayers),
              Calc.num("finalPosition", positions.last)
            )
          )
      }
