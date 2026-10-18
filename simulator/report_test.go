package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Formato real de GET /matches de Scala (resumen de cada partida).
const muestra = `[
 {"matchId":"combat-001","gameId":"combat","players":4,"match":{"winner":"luis"},
  "patterns":[{"type":"KILL_STREAK","playerId":"ana","kills":3,"windowSeconds":6,"startedAt":"2026-10-16T10:31:00Z"}]},
 {"matchId":"racing-002","gameId":"racing","players":4,"match":{"winner":"pedro"},"patterns":[]}
]`

func TestFormatReport(t *testing.T) {
	var ms []scalaMatch
	if err := json.Unmarshal([]byte(muestra), &ms); err != nil {
		t.Fatal(err)
	}
	out := formatReport(ms, []string{"combat-001", "racing-002", "racing-009"})
	for _, quiero := range []string{
		"combat-001", "ganador=luis", "KILL_STREAK de ana", "kills=3", "windowSeconds=6",
		"racing-002", "ganador=pedro", "patrones: ninguno",
		"racing-009", "todavía no la analizó",
	} {
		if !strings.Contains(out, quiero) {
			t.Errorf("falta %q en:\n%s", quiero, out)
		}
	}
}

// Scala tarda un instante en analizar: la primera consulta trae 1 partida y la segunda las 2.
func TestFetchResultsEspera(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			fmt.Fprint(w, `[{"matchId":"a","gameId":"x","match":{},"patterns":[]}]`)
			return
		}
		fmt.Fprint(w, `[{"matchId":"a","gameId":"x","match":{},"patterns":[]},{"matchId":"b","gameId":"x","match":{},"patterns":[]}]`)
	}))
	defer srv.Close()
	ms, err := fetchResults(srv.Client(), srv.URL, []string{"a", "b"}, 5*time.Second)
	if err != nil || len(ms) != 2 {
		t.Fatalf("esperaba 2 partidas sin error; obtuve %d, err=%v", len(ms), err)
	}
}

func TestFetchResultsSeAgotaElTiempo(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[]`)
	}))
	defer srv.Close()
	if _, err := fetchResults(srv.Client(), srv.URL, []string{"a"}, 600*time.Millisecond); err == nil {
		t.Error("debía dar error al agotarse el tiempo")
	}
}

func TestFetchResultsScalaApagado(t *testing.T) {
	if _, err := fetchResults(http.DefaultClient, "http://127.0.0.1:1", []string{"a"}, 500*time.Millisecond); err == nil {
		t.Error("debía dar error si Scala no responde")
	}
}
