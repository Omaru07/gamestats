object Main extends cask.MainRoutes {

  override def port: Int = 8081
  override def host: String = "0.0.0.0"

  @cask.get("/health")
  def health() = ujson.Obj("status" -> "ok")

  initialize()
}