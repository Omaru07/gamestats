package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// GET /instances responde el total y una entrada por juego configurado.
func TestInstancesHandler(t *testing.T) {
	g, _ := nuevoManager(0)
	mustSubmit(t, g, ev("1", "nd-a", "nightdrive", "MATCH_STARTED", ""))

	rec := httptest.NewRecorder()
	instancesHandler(g, []string{"connect4", "nightdrive", "snake"})(rec, httptest.NewRequest(http.MethodGet, "/instances", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("código %d, esperaba 200", rec.Code)
	}
	var body struct {
		Total int             `json:"total"`
		Games []GameInstances `json:"games"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("JSON inválido: %v\n%s", err, rec.Body.String())
	}
	if body.Total != 1 || len(body.Games) != 3 {
		t.Fatalf("esperaba total 1 y 3 juegos; obtuve %s", rec.Body.String())
	}
	if body.Games[1].GameID != "nightdrive" || body.Games[1].Active != 1 {
		t.Errorf("nightdrive debía tener 1 activa: %+v", body.Games[1])
	}
}
