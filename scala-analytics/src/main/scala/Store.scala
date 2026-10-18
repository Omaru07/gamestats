// Store.scala — guarda los resultados en memoria y en archivos output/<matchId>.json.
import java.nio.file.{Files, Path}
import java.util.concurrent.atomic.AtomicReference
import scala.util.Try

object Store:
  // Un solo Map inmutable dentro de una referencia atómica: cada guardado crea un Map nuevo.
  private val results = new AtomicReference(Map.empty[String, MatchResult])

  def save(r: MatchResult): Unit =
    results.updateAndGet(m => m + (r.matchId -> r))
    ()

  def all: List[MatchResult] = results.get.values.toList.sortBy(_.matchId)
  def get(matchId: String): Option[MatchResult] = results.get.get(matchId)

  private val outputDir = Path.of(sys.env.getOrElse("OUTPUT_DIR", "output"))

  // Escribe output/<matchId>.json (el matchId se limpia para que no pueda salirse de la carpeta).
  def writeFile(r: MatchResult): Try[Path] = Try {
    Files.createDirectories(outputDir)
    val safeName = r.matchId.replaceAll("[^A-Za-z0-9._-]", "_")
    Files.writeString(outputDir.resolve(s"$safeName.json"), ujson.write(ResultJson.toJson(r), indent = 2))
  }
