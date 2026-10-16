package main

import "testing"

func testGames() map[string]GameConfig {
	return map[string]GameConfig{
		"racing": {
			GameID:         "racing",
			PlayerRequired: []string{"PLAYER_JOINED", "LAP_COMPLETED"},
			Types: map[string][]string{
				"MATCH_STARTED":  {"players", "totalLaps"},
				"PLAYER_JOINED":  {},
				"LAP_COMPLETED":  {"lap", "lapTimeMs", "position"},
				"MATCH_FINISHED": {},
			},
		},
	}
}

// lap devuelve un LAP_COMPLETED válido; cada test lo modifica para romperlo.
func lap() Event {
	return Event{
		EventID: "e-1", Timestamp: "2026-10-16T10:00:00Z", GameID: "racing",
		GameVersion: "1.0", MatchID: "racing-001", PlayerID: "ana", Type: "LAP_COMPLETED",
		Data: map[string]any{"lap": 1.0, "lapTimeMs": 84000.0, "position": 2.0},
	}
}

func TestValidate(t *testing.T) {
	casos := []struct {
		nombre string
		edita  func(e *Event)
		valido bool
	}{
		{"evento válido", func(e *Event) {}, true},
		{"MATCH_STARTED válido sin playerId", func(e *Event) {
			e.Type, e.PlayerID = "MATCH_STARTED", ""
			e.Data = map[string]any{"players": []any{"ana"}, "totalLaps": 3.0}
		}, true},
		{"sin matchId", func(e *Event) { e.MatchID = "" }, false},
		{"tipo desconocido", func(e *Event) { e.Type = "TELEPORT" }, false},
		{"falta campo de data", func(e *Event) { delete(e.Data, "lapTimeMs") }, false},
		{"timestamp mal formado", func(e *Event) { e.Timestamp = "ayer por la tarde" }, false},
		{"gameId sin config", func(e *Event) { e.GameID = "ajedrez" }, false},
		{"falta playerId donde es obligatorio", func(e *Event) { e.PlayerID = "" }, false},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			v := newValidator(testGames()) // validador nuevo en cada caso
			e := lap()
			c.edita(&e)
			err := v.Validate(e)
			if c.valido && err != nil {
				t.Errorf("debía ser válido, pero dio error: %v", err)
			}
			if !c.valido && err == nil {
				t.Errorf("debía ser inválido, pero pasó")
			}
		})
	}
}

func TestEventIdRepetido(t *testing.T) {
	v := newValidator(testGames())
	if err := v.Validate(lap()); err != nil {
		t.Fatalf("el primero debía pasar: %v", err)
	}
	if err := v.Validate(lap()); err == nil {
		t.Error("el segundo (mismo eventId) debía rechazarse")
	}
}
