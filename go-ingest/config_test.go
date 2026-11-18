package main

import (
	"slices"
	"testing"
)

// Los archivos reales de games/ se cargan sin error y traen los 5 juegos.
func TestCargaLosJuegosReales(t *testing.T) {
	games, err := loadGames("../games")
	if err != nil {
		t.Fatal(err)
	}
	quiero := []string{"combat", "connect4", "nightdrive", "racing", "snake"}
	if got := gameIDs(games); !slices.Equal(got, quiero) {
		t.Fatalf("juegos cargados %v, esperaba %v", got, quiero)
	}
	// Cada juego nuevo cierra su partida con un result obligatorio.
	for _, id := range []string{"connect4", "nightdrive", "snake"} {
		if !slices.Contains(games[id].Types["MATCH_FINISHED"], "result") {
			t.Errorf("%s: MATCH_FINISHED debe exigir data.result", id)
		}
	}
}

// Un evento válido de cada juego nuevo pasa la validación; si le falta un campo, no.
func TestValidaEventosDeLosJuegosNuevos(t *testing.T) {
	games, err := loadGames("../games")
	if err != nil {
		t.Fatal(err)
	}
	base := func(game, typ, player string, data map[string]any) Event {
		return Event{EventID: game + typ, Timestamp: "2026-11-18T17:00:00.123Z", GameID: game,
			GameVersion: "1.0", MatchID: "m1", PlayerID: player, Type: typ, Data: data}
	}
	validos := []Event{
		base("connect4", "AI_DECISION", "cpu", map[string]any{"column": 3.0, "board": "..........",
			"score": 12.0, "nodesExplored": 4000.0, "depth": 5.0, "thinkMs": 80.0, "reason": "minimax"}),
		base("snake", "PLAYER_DIED", "omar", map[string]any{"cause": "wall", "score": 7.0, "length": 10.0}),
		base("nightdrive", "CRASHED", "omar", map[string]any{"livesLeft": 2.0, "score": 30.0, "speed": 5.0}),
	}
	for _, e := range validos {
		if err := newValidator(games).Validate(e); err != nil {
			t.Errorf("%s %s debía ser válido: %v", e.GameID, e.Type, err)
		}
	}
	sinCampo := base("nightdrive", "CRASHED", "omar", map[string]any{"score": 30.0, "speed": 5.0})
	if err := newValidator(games).Validate(sinCampo); err == nil {
		t.Error("CRASHED sin livesLeft debía rechazarse")
	}
	sinJugador := base("connect4", "MOVE", "", map[string]any{"column": 1.0, "row": 0.0, "piece": "R", "moveNumber": 1.0})
	if err := newValidator(games).Validate(sinJugador); err == nil {
		t.Error("MOVE sin playerId debía rechazarse")
	}
}
