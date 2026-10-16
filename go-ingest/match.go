package main

import (
	"fmt"
	"log"
	"slices"
	"sort"
	"sync"
	"time"
)

// Match es una partida activa o terminada. Cada partida tiene su propia
// goroutine (run) que recibe sus eventos por el channel "in".
type Match struct {
	id      string
	gameID  string
	version string
	in      chan Event // tubo por donde llegan los eventos de ESTA partida
	closed  bool       // protegido por Manager.mu: ya llegó MATCH_FINISHED

	mu      sync.Mutex // protege lo de abajo (lo escribe la goroutine, lo lee GET /matches)
	status  string     // ACTIVE, COMPLETE (enviando), SENT o FAILED
	events  []Event
	players map[string]bool
}

// MatchInfo es lo que muestra GET /matches.
type MatchInfo struct {
	MatchID    string   `json:"matchId"`
	GameID     string   `json:"gameId"`
	Status     string   `json:"status"`
	EventCount int      `json:"eventCount"`
	Players    []string `json:"players"`
}

func newMatch(id, gameID, version string) *Match {
	return &Match{
		id: id, gameID: gameID, version: version,
		in:      make(chan Event, 1024),
		status:  "ACTIVE",
		players: make(map[string]bool),
	}
}

// run es la goroutine de la partida: espera eventos en el channel y los
// acumula en orden de llegada. Al llegar MATCH_FINISHED envía la partida a Scala.
func (m *Match) run(send Sender, attempts int, delay time.Duration) {
	for e := range m.in {
		m.mu.Lock()
		m.events = append(m.events, e)
		if e.PlayerID != "" {
			m.players[e.PlayerID] = true
		}
		if e.Type == "MATCH_STARTED" {
			if list, ok := e.Data["players"].([]any); ok {
				for _, p := range list {
					if name, ok := p.(string); ok {
						m.players[name] = true
					}
				}
			}
		}
		if e.Type == "MATCH_FINISHED" {
			m.status = "COMPLETE"
			n := len(m.events)
			m.mu.Unlock()
			log.Printf("partida %s COMPLETE con %d eventos; enviando a Scala", m.id, n)
			m.deliver(send, attempts, delay)
			return // la goroutine termina: la partida ya acabó
		}
		m.mu.Unlock()
	}
}

// payload arma lo que se envía a Scala: los eventos ordenados por timestamp.
// El orden es estable: si dos eventos tienen la misma hora, queda el que llegó primero.
func (m *Match) payload() Payload {
	m.mu.Lock()
	events := slices.Clone(m.events)
	m.mu.Unlock()
	sort.SliceStable(events, func(i, j int) bool {
		return parseTime(events[i].Timestamp).Before(parseTime(events[j].Timestamp))
	})
	return Payload{MatchID: m.id, GameID: m.gameID, GameVersion: m.version, Events: events}
}

func parseTime(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}

// deliver envía la partida a Scala; si falla, reintenta. Deja la partida en SENT o FAILED.
func (m *Match) deliver(send Sender, attempts int, delay time.Duration) {
	p := m.payload()
	var err error
	for i := 1; i <= attempts; i++ {
		if err = send(p); err == nil {
			break
		}
		log.Printf("partida %s: intento %d/%d falló: %v", m.id, i, attempts, err)
		if i < attempts {
			time.Sleep(delay)
		}
	}
	status := "SENT"
	if err != nil {
		status = "FAILED"
	}
	m.mu.Lock()
	m.status = status
	m.mu.Unlock()
	log.Printf("partida %s: %s", m.id, status)
}

// info saca una "foto" de la partida para mostrarla.
func (m *Match) info() MatchInfo {
	m.mu.Lock()
	defer m.mu.Unlock()
	players := make([]string, 0, len(m.players))
	for p := range m.players {
		players = append(players, p)
	}
	slices.Sort(players)
	return MatchInfo{MatchID: m.id, GameID: m.gameID, Status: m.status,
		EventCount: len(m.events), Players: players}
}

// Manager guarda todas las partidas: mapa matchId -> partida.
// Varias peticiones HTTP lo usan a la vez, por eso lo protege un Mutex.
type Manager struct {
	mu       sync.Mutex
	matches  map[string]*Match
	send     Sender        // cómo se envía una partida terminada a Scala
	attempts int           // intentos de envío antes de marcar FAILED
	delay    time.Duration // espera entre intentos
}

func newManager(send Sender) *Manager {
	return &Manager{matches: make(map[string]*Match), send: send, attempts: 3, delay: time.Second}
}

// Submit entrega un evento (ya validado) a la goroutine de su partida.
// Devuelve error si la partida no existe, ya terminó o ya había empezado.
func (g *Manager) Submit(e Event) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	m, exists := g.matches[e.MatchID]
	switch {
	case e.Type == "MATCH_STARTED":
		if exists {
			return fmt.Errorf("la partida %q ya empezó", e.MatchID)
		}
		m = newMatch(e.MatchID, e.GameID, e.GameVersion)
		g.matches[e.MatchID] = m
		go m.run(g.send, g.attempts, g.delay) // nace la goroutine de esta partida
	case !exists:
		return fmt.Errorf("la partida %q no ha empezado (falta MATCH_STARTED)", e.MatchID)
	case m.closed:
		return fmt.Errorf("la partida %q ya terminó", e.MatchID)
	case m.gameID != e.GameID:
		return fmt.Errorf("la partida %q es de %q, no de %q", e.MatchID, m.gameID, e.GameID)
	}

	if e.Type == "MATCH_FINISHED" {
		m.closed = true // desde ahora no se aceptan más eventos
	}
	m.in <- e // el evento entra por el tubo de su partida
	return nil
}

// List devuelve la foto de todas las partidas, ordenadas por matchId.
func (g *Manager) List() []MatchInfo {
	g.mu.Lock()
	matches := make([]*Match, 0, len(g.matches))
	for _, m := range g.matches {
		matches = append(matches, m)
	}
	g.mu.Unlock()

	out := make([]MatchInfo, 0, len(matches))
	for _, m := range matches {
		out = append(out, m.info())
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MatchID < out[j].MatchID })
	return out
}
