package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// GameConfig son las reglas de un juego, leídas de games/<gameId>.json.
type GameConfig struct {
	GameID         string              `json:"gameId"`
	PlayerRequired []string            `json:"playerRequired"` // tipos que exigen playerId
	Types          map[string][]string `json:"types"`          // tipo -> campos obligatorios de data
}

// loadGames lee todos los .json de una carpeta y devuelve gameId -> config.
// Así, agregar un juego nuevo es solo agregar un archivo: cero cambios de código.
func loadGames(dir string) (map[string]GameConfig, error) {
	files, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no hay archivos .json en %s", dir)
	}
	games := make(map[string]GameConfig)
	for _, f := range files {
		bytes, err := os.ReadFile(f)
		if err != nil {
			return nil, err
		}
		var cfg GameConfig
		if err := json.Unmarshal(bytes, &cfg); err != nil {
			return nil, fmt.Errorf("%s: %w", f, err)
		}
		if cfg.GameID == "" {
			return nil, fmt.Errorf("%s: falta gameId", f)
		}
		games[cfg.GameID] = cfg
	}
	return games, nil
}
