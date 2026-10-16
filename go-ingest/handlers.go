package main

import (
	"encoding/json"
	"io"
	"net/http"
)

// writeJSON escribe un código de estado y un cuerpo JSON.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

// eventsHandler atiende POST /events: lee, valida y responde 202 o 400.
func eventsHandler(v *Validator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "usa POST"})
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // máximo 1 MB
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no se pudo leer el cuerpo"})
			return
		}
		var e Event
		if err := json.Unmarshal(body, &e); err != nil {
			v.Reject("JSON mal formado: "+err.Error(), string(body))
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON mal formado: " + err.Error()})
			return
		}
		if err := v.Validate(e); err != nil {
			v.Reject(err.Error(), string(body))
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		// En T3 aquí se enviará el evento a la goroutine de su partida.
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
	}
}

// invalidHandler atiende GET /invalid: lista los eventos rechazados.
func invalidHandler(v *Validator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, v.InvalidList())
	}
}

// healthHandler responde {"status":"ok"} cuando alguien hace GET /health.
func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
