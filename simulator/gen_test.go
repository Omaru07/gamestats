package main

import (
	"math/rand"
	"sort"
	"testing"
)

// Verifica que la partida "especial" SIEMPRE contiene el patrón, con muchas semillas.
func TestRachaGarantizada(t *testing.T) {
	for seed := int64(1); seed <= 50; seed++ {
		ds := genCombat(rand.New(rand.NewSource(seed)), true)
		elim := map[string][]int{}
		for _, d := range ds {
			if d.typ == "PLAYER_ELIMINATED" {
				elim[d.player] = append(elim[d.player], d.at)
			}
		}
		ok := false
		for _, times := range elim {
			sort.Ints(times)
			for i := 0; i+2 < len(times); i++ {
				if times[i+2]-times[i] <= 10 {
					ok = true
				}
			}
		}
		if !ok {
			t.Fatalf("semilla %d: no hay racha de 3 eliminaciones en 10 s", seed)
		}
	}
}

func TestRemontadaGarantizada(t *testing.T) {
	for seed := int64(1); seed <= 50; seed++ {
		ds := genRacing(rand.New(rand.NewSource(seed)), true)
		wasLast := map[string]bool{}
		final := map[string]int{}
		for _, d := range ds {
			if d.typ == "LAP_COMPLETED" {
				pos := d.data["position"].(int)
				if pos == 4 {
					wasLast[d.player] = true
				}
				final[d.player] = pos // la última vuelta de cada jugador queda al final
			}
		}
		ok := false
		for p := range wasLast {
			if final[p] <= 3 {
				ok = true
			}
		}
		if !ok {
			t.Fatalf("semilla %d: no hay remontada", seed)
		}
	}
}

func TestMismaSemillaMismosEventos(t *testing.T) {
	a := genCombat(rand.New(rand.NewSource(7)), false)
	b := genCombat(rand.New(rand.NewSource(7)), false)
	if len(a) != len(b) {
		t.Fatal("misma semilla debe dar mismo número de eventos")
	}
}
