#!/usr/bin/env bash
# Smoke test del Proyecto 2: todo pasa por la consola (nginx), igual que en el navegador.
#  1. La consola sirve la página.
#  2. La IA de Prolog responde una jugada (y tapa un 4 en línea).
#  3. Una partida completa de cada juego nuevo llega a GameStats (Go la acepta).
#  4. Go las cuenta en /instances y Scala las analiza (/games/<id>/stats y /stats).
# Uso: scripts/smoke-consola.sh [URL de la consola]   (por defecto http://localhost:8000)
set -euo pipefail

BASE="${1:-http://localhost:8000}"
RUN="smoke-$(date +%s)-$RANDOM" # prefijo único: se puede correr varias veces sin reiniciar
N=0

# Lee el JSON de la entrada y escribe el valor de la expresión (JavaScript; usa Node, que ya
# está instalado para la consola, así funciona igual en Linux y en Git Bash de Windows).
json() { node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);console.log($1)})"; }

evento() { # evento <matchId> <gameId> <type> <playerId|-> <data JSON>
  N=$((N + 1))
  local player=""
  [ "$4" != "-" ] && player="\"playerId\":\"$4\","
  local cuerpo="{\"eventId\":\"$RUN-$N\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",\"gameId\":\"$2\",\"gameVersion\":\"1.0\",\"matchId\":\"$1\",${player}\"type\":\"$3\",\"data\":$5}"
  local codigo
  codigo=$(curl -s -o /tmp/smoke-resp.txt -w '%{http_code}' -X POST "$BASE/api/ingest/events" \
    -H 'Content-Type: application/json' -d "$cuerpo")
  if [ "$codigo" != "202" ]; then
    echo "FALLO: $3 de $2 respondió $codigo: $(cat /tmp/smoke-resp.txt)"
    exit 1
  fi
}

echo "== 1. La consola sirve la página"
curl -fsS "$BASE/" | grep -q '<div id="app">'
echo "ok"

echo "== 2. La IA en Prolog tapa el 4 en línea"
TABLERO="...................................RRR.YY."
IA=$(curl -fsS -X POST "$BASE/api/ai/move" -H 'Content-Type: application/json' \
  -d "{\"board\":\"$TABLERO\",\"player\":\"Y\",\"depth\":5}")
echo "$IA"
[ "$(echo "$IA" | json 'd["column"]')" = "3" ]
[ "$(echo "$IA" | json 'd["reason"]')" = "block" ]

echo "== 3. Una partida de cada juego nuevo"
M="$RUN-c4"
evento "$M" connect4 MATCH_STARTED - '{"players":["smoke","cpu"],"difficulty":"hard"}'
evento "$M" connect4 PLAYER_JOINED smoke '{}'
evento "$M" connect4 PLAYER_JOINED cpu '{}'
evento "$M" connect4 MOVE smoke '{"column":3,"row":5,"piece":"R","moveNumber":1}'
evento "$M" connect4 AI_DECISION cpu "{\"column\":3,\"board\":\"$TABLERO\",\"score\":5,\"nodesExplored\":900,\"depth\":5,\"thinkMs\":40,\"reason\":\"block\"}"
evento "$M" connect4 MOVE cpu '{"column":3,"row":4,"piece":"Y","moveNumber":2}'
evento "$M" connect4 MATCH_FINISHED - '{"result":"LOSS","winner":"cpu"}'

M="$RUN-snake"
evento "$M" snake MATCH_STARTED - '{"players":["smoke"],"gridSize":20}'
evento "$M" snake PLAYER_JOINED smoke '{}'
evento "$M" snake FOOD_EATEN smoke '{"score":10,"length":4}'
evento "$M" snake PLAYER_DIED smoke '{"cause":"wall","score":10,"length":4}'
evento "$M" snake MATCH_FINISHED - '{"result":"LOSS"}'

M="$RUN-nd"
evento "$M" nightdrive MATCH_STARTED - '{"players":["smoke"],"lanes":4,"lives":3}'
evento "$M" nightdrive PLAYER_JOINED smoke '{}'
evento "$M" nightdrive LANE_CHANGED smoke '{"from":1,"to":2}'
evento "$M" nightdrive CAR_DODGED smoke '{"score":10,"speed":120}'
evento "$M" nightdrive CRASHED smoke '{"livesLeft":0,"score":10,"speed":126}'
evento "$M" nightdrive MATCH_FINISHED - '{"result":"LOSS"}'
echo "ok: $N eventos aceptados"

echo "== 4. GameStats las cuenta y las analiza"
for juego in connect4 snake nightdrive; do
  n=0
  for _ in $(seq 1 30); do
    n=$(curl -fsS "$BASE/api/stats/games/$juego/stats" | json 'Math.trunc(d.matches)')
    [ "$n" -ge 1 ] && break
    sleep 1
  done
  echo "$juego: $n partida(s) analizada(s)"
  [ "$n" -ge 1 ]
  total=$(curl -fsS "$BASE/api/ingest/instances" | json "d.games.find(g => g.gameId === '$juego').total")
  [ "$total" -ge 1 ]
done
curl -fsS "$BASE/api/stats/stats" | json 'd.general.totalMatches' | grep -qv '^0$'
curl -fsS "$BASE/api/stats/matches/$RUN-c4" | grep -q AI_BLOCK
echo "OK: la consola, la IA y GameStats funcionan juntas."
