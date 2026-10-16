package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Payload es lo que Go le manda a Scala: la partida completa (SPEC §6).
type Payload struct {
	MatchID     string  `json:"matchId"`
	GameID      string  `json:"gameId"`
	GameVersion string  `json:"gameVersion"`
	Events      []Event `json:"events"`
}

// Sender envía una partida a Scala. Es una función para poder cambiarla en
// los tests por una falsa, sin necesidad de tener Scala encendido.
type Sender func(p Payload) error

// newHTTPSender crea el Sender real: POST <baseURL>/analyze. Solo 200 cuenta como éxito.
func newHTTPSender(baseURL string) Sender {
	client := &http.Client{Timeout: 10 * time.Second}
	return func(p Payload) error {
		body, err := json.Marshal(p)
		if err != nil {
			return err
		}
		resp, err := client.Post(baseURL+"/analyze", "application/json", bytes.NewReader(body))
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		io.Copy(io.Discard, resp.Body)
		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("Scala respondió con código %d", resp.StatusCode)
		}
		return nil
	}
}
