package main

import (
	"log"
	"net/http"
	"os"
	"time"
)

// getenv lee una variable de entorno o devuelve un valor por defecto.
func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// checkScala (T0) pregunta a Scala si está vivo y lo escribe en consola.
func checkScala() {
	url := getenv("SCALA_URL", "http://localhost:8081") + "/health"
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		log.Println("Scala no responde todavía:", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		log.Println("Scala responde OK")
	} else {
		log.Println("Scala respondió con código", resp.StatusCode)
	}
}

func main() {
	// Carpeta con los games/*.json (desde go-ingest/ está en ../games).
	gamesDir := getenv("GAMES_DIR", "../games")
	games, err := loadGames(gamesDir)
	if err != nil {
		log.Fatal("no se pudieron cargar los juegos: ", err)
	}
	log.Printf("Juegos cargados: %d", len(games))

	validator := newValidator(games)

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/events", eventsHandler(validator))
	http.HandleFunc("/invalid", invalidHandler(validator))

	go checkScala() // en una goroutine para no retrasar el arranque

	log.Println("Go escuchando en el puerto 8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
