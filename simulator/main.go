package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// plan es una partida lista para enviarse.
type plan struct {
	id     string
	events []Event
	rng    *rand.Rand
	dup    bool // esta partida reenvía un evento a propósito (duplicado)
}

type stats struct{ accepted, rejected, unexpected, errs atomic.Int64 }

// check anota el resultado de un POST y avisa si no fue el esperado (want).
func (s *stats) check(label string, status int, body string, err error, want int) {
	if err != nil {
		s.errs.Add(1)
		log.Printf("ERROR de red (%s): %v", label, err)
		return
	}
	switch status {
	case 202:
		s.accepted.Add(1)
	case 400:
		s.rejected.Add(1)
	}
	if status != want {
		s.unexpected.Add(1)
		log.Printf("INESPERADO %s: esperaba %d y recibí %d %s", label, want, status, body)
	}
}

func post(client *http.Client, url string, payload any) (int, string, error) {
	b, _ := json.Marshal(payload)
	resp, err := client.Post(url+"/events", "application/json", bytes.NewReader(b))
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, strings.TrimSpace(string(body)), nil
}

// invalidEvents son eventos incorrectos a propósito, para demostrar la validación de Go.
func invalidEvents(prefix string) []struct {
	name  string
	event map[string]any
} {
	ts := "2026-10-16T10:00:00Z"
	return []struct {
		name  string
		event map[string]any
	}{
		{"sin matchId", map[string]any{"eventId": "invalido-01", "timestamp": ts, "gameId": "racing",
			"gameVersion": "1.0", "type": "MATCH_FINISHED", "data": map[string]any{}}},
		{"tipo desconocido", map[string]any{"eventId": "invalido-02", "timestamp": ts, "gameId": "racing",
			"gameVersion": "1.0", "matchId": prefix + "racing-001", "playerId": "ana", "type": "TELEPORT", "data": map[string]any{}}},
		{"falta data.amount", map[string]any{"eventId": "invalido-03", "timestamp": ts, "gameId": "combat",
			"gameVersion": "1.0", "matchId": prefix + "combat-001", "playerId": "ana", "type": "DAMAGE_DEALT",
			"data": map[string]any{"target": "luis", "weapon": "rifle"}}},
		{"timestamp mal formado", map[string]any{"eventId": "invalido-04", "timestamp": "ayer por la tarde", "gameId": "racing",
			"gameVersion": "1.0", "matchId": prefix + "racing-001", "playerId": "ana", "type": "LAP_COMPLETED",
			"data": map[string]any{"lap": 1, "lapTimeMs": 80000, "position": 1}}},
	}
}

func main() {
	defURL := os.Getenv("INGEST_URL")
	if defURL == "" {
		defURL = "http://localhost:8080"
	}
	url := flag.String("url", defURL, "dirección base de Go (también variable INGEST_URL)")
	seed := flag.Int64("seed", 0, "semilla para repetir la misma simulación (0 = aleatoria)")
	nRacing := flag.Int("racing", 3, "cantidad de partidas de carreras")
	nCombat := flag.Int("combat", 3, "cantidad de partidas de combate")
	prefix := flag.String("prefix", "", "prefijo para los matchId (para repetir sin reiniciar Go, ej. -prefix r2-)")
	maxPause := flag.Int("pause", 20, "pausa máxima entre eventos en ms (0 = sin pausa)")
	dry := flag.Bool("dry", false, "solo imprimir los eventos, sin enviarlos")
	flag.Parse()

	if *seed == 0 {
		*seed = time.Now().UnixNano()
	}
	log.Printf("semilla: %d (usa -seed %d para repetir esta simulación)", *seed, *seed)

	// 1. Generar todas las partidas. La primera de cada juego es la "especial"
	// (racha garantizada en combate, remontada garantizada en carreras).
	var plans []plan
	start := time.Date(2026, 10, 16, 10, 0, 0, 0, time.UTC)
	add := func(game string, i, j int, gen func(*rand.Rand, bool) []draft) {
		id := fmt.Sprintf("%s%s-%03d", *prefix, game, i+1)
		rng := rand.New(rand.NewSource(*seed + int64(j)*1000003))
		ds := gen(rng, i == 0)
		plans = append(plans, plan{id: id, rng: rng, dup: j == 0,
			events: toEvents(ds, id, game, start.Add(time.Duration(j)*10*time.Minute))})
	}
	for i := 0; i < *nRacing; i++ {
		add("racing", i, len(plans), genRacing)
	}
	for i := 0; i < *nCombat; i++ {
		add("combat", i, len(plans), genCombat)
	}

	if *dry {
		for _, p := range plans {
			for _, e := range p.events {
				b, _ := json.Marshal(e)
				fmt.Println(string(b))
			}
		}
		return
	}

	// 2. Comprobar que Go está vivo.
	client := &http.Client{Timeout: 5 * time.Second}
	if resp, err := client.Get(*url + "/health"); err != nil {
		log.Fatalf("No pude conectar con Go en %s: %v\n¿Está corriendo 'go run .' en go-ingest?", *url, err)
	} else {
		resp.Body.Close()
	}

	// 3. Enviar: una goroutine por partida, todas a la vez.
	var s stats
	var wg sync.WaitGroup
	began := time.Now()
	total := 0
	for _, p := range plans {
		total += len(p.events)
		wg.Add(1)
		go func(p plan) {
			defer wg.Done()
			for k, e := range p.events {
				status, body, err := post(client, *url, e)
				s.check(p.id+" "+e.Type, status, body, err, 202)
				if p.dup && k == 2 { // reenviar el mismo evento: debe rechazarse por duplicado
					status, body, err = post(client, *url, e)
					log.Printf("duplicado (%s) -> %d %s", e.EventID, status, body)
					s.check("duplicado "+e.EventID, status, body, err, 400)
				}
				if *maxPause > 0 {
					time.Sleep(time.Duration(p.rng.Intn(*maxPause+1)) * time.Millisecond)
				}
			}
			log.Printf("%s: %d eventos enviados", p.id, len(p.events))
		}(p)
	}
	// Eventos inválidos a propósito, mientras las partidas corren.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for _, c := range invalidEvents(*prefix) {
			if *maxPause > 0 {
				time.Sleep(300 * time.Millisecond)
			}
			status, body, err := post(client, *url, c.event)
			log.Printf("inválido (%s) -> %d %s", c.name, status, body)
			s.check("inválido "+c.name, status, body, err, 400)
		}
	}()
	wg.Wait()

	// 4. Resumen.
	fmt.Printf("\n=== Resumen ===\nPartidas: %d · eventos válidos generados: %d · tiempo: %s\n",
		len(plans), total, time.Since(began).Round(time.Millisecond))
	fmt.Printf("Aceptados (202): %d · Rechazados (400): %d (se esperaban %d a propósito)\n",
		s.accepted.Load(), s.rejected.Load(), len(invalidEvents(*prefix))+1)
	if s.unexpected.Load() == 0 && s.errs.Load() == 0 {
		fmt.Println("OK: todo se comportó como se esperaba.")
	} else {
		fmt.Printf("ATENCIÓN: %d resultados inesperados, %d errores de red.\n", s.unexpected.Load(), s.errs.Load())
		os.Exit(1)
	}
}
