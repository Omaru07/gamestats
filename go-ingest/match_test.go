package main

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

// recorder es un "Scala falso": anota cada partida recibida y puede fallar las primeras veces.
type recorder struct {
	mu        sync.Mutex
	calls     int
	payloads  []Payload
	failFirst int
}

func (r *recorder) send(p Payload) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	r.payloads = append(r.payloads, p)
	if r.calls <= r.failFirst {
		return errors.New("scala caído")
	}
	return nil
}

func (r *recorder) numCalls() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.calls
}

// nuevoManager crea un Manager con un Scala falso y sin esperas entre reintentos.
func nuevoManager(failFirst int) (*Manager, *recorder) {
	r := &recorder{failFirst: failFirst}
	g := newManager(r.send)
	g.delay = 0
	return g, r
}

func evAt(id, match, game, typ, player, ts string) Event {
	return Event{EventID: id, Timestamp: ts, GameID: game, GameVersion: "1.0",
		MatchID: match, PlayerID: player, Type: typ, Data: map[string]any{}}
}

func ev(id, match, game, typ, player string) Event {
	return evAt(id, match, game, typ, player, "2026-10-16T10:00:00Z")
}

// esperar vuelve a mirar hasta que la condición se cumpla (la goroutine
// procesa los eventos un instante después de que Submit regresa).
func esperar(t *testing.T, cond func() bool) {
	t.Helper()
	for i := 0; i < 400; i++ {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("se agotó el tiempo esperando la condición")
}

func infoDe(g *Manager, id string) MatchInfo {
	for _, m := range g.List() {
		if m.MatchID == id {
			return m
		}
	}
	return MatchInfo{}
}

func mustSubmit(t *testing.T, g *Manager, e Event) {
	t.Helper()
	if err := g.Submit(e); err != nil {
		t.Fatalf("Submit(%s) falló: %v", e.EventID, err)
	}
}

func TestDosPartidasIntercaladas(t *testing.T) {
	g, _ := nuevoManager(0)
	mustSubmit(t, g, ev("1", "A", "racing", "MATCH_STARTED", ""))
	mustSubmit(t, g, ev("2", "B", "combat", "MATCH_STARTED", ""))
	mustSubmit(t, g, ev("3", "A", "racing", "LAP_COMPLETED", "ana"))
	mustSubmit(t, g, ev("4", "B", "combat", "DAMAGE_DEALT", "luis"))
	mustSubmit(t, g, ev("5", "A", "racing", "LAP_COMPLETED", "ana"))
	mustSubmit(t, g, ev("6", "A", "racing", "MATCH_FINISHED", ""))

	esperar(t, func() bool { return infoDe(g, "A").Status == "SENT" })
	a, b := infoDe(g, "A"), infoDe(g, "B")
	if a.EventCount != 4 || b.EventCount != 2 {
		t.Errorf("A debía tener 4 y B 2; tienen %d y %d", a.EventCount, b.EventCount)
	}
	if b.Status != "ACTIVE" {
		t.Errorf("B debía seguir ACTIVE, está %s", b.Status)
	}
	if len(a.Players) != 1 || a.Players[0] != "ana" {
		t.Errorf("jugadores de A: %v", a.Players)
	}
}

func TestPartidaInexistente(t *testing.T) {
	g, _ := nuevoManager(0)
	if err := g.Submit(ev("1", "X", "racing", "LAP_COMPLETED", "ana")); err == nil {
		t.Error("evento de partida inexistente debía rechazarse")
	}
}

func TestPartidaYaTerminada(t *testing.T) {
	g, _ := nuevoManager(0)
	mustSubmit(t, g, ev("1", "A", "racing", "MATCH_STARTED", ""))
	mustSubmit(t, g, ev("2", "A", "racing", "MATCH_FINISHED", ""))
	if err := g.Submit(ev("3", "A", "racing", "LAP_COMPLETED", "ana")); err == nil {
		t.Error("evento de partida terminada debía rechazarse")
	}
}

func TestMatchStartedRepetido(t *testing.T) {
	g, _ := nuevoManager(0)
	mustSubmit(t, g, ev("1", "A", "racing", "MATCH_STARTED", ""))
	if err := g.Submit(ev("2", "A", "racing", "MATCH_STARTED", "")); err == nil {
		t.Error("segundo MATCH_STARTED de la misma partida debía rechazarse")
	}
}

// Muchas goroutines mandan eventos a la vez a varias partidas.
// Con "go test -race" esto detectaría un mapa sin proteger.
func TestConcurrencia(t *testing.T) {
	g, r := nuevoManager(0)
	const partidas, trabajadores, porTrabajador = 5, 10, 20
	for p := 0; p < partidas; p++ {
		mustSubmit(t, g, ev(fmt.Sprintf("s%d", p), fmt.Sprintf("P%d", p), "racing", "MATCH_STARTED", ""))
	}
	var wg sync.WaitGroup
	for w := 0; w < trabajadores; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 0; i < porTrabajador; i++ {
				for p := 0; p < partidas; p++ {
					g.Submit(ev(fmt.Sprintf("e%d-%d-%d", w, i, p), fmt.Sprintf("P%d", p), "racing", "LAP_COMPLETED", "ana"))
				}
				g.List() // leer mientras otros escriben
			}
		}(w)
	}
	wg.Wait()
	for p := 0; p < partidas; p++ {
		mustSubmit(t, g, ev(fmt.Sprintf("f%d", p), fmt.Sprintf("P%d", p), "racing", "MATCH_FINISHED", ""))
	}
	esperado := 1 + trabajadores*porTrabajador + 1
	for p := 0; p < partidas; p++ {
		id := fmt.Sprintf("P%d", p)
		esperar(t, func() bool { return infoDe(g, id).Status == "SENT" })
		if n := infoDe(g, id).EventCount; n != esperado {
			t.Errorf("%s: %d eventos, esperaba %d", id, n, esperado)
		}
	}
	if r.numCalls() != partidas {
		t.Errorf("Scala debía recibir %d partidas, recibió %d", partidas, r.numCalls())
	}
}

