package main

import (
	"fmt"
	"math/rand"
	"sort"
	"time"
)

// Event tiene los mismos campos (y nombres JSON) que el evento que espera Go.
type Event struct {
	EventID     string         `json:"eventId"`
	Timestamp   string         `json:"timestamp"`
	GameID      string         `json:"gameId"`
	GameVersion string         `json:"gameVersion"`
	MatchID     string         `json:"matchId"`
	PlayerID    string         `json:"playerId,omitempty"`
	Type        string         `json:"type"`
	Data        map[string]any `json:"data"`
}

// draft es un evento "en borrador": ocurre en el segundo "at" de la partida
// (tiempo virtual, no real). Al final se ordenan por "at" y se les asigna id y fecha.
type draft struct {
	at     int
	player string
	typ    string
	data   map[string]any
}

// toEvents ordena los borradores por tiempo (el sort estable respeta el orden
// de creación si hay empate) y les pone eventId y timestamp.
func toEvents(ds []draft, matchID, gameID string, base time.Time) []Event {
	sort.SliceStable(ds, func(i, j int) bool { return ds[i].at < ds[j].at })
	out := make([]Event, 0, len(ds))
	for i, d := range ds {
		out = append(out, Event{
			EventID:     fmt.Sprintf("%s-%04d", matchID, i+1),
			Timestamp:   base.Add(time.Duration(d.at) * time.Second).UTC().Format(time.RFC3339),
			GameID:      gameID,
			GameVersion: "1.0",
			MatchID:     matchID,
			PlayerID:    d.player,
			Type:        d.typ,
			Data:        d.data,
		})
	}
	return out
}

// ---------- Carreras ----------

var racers = []string{"ana", "luis", "sofia", "pedro"}
var penaltyReasons = []string{"corte de pista", "choque", "salida falsa"}

// ranks devuelve la posición (1 = va primero) de cada jugador según su tiempo acumulado.
func ranks(cum []int) []int {
	r := make([]int, len(cum))
	for i := range cum {
		r[i] = 1
		for j := range cum {
			if cum[j] < cum[i] || (cum[j] == cum[i] && j < i) {
				r[i]++
			}
		}
	}
	return r
}

// genRacing genera una carrera. Si scripted es true, garantiza una remontada:
// luis hace una primera vuelta lenta (último lugar) y luego remonta hasta ganar.
func genRacing(rng *rand.Rand, scripted bool) []draft {
	n, laps := 3+rng.Intn(2), 3+rng.Intn(3)
	if scripted {
		n, laps = 4, 3
	}
	players := racers[:n]

	lapMs := make([][]int, n) // tiempo de cada vuelta en ms
	pen := make([][]int, n)   // segundos de penalización en cada vuelta
	anyPen := false
	for p := 0; p < n; p++ {
		lapMs[p], pen[p] = make([]int, laps), make([]int, laps)
		base := 78000 + rng.Intn(10001)
		for k := 0; k < laps; k++ {
			lapMs[p][k] = base + rng.Intn(3001) - 1500
			if rng.Intn(5) == 0 {
				pen[p][k] = 5 * (1 + rng.Intn(2))
				anyPen = true
			}
		}
	}
	if scripted {
		bases := []int{80000, 70000, 82000, 84000} // ana, luis, sofia, pedro
		for p := 0; p < n; p++ {
			for k := 0; k < laps; k++ {
				lapMs[p][k] = bases[p] + rng.Intn(3001) - 1500
				pen[p][k] = 0
			}
		}
		lapMs[1][0] = 95000 + rng.Intn(3001) - 1500 // luis sale mal: última vuelta lenta
		pen[0][1] = 5                               // ana recibe una penalización
	} else if !anyPen {
		pen[rng.Intn(n)][rng.Intn(laps)] = 5 // toda carrera tiene al menos una penalización
	}

	ds := []draft{{at: 0, typ: "MATCH_STARTED", data: map[string]any{"players": players, "totalLaps": laps}}}
	for _, p := range players {
		ds = append(ds, draft{at: 0, player: p, typ: "PLAYER_JOINED", data: map[string]any{}})
	}

	cum := make([]int, n)
	prev := make([]int, n)
	lastAt := 0
	for k := 0; k < laps; k++ {
		lapTime := make([]int, n)
		for p := 0; p < n; p++ {
			lapTime[p] = lapMs[p][k] + pen[p][k]*1000
			cum[p] += lapTime[p]
		}
		cur := ranks(cum)
		for p := 0; p < n; p++ {
			at := cum[p] / 1000
			if pen[p][k] > 0 {
				ds = append(ds, draft{at: (cum[p] - lapTime[p]/2) / 1000, player: players[p], typ: "PENALTY_APPLIED",
					data: map[string]any{"lap": k + 1, "seconds": pen[p][k], "reason": penaltyReasons[rng.Intn(len(penaltyReasons))]}})
			}
			ds = append(ds, draft{at: at, player: players[p], typ: "LAP_COMPLETED",
				data: map[string]any{"lap": k + 1, "lapTimeMs": lapTime[p], "position": cur[p]}})
			if k > 0 && cur[p] != prev[p] {
				ds = append(ds, draft{at: at, player: players[p], typ: "POSITION_CHANGED",
					data: map[string]any{"from": prev[p], "to": cur[p]}})
			}
			if at > lastAt {
				lastAt = at
			}
		}
		prev = cur
	}
	winner := players[0]
	for p := range players {
		if prev[p] == 1 {
			winner = players[p]
		}
	}
	return append(ds, draft{at: lastAt + 1, typ: "MATCH_FINISHED", data: map[string]any{"winner": winner}})
}

