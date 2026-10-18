package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// scalaMatch es el resumen de una partida tal como lo devuelve GET /matches de Scala.
// El simulador NO analiza nada: solo lee lo que Scala ya calculó, para mostrarlo.
type scalaMatch struct {
	MatchID  string           `json:"matchId"`
	GameID   string           `json:"gameId"`
	Match    map[string]any   `json:"match"`
	Patterns []map[string]any `json:"patterns"`
}

// fetchResults consulta GET <base>/matches hasta que Scala haya analizado todas las
// partidas de ids (Scala termina de analizar un instante después de que Go las envía),
// o se acabe el tiempo. Devuelve lo último que obtuvo.
func fetchResults(client *http.Client, base string, ids []string, wait time.Duration) ([]scalaMatch, error) {
	deadline := time.Now().Add(wait)
	var last []scalaMatch
	var lastErr error
	for {
		ms, err := getMatches(client, base)
		if err == nil {
			last, lastErr = ms, nil
			if countPresent(ms, ids) == len(ids) {
				return ms, nil
			}
		} else {
			lastErr = err
		}
		if time.Now().After(deadline) {
			if lastErr == nil {
				lastErr = fmt.Errorf("Scala analizó %d de %d partidas tras %s", countPresent(last, ids), len(ids), wait)
			}
			return last, lastErr
		}
		time.Sleep(300 * time.Millisecond)
	}
}

func getMatches(client *http.Client, base string) ([]scalaMatch, error) {
	resp, err := client.Get(base + "/matches")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var ms []scalaMatch
	if err := json.Unmarshal(body, &ms); err != nil {
		return nil, fmt.Errorf("respuesta inesperada de Scala: %w", err)
	}
	return ms, nil
}

func countPresent(ms []scalaMatch, ids []string) int {
	have := map[string]bool{}
	for _, m := range ms {
		have[m.MatchID] = true
	}
	n := 0
	for _, id := range ids {
		if have[id] {
			n++
		}
	}
	return n
}

// formatReport arma una línea por partida (en el orden de ids): ganador y patrones detectados.
func formatReport(results []scalaMatch, ids []string) string {
	byID := map[string]scalaMatch{}
	for _, m := range results {
		byID[m.MatchID] = m
	}
	var b strings.Builder
	for _, id := range ids {
		m, ok := byID[id]
		if !ok {
			fmt.Fprintf(&b, "  %-12s (Scala todavía no la analizó)\n", id)
			continue
		}
		winner, _ := m.Match["winner"].(string)
		patterns := "ninguno"
		if len(m.Patterns) > 0 {
			descs := make([]string, 0, len(m.Patterns))
			for _, p := range m.Patterns {
				descs = append(descs, describePattern(p))
			}
			patterns = strings.Join(descs, "; ")
		}
		fmt.Fprintf(&b, "  %-12s ganador=%-6s patrones: %s\n", id, winner, patterns)
	}
	return b.String()
}

// describePattern: "KILL_STREAK de ana (kills=3, windowSeconds=6, ...)".
func describePattern(p map[string]any) string {
	kind, _ := p["type"].(string)
	player, _ := p["playerId"].(string)
	keys := make([]string, 0, len(p))
	for k := range p {
		if k != "type" && k != "playerId" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%v", k, p[k]))
	}
	return fmt.Sprintf("%s de %s (%s)", kind, player, strings.Join(parts, ", "))
}