// Los eventos llegan desordenados; Scala debe recibirlos ordenados por timestamp.
func TestEnvioOrdenadoPorTimestamp(t *testing.T) {
	g, r := nuevoManager(0)
	mustSubmit(t, g, evAt("a", "A", "racing", "MATCH_STARTED", "", "2026-10-16T10:00:00Z"))
	mustSubmit(t, g, evAt("b", "A", "racing", "LAP_COMPLETED", "ana", "2026-10-16T10:00:09Z"))
	mustSubmit(t, g, evAt("c", "A", "racing", "LAP_COMPLETED", "luis", "2026-10-16T10:00:05Z"))
	mustSubmit(t, g, evAt("d", "A", "racing", "MATCH_FINISHED", "", "2026-10-16T10:00:10Z"))
	esperar(t, func() bool { return infoDe(g, "A").Status == "SENT" })

	ids := ""
	for _, e := range r.payloads[0].Events {
		ids += e.EventID
	}
	if ids != "acbd" {
		t.Errorf("orden enviado %q, esperaba %q", ids, "acbd")
	}
	if r.payloads[0].MatchID != "A" || r.payloads[0].GameID != "racing" || r.payloads[0].GameVersion != "1.0" {
		t.Errorf("payload mal armado: %+v", r.payloads[0])
	}
}

func TestEnviaUnaSolaVez(t *testing.T) {
	g, r := nuevoManager(0)
	mustSubmit(t, g, ev("1", "A", "racing", "MATCH_STARTED", ""))
	mustSubmit(t, g, ev("2", "A", "racing", "MATCH_FINISHED", ""))
	esperar(t, func() bool { return infoDe(g, "A").Status == "SENT" })
	if r.numCalls() != 1 {
		t.Errorf("Scala debía recibirla 1 vez, la recibió %d", r.numCalls())
	}
}

func TestScalaCaidoMarcaFailed(t *testing.T) {
	g, r := nuevoManager(1000) // siempre falla
	mustSubmit(t, g, ev("1", "A", "racing", "MATCH_STARTED", ""))
	mustSubmit(t, g, ev("2", "A", "racing", "MATCH_FINISHED", ""))
	esperar(t, func() bool { return infoDe(g, "A").Status == "FAILED" })
	if r.numCalls() != 3 {
		t.Errorf("debía intentar 3 veces, intentó %d", r.numCalls())
	}
}

func TestReintentaYTerminaSent(t *testing.T) {
	g, r := nuevoManager(2) // falla 2 veces y a la tercera funciona
	mustSubmit(t, g, ev("1", "A", "racing", "MATCH_STARTED", ""))
	mustSubmit(t, g, ev("2", "A", "racing", "MATCH_FINISHED", ""))
	esperar(t, func() bool { return infoDe(g, "A").Status == "SENT" })
	if r.numCalls() != 3 {
		t.Errorf("debía llamar 3 veces, llamó %d", r.numCalls())
	}
}
