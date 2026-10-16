package main

// Event es un evento de una partida, tal como llega por POST /events.
// Las etiquetas `json:"..."` dicen cómo se llama cada campo en el JSON.
type Event struct {
	EventID     string         `json:"eventId"`
	Timestamp   string         `json:"timestamp"`
	GameID      string         `json:"gameId"`
	GameVersion string         `json:"gameVersion"`
	MatchID     string         `json:"matchId"`
	PlayerID    string         `json:"playerId,omitempty"`
	Type        string         `json:"type"`
	Action      string         `json:"action,omitempty"`
	Data        map[string]any `json:"data"`
}
