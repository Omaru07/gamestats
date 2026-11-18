% connect4.pl — IA de Conecta 4: minimax (variante negamax) con poda alfa-beta.
%
% Tablero: 7 columnas x 6 filas. Internamente es una lista de 7 columnas y cada
% columna es la lista de sus fichas DE ABAJO HACIA ARRIBA. Así "soltar" una ficha
% es solo agregarla al final de su columna.
% Fichas: 'R' (rojo) y 'Y' (amarillo). Casilla vacía: '.'.

:- module(connect4, [
    parse_board/2,     % +Texto42, -Columnas
    best_move/5,       % +Columnas, +Jugador, +Profundidad, -Columna, -info(Puntaje, Nodos, Razon)
    valid_moves/2,     % +Columnas, -Columnas libres (centro primero)
    drop/4,            % +Columnas, +Columna, +Jugador, -NuevasColumnas
    winning_drop/3,    % +Columnas, ?Columna, +Jugador: soltar ahí gana
    evaluate/3,        % +Columnas, +Jugador, -Puntaje heurístico
    opponent/2
]).

opponent('R', 'Y').
opponent('Y', 'R').

win_score(100000).
infinity(1000000).

% ---------------------------------------------------------------------------
% Lectura del tablero
% ---------------------------------------------------------------------------

% parse_board(+Texto, -Columnas)
% Texto: 42 caracteres, fila de ARRIBA primero, de izquierda a derecha.
% La casilla (fila F, columna C) está en la posición F*7 + C (F = 0 es arriba).
parse_board(Text, Cols) :-
    string_chars(Text, Chars),
    (   length(Chars, 42) -> true
    ;   throw(error(domain_error(tablero_de_42_casillas, Text), _))
    ),
    (   forall(member(Ch, Chars), memberchk(Ch, ['.', 'R', 'Y'])) -> true
    ;   throw(error(domain_error(solo_puntos_R_o_Y, Text), _))
    ),
    rows_of(Chars, RowsTopDown),
    reverse(RowsTopDown, RowsBottomUp),
    numlist(0, 6, Indexes),
    maplist(column_from(RowsBottomUp), Indexes, Cols).

rows_of([], []) :- !.
rows_of(Chars, [Row|Rows]) :-
    length(Row, 7),
    append(Row, Rest, Chars),
    rows_of(Rest, Rows).

% La columna I, leída de abajo hacia arriba hasta la primera casilla vacía.
column_from(RowsBottomUp, I, Col) :-
    maplist(nth0(I), RowsBottomUp, Cells),
    take_pieces(Cells, Col).

take_pieces([], []).
take_pieces(['.'|_], []) :- !.
take_pieces([P|Ps], [P|Col]) :- take_pieces(Ps, Col).

% ---------------------------------------------------------------------------
% Reglas del juego
% ---------------------------------------------------------------------------

% Columnas donde todavía cabe una ficha. Se prueban del centro hacia afuera:
% las jugadas centrales suelen ser mejores y así la poda alfa-beta corta antes.
valid_moves(Cols, Moves) :-
    include(free_column(Cols), [3, 2, 4, 1, 5, 0, 6], Moves).

free_column(Cols, C) :-
    nth0(C, Cols, Col),
    length(Col, N),
    N < 6.

drop(Cols, C, P, NewCols) :-
    nth0(C, Cols, Col, Others),
    append(Col, [P], NewCol),
    nth0(C, NewCols, NewCol, Others).

% cell(+Columnas, +C, +F, ?Valor): F = 0 es la fila de ABAJO. Falla fuera del tablero.
cell(Cols, C, R, V) :-
    C >= 0, C < 7, R >= 0, R < 6,
    nth0(C, Cols, Col),
    (   nth0(R, Col, V0) -> V = V0 ; V = '.' ).

% La última ficha de la columna C formó 4 en línea.
wins_at(Cols, C, P) :-
    nth0(C, Cols, Col),
    length(Col, N),
    R is N - 1,
    four_from(Cols, C, R, P).

% Desde (C, R) se cuentan fichas iguales en ambos sentidos de cada dirección:
% horizontal, vertical y las dos diagonales.
four_from(Cols, C, R, P) :-
    member(DC-DR, [1-0, 0-1, 1-1, 1-(-1)]),
    run(Cols, C, R, DC, DR, P, N1),
    BC is -DC, BR is -DR,
    run(Cols, C, R, BC, BR, P, N2),
    N1 + N2 + 1 >= 4,
    !.

run(Cols, C, R, DC, DR, P, N) :-
    C1 is C + DC,
    R1 is R + DR,
    (   cell(Cols, C1, R1, P)
    ->  run(Cols, C1, R1, DC, DR, P, N0),
        N is N0 + 1
    ;   N = 0
    ).

winning_drop(Cols, C, P) :-
    free_column(Cols, C),
    drop(Cols, C, P, New),
    wins_at(New, C, P).

% ---------------------------------------------------------------------------
% Heurística: qué tan bueno es un tablero para P cuando no hay tiempo de llegar al final
% ---------------------------------------------------------------------------

% Todas las "ventanas" de 4 casillas donde se podría hacer 4 en línea (69 en total).
:- table all_windows/1.
all_windows(Windows) :-
    findall(W, window(W), Windows).

window([C-R, C1-R, C2-R, C3-R]) :-              % horizontales
    between(0, 3, C), between(0, 5, R),
    C1 is C+1, C2 is C+2, C3 is C+3.
window([C-R, C-R1, C-R2, C-R3]) :-              % verticales
    between(0, 6, C), between(0, 2, R),
    R1 is R+1, R2 is R+2, R3 is R+3.
