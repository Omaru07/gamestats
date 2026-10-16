package main

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func ev(id, match, game, typ, player string) Event {
	return Event{EventID: id, Timestamp: "2026-10-16T10:00:00Z", GameID: game,
		GameVersion: "1.0", MatchID: match, PlayerID: player, Type: typ,
		Data: map[string]any{}}
}

// esperar vuelve a mirar hasta que la condición se cumpla (la goroutine
// procesa los eventos un instante después de que Submit regresa).
func esperar(t *testing.T, cond func() bool) {
	t.Helper()
	for i := 0; i < 200; i++ {
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
	g := newManager()
	mustSubmit(t, g, ev("1", "A", "racing", "MATCH_STARTED", ""))
	mustSubmit(t, g, ev("2", "B", "combat", "MATCH_STARTED", ""))
	mustSubmit(t, g, ev("3", "A", "racing", "LAP_COMPLETED", "ana"))
	mustSubmit(t, g, ev("4", "B", "combat", "DAMAGE_DEALT", "luis"))
	mustSubmit(t, g, ev("5", "A", "racing", "LAP_COMPLETED", "ana"))
	mustSubmit(t, g, ev("6", "A", "racing", "MATCH_FINISHED", ""))

	esperar(t, func() bool { return infoDe(g, "A").Status == "COMPLETE" })
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
	g := newManager()
	if err := g.Submit(ev("1", "X", "racing", "LAP_COMPLETED", "ana")); err == nil {
		t.Error("evento de partida inexistente debía rechazarse")
	}
}

func TestPartidaYaTerminada(t *testing.T) {
	g := newManager()
	mustSubmit(t, g, ev("1", "A", "racing", "MATCH_STARTED", ""))
	mustSubmit(t, g, ev("2", "A", "racing", "MATCH_FINISHED", ""))
	if err := g.Submit(ev("3", "A", "racing", "LAP_COMPLETED", "ana")); err == nil {
		t.Error("evento de partida terminada debía rechazarse")
	}
}

func TestMatchStartedRepetido(t *testing.T) {
	g := newManager()
	mustSubmit(t, g, ev("1", "A", "racing", "MATCH_STARTED", ""))
	if err := g.Submit(ev("2", "A", "racing", "MATCH_STARTED", "")); err == nil {
		t.Error("segundo MATCH_STARTED de la misma partida debía rechazarse")
	}
}

// Muchas goroutines mandan eventos a la vez a varias partidas.
// Con "go test -race" esto detectaría un mapa sin proteger.
func TestConcurrencia(t *testing.T) {
	g := newManager()
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
		esperar(t, func() bool { return infoDe(g, id).Status == "COMPLETE" })
		if n := infoDe(g, id).EventCount; n != esperado {
			t.Errorf("%s: %d eventos, esperaba %d", id, n, esperado)
		}
	}
}
