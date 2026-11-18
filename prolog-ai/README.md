# IA de Conecta 4 en Prolog

Servicio en SWI-Prolog que decide la jugada de la computadora en Conecta 4. La consola web le manda el tablero y Prolog responde en qué columna jugar y por qué.

## Cómo se usa

```
POST http://localhost:8082/move
{ "board": "<42 caracteres>", "player": "Y", "depth": 5 }

-> { "column": 3, "score": 9, "nodesExplored": 1830, "depth": 5, "reason": "block" }
```

(`score` y `nodesExplored` son de ejemplo: dependen del tablero.)

- **board:** las 42 casillas en texto, fila de **arriba** primero y de izquierda a derecha: `.` vacía, `R` roja, `Y` amarilla. La casilla de la fila F y la columna C está en la posición `F*7 + C`.
- **player:** la ficha de la computadora (`R` o `Y`).
- **depth:** cuántas jugadas mira hacia adelante (de 1 a 7; por defecto 5).
- **reason:** `win` (gana en esta jugada), `block` (tapa una jugada ganadora del rival) o `minimax` (la eligió la búsqueda).
- `GET /health` responde `{"status":"ok"}`.

Si el tablero o la ficha no son válidos, responde `400` con `{"error": "..."}`.

Para probarlo a mano, con el servicio corriendo:

```
curl.exe -X POST http://localhost:8082/move -H "Content-Type: application/json" -d "@prolog-ai/ejemplo-move.json"
```

El ejemplo tiene tres rojas seguidas abajo y le toca a la amarilla: la respuesta es `"column":3, "reason":"block"`.

## Cómo decide

La decisión pasa por tres reglas, en este orden (`best_move/5` en `connect4.pl`):

1. **Si puedo ganar ahora, gano.** Prueba cada columna y revisa si la ficha forma 4 en línea.
2. **Si el rival gana en su próxima jugada, lo tapo.**
3. **Si no, busco con minimax.**

### Minimax

La computadora imagina cada jugada posible, luego cada respuesta del rival, luego cada respuesta suya, y así hasta 5 jugadas hacia adelante. Supone que el rival siempre elige lo mejor para él y escoge la jugada que le deja el mejor resultado en el peor caso.

Se usa la variante **negamax**: lo que es bueno para un jugador es igual de malo para el otro, así que el valor de una jugada es el negativo de lo mejor que puede hacer el rival después. Así la regla se escribe una sola vez (`move_value/7` y `negamax/6`).

### Poda alfa-beta

Mirar todo a 5 jugadas son hasta 7⁵ = 16 807 tableros. La poda evita revisar ramas que no pueden cambiar la decisión: si ya se sabe que una jugada es peor que otra que se encontró antes, no se sigue explorando. Probar primero las columnas del centro (`valid_moves/2`) hace que la poda corte antes. `nodesExplored` en la respuesta dice cuántos tableros se revisaron de verdad.

### Heurística

Como no se llega al final de la partida, al llegar a la profundidad límite se le pone un puntaje al tablero (`evaluate/3`). Se revisan las 69 "ventanas" de 4 casillas donde se puede hacer 4 en línea:

| Ventana | Puntos |
|---|---|
| 3 mías y 1 vacía | +5 |
| 2 mías y 2 vacías | +2 |
| 3 del rival y 1 vacía | −4 |

A eso se le suman 3 puntos por cada ficha propia en la columna central (y se restan 3 por cada ficha del rival), porque es la que participa en más líneas posibles. Ganar vale 100 000 más la profundidad que queda: ganar antes vale más que ganar después.

## Por qué Prolog

Las reglas del juego se escriben como hechos y relaciones (`wins_at`, `four_from`, `window`) y Prolog busca las soluciones solo: `findall(W, window(W), Ws)` genera todas las ventanas a partir de su descripción, y `member` junto con `winning_drop` encuentran una jugada ganadora sin escribir el ciclo a mano.

## Concurrencia

El servidor HTTP de SWI-Prolog atiende cada petición en un hilo distinto. El contador de nodos usa variables globales de SWI, que son propias de cada hilo, así que dos partidas que piden jugada al mismo tiempo no mezclan sus cuentas.

## Pruebas

`tests.pl` (plunit) revisa la lectura del tablero, ganar en horizontal, vertical y diagonal, bloquear, preferir ganar antes que bloquear, detectar una derrota inevitable, no elegir una columna llena, una partida completa de la IA contra sí misma y el tiempo de respuesta. Corren solas al construir la imagen; para correrlas a mano:

```
docker run --rm -v "%cd%/prolog-ai:/app" -w /app swipl:stable swipl -g run_tests -t halt tests.pl
```