window([C-R, C1-R1, C2-R2, C3-R3]) :-           % diagonales que suben
    between(0, 3, C), between(0, 2, R),
    C1 is C+1, C2 is C+2, C3 is C+3,
    R1 is R+1, R2 is R+2, R3 is R+3.
window([C-R, C1-R1, C2-R2, C3-R3]) :-           % diagonales que bajan
    between(0, 3, C), between(3, 5, R),
    C1 is C+1, C2 is C+2, C3 is C+3,
    R1 is R-1, R2 is R-2, R3 is R-3.

evaluate(Cols, Me, Score) :-
    opponent(Me, Opp),
    all_windows(Windows),
    foldl(add_window(Cols, Me, Opp), Windows, 0, WindowsScore),
    nth0(3, Cols, Center),
    count(Me, Center, MineCenter),
    count(Opp, Center, TheirsCenter),
    Score is WindowsScore + 3 * (MineCenter - TheirsCenter).

add_window(Cols, Me, Opp, Window, S0, S) :-
    maplist(cell_at(Cols), Window, Values),
    count(Me, Values, Mine),
    count(Opp, Values, Theirs),
    count('.', Values, Empty),
    window_score(Mine, Theirs, Empty, X),
    S is S0 + X.

cell_at(Cols, C-R, V) :- cell(Cols, C, R, V).

% Tres mías con un hueco vale mucho; dos mías con dos huecos, algo.
% Tres del rival con un hueco es una amenaza: resta.
window_score(3, 0, 1, 5) :- !.
window_score(2, 0, 2, 2) :- !.
window_score(0, 3, 1, -4) :- !.
window_score(_, _, _, 0).

count(X, List, N) :-
    include(==(X), List, Same),
    length(Same, N).

% ---------------------------------------------------------------------------
% Búsqueda: negamax con poda alfa-beta
% ---------------------------------------------------------------------------
% Negamax es minimax escrito una sola vez: lo que es bueno para mí es igual de malo
% para el rival, así que el valor de una jugada es el NEGATIVO de lo mejor que puede
% hacer el rival después. Alfa y beta son la mejor garantía que ya tiene cada jugador:
% si una rama ya es peor que algo que encontramos antes, no se sigue explorando (poda).
% El contador de nodos usa variables globales de SWI, que son propias de cada hilo:
% dos partidas que piden jugada al mismo tiempo no se mezclan sus cuentas.

best_move(Cols, P, Depth, Column, info(Score, Nodes, Reason)) :-
    valid_moves(Cols, Moves),
    (   Moves == [] -> throw(error(domain_error(tablero_con_jugadas, lleno), _)) ; true ),
    nb_setval(c4_nodes, 0),
    opponent(P, O),
    (   member(C, Moves), winning_drop(Cols, C, P)
    ->  Column = C, Reason = win,
        win_score(W), Score is W + Depth
    ;   member(C, Moves), winning_drop(Cols, C, O)
    ->  Column = C, Reason = block,
        infinity(I), NegI is -I,
        move_value(Cols, C, Depth, NegI, I, P, Score)
    ;   root_search(Moves, Cols, Depth, P, Column, Score),
        Reason = minimax
    ),
    nb_getval(c4_nodes, Nodes).

% En la raíz se recuerda QUÉ columna dio el mejor valor, no solo el valor.
root_search([M|Ms], Cols, D, P, Best, Score) :-
    infinity(I), NegI is -I,
    move_value(Cols, M, D, NegI, I, P, V),
    root_loop(Ms, Cols, D, P, M, V, Best, Score).

root_loop([], _, _, _, Best, Score, Best, Score).
root_loop([M|Ms], Cols, D, P, Best0, Score0, Best, Score) :-
    infinity(I),
    move_value(Cols, M, D, Score0, I, P, V),
    (   V > Score0
    ->  root_loop(Ms, Cols, D, P, M, V, Best, Score)
    ;   root_loop(Ms, Cols, D, P, Best0, Score0, Best, Score)
    ).

% Valor para P de soltar en la columna C, mirando D jugadas hacia adelante.
% Ganar antes vale más (por eso se suma la profundidad que queda).
move_value(Cols, C, D, Alpha, Beta, P, V) :-
    drop(Cols, C, P, New),
    (   wins_at(New, C, P)
    ->  win_score(W), V is W + D
    ;   opponent(P, O),
        NegAlpha is -Beta, NegBeta is -Alpha,
        D1 is D - 1,
        negamax(New, D1, NegAlpha, NegBeta, O, V0),
        V is -V0
    ).

negamax(Cols, D, Alpha, Beta, P, V) :-
    nb_getval(c4_nodes, N0), N1 is N0 + 1, nb_setval(c4_nodes, N1),
    valid_moves(Cols, Moves),
    (   Moves == []
    ->  V = 0                                  % tablero lleno: empate
    ;   D =:= 0
    ->  evaluate(Cols, P, V)                   % se acabó la profundidad: heurística
    ;   infinity(I), NegI is -I,
        search_moves(Moves, Cols, D, Alpha, Beta, P, NegI, V)
    ).

search_moves([], _, _, _, _, _, Best, Best).
search_moves([M|Ms], Cols, D, Alpha, Beta, P, Best0, Best) :-
    move_value(Cols, M, D, Alpha, Beta, P, V),
    Best1 is max(Best0, V),
    Alpha1 is max(Alpha, V),
    (   Alpha1 >= Beta
    ->  Best = Best1                           % poda: el rival nunca dejaría llegar aquí
    ;   search_moves(Ms, Cols, D, Alpha1, Beta, P, Best1, Best)
    ).
