package main

import (
	"fmt"
	"slices"
	"sync"
	"time"
)

// Invalid es un evento rechazado, con el motivo.
type Invalid struct {
	Reason     string `json:"reason"`
	Raw        string `json:"raw"`
	ReceivedAt string `json:"receivedAt"`
}

// Validator decide si un evento pasa o no. Guarda los eventIds vistos y la
// lista de inválidos. Varias peticiones HTTP lo usan a la vez (cada una corre
// en su propia goroutine), por eso protege sus datos con un Mutex.
type Validator struct {
	mu      sync.Mutex
	games   map[string]GameConfig
	seen    map[string]bool
	invalid []Invalid
}

func newValidator(games map[string]GameConfig) *Validator {
	return &Validator{games: games, seen: make(map[string]bool), invalid: []Invalid{}}
}

// Validate devuelve nil si el evento es válido, o un error con el motivo.
// Si es válido, además recuerda su eventId para detectar duplicados.
func (v *Validator) Validate(e Event) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	// 1. Campos comunes obligatorios.
	required := map[string]string{
		"eventId": e.EventID, "timestamp": e.Timestamp, "gameId": e.GameID,
		"gameVersion": e.GameVersion, "matchId": e.MatchID, "type": e.Type,
	}
	for _, name := range []string{"eventId", "timestamp", "gameId", "gameVersion", "matchId", "type"} {
		if required[name] == "" {
			return fmt.Errorf("falta el campo %s", name)
		}
	}

	// 2. Timestamp en formato ISO-8601.
	if _, err := time.Parse(time.RFC3339, e.Timestamp); err != nil {
		return fmt.Errorf("timestamp mal formado: %q", e.Timestamp)
	}

	// 3. El juego debe tener config.
	cfg, ok := v.games[e.GameID]
	if !ok {
		return fmt.Errorf("gameId %q no tiene configuración", e.GameID)
	}

	// 4. El tipo debe existir en la config del juego.
	fields, ok := cfg.Types[e.Type]
	if !ok {
		return fmt.Errorf("tipo %q desconocido para el juego %q", e.Type, e.GameID)
	}

	// 5. playerId, si el tipo lo exige.
	if slices.Contains(cfg.PlayerRequired, e.Type) && e.PlayerID == "" {
		return fmt.Errorf("el tipo %s requiere playerId", e.Type)
	}

	// 6. Campos obligatorios dentro de data.
	for _, f := range fields {
		if _, present := e.Data[f]; !present {
			return fmt.Errorf("falta data.%s para el tipo %s", f, e.Type)
		}
	}

	// 7. eventId no repetido (se revisa al final para no "gastar" ids de eventos inválidos).
	if v.seen[e.EventID] {
		return fmt.Errorf("eventId %q repetido", e.EventID)
	}
	v.seen[e.EventID] = true
	return nil
}

// Reject guarda un evento rechazado junto con su motivo.
func (v *Validator) Reject(reason, raw string) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if len(raw) > 500 {
		raw = raw[:500] + "..."
	}
	v.invalid = append(v.invalid, Invalid{
		Reason: reason, Raw: raw, ReceivedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// InvalidList devuelve una copia de la lista de rechazados.
func (v *Validator) InvalidList() []Invalid {
	v.mu.Lock()
	defer v.mu.Unlock()
	return slices.Clone(v.invalid)
}
