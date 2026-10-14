package main

import (
	"encoding/json"
	"log"
	"net/http"
)

// healthHandler responde {"status":"ok"} cuando alguien hace GET /health.
// w es donde escribimos la respuesta; r es la petición que llegó.
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func main() {
	// Asociamos la ruta "/health" con la función que la atiende.
	http.HandleFunc("/health", healthHandler)

	log.Println("Go escuchando en el puerto 8080")
	// ListenAndServe deja el programa corriendo, esperando peticiones.
	log.Fatal(http.ListenAndServe(":8080", nil))
}