// ---------- Combate ----------

var weapons = []string{"rifle", "pistola", "escopeta", "cuchillo"}

// genCombat genera un combate de 4 minutos con reapariciones. Si scripted es
// true, garantiza una racha: ana elimina a 3 rivales en 6 segundos.
func genCombat(rng *rand.Rand, scripted bool) []draft {
	n := 3 + rng.Intn(2)
	if scripted {
		n = 4
	}
	players := racers[:n]
	health := map[string]int{}
	deadUntil := map[string]int{}
	kills := map[string]int{}
	for _, p := range players {
		health[p] = 100
	}

	ds := []draft{{at: 0, typ: "MATCH_STARTED", data: map[string]any{"players": players}}}
	for _, p := range players {
		ds = append(ds, draft{at: 0, player: p, typ: "PLAYER_JOINED", data: map[string]any{}})
	}

	hit := func(t int, attacker, target string, amount int, weapon string) {
		ds = append(ds, draft{at: t, player: attacker, typ: "DAMAGE_DEALT",
			data: map[string]any{"target": target, "amount": amount, "weapon": weapon}})
		health[target] -= amount
		if health[target] <= 0 {
			ds = append(ds, draft{at: t, player: attacker, typ: "PLAYER_ELIMINATED",
				data: map[string]any{"target": target, "weapon": weapon}})
			kills[attacker]++
			health[target] = 100
			deadUntil[target] = t + 5 // reaparece 5 s después
		}
	}

	streakDone := false
	t := 2
	for t < 240 {
		if scripted && !streakDone && t >= 60 {
			streakDone = true
			for _, p := range players { // esperar a que todos estén vivos
				if deadUntil[p] > t {
					t = deadUntil[p]
				}
			}
			for _, victim := range players[1:4] {
				hit(t, "ana", victim, health[victim], "escopeta") // un golpe que lo elimina
				t += 3
			}
			continue
		}
		var alive []string
		for _, p := range players {
			if deadUntil[p] <= t {
				alive = append(alive, p)
			}
		}
		if len(alive) < 2 {
			t++
			continue
		}
		a := alive[rng.Intn(len(alive))]
		b := alive[rng.Intn(len(alive))]
		for b == a {
			b = alive[rng.Intn(len(alive))]
		}
		amount := 10 + rng.Intn(31)
		if amount > health[b] {
			amount = health[b]
		}
		hit(t, a, b, amount, weapons[rng.Intn(len(weapons))])
		t += 1 + rng.Intn(3)
	}

	winner := players[0]
	lastAt := 0
	for _, p := range players {
		if kills[p] > kills[winner] {
			winner = p
		}
	}
	for _, d := range ds {
		if d.at > lastAt {
			lastAt = d.at
		}
	}
	return append(ds, draft{at: lastAt + 1, typ: "MATCH_FINISHED", data: map[string]any{"winner": winner}})
}
