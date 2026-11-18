% tests.pl — pruebas de la IA. Se corren solas al construir la imagen de Docker:
%   swipl -g run_tests -t halt tests.pl
% Los tableros se escriben fila por fila, de ARRIBA hacia ABAJO, como se ven en pantalla.

:- use_module(library(plunit)).
:- use_module(connect4).

board(Rows, Cols) :-
    atomic_list_concat(Rows, Text),
    parse_board(Text, Cols).

vacia(".......").

:- begin_tests(lectura).

test(columnas_de_abajo_hacia_arriba) :-
    vacia(E),
    board([E, E, E, E, "Y......", "R.....Y"], Cols),
    assertion(Cols == [['R', 'Y'], [], [], [], [], [], ['Y']]).

test(tablero_corto, [throws(error(domain_error(tablero_de_42_casillas, _), _))]) :-
    parse_board("....", _).

test(caracter_invalido, [throws(error(domain_error(solo_puntos_R_o_Y, _), _))]) :-
    vacia(E),
    board([E, E, E, E, E, "X......"], _).

test(soltar_ficha) :-
    vacia(E),
    board([E, E, E, E, E, "R......"], Cols),
    drop(Cols, 0, 'Y', New),
    assertion(New == [['R', 'Y'], [], [], [], [], [], []]).

:- end_tests(lectura).

:- begin_tests(decisiones).

test(gana_en_horizontal) :-
    vacia(E),
    board([E, E, E, E, E, "YYY.RR."], Cols),
    best_move(Cols, 'Y', 5, Col, info(_, _, Reason)),
    assertion(Col-Reason == 3-win).

test(gana_en_vertical) :-
    vacia(E),
    board([E, E, E, "......Y", "R.....Y", "RR....Y"], Cols),
    best_move(Cols, 'Y', 5, Col, info(_, _, Reason)),
    assertion(Col-Reason == 6-win).

test(gana_en_diagonal) :-
    vacia(E),
    board([E, E, E, "..RY...", ".RYY...", "RYYR.R."], Cols),
    best_move(Cols, 'R', 5, Col, info(_, _, Reason)),
    assertion(Col-Reason == 3-win).

test(bloquea_al_rival) :-
    vacia(E),
    board([E, E, E, E, E, "RRR.YY."], Cols),
    best_move(Cols, 'Y', 5, Col, info(_, _, Reason)),
    assertion(Col-Reason == 3-block).

test(prefiere_ganar_que_bloquear) :-
    vacia(E),
    board([E, E, E, "......Y", "......Y", "RRR...Y"], Cols),
    best_move(Cols, 'Y', 5, Col, info(_, _, Reason)),
    assertion(Col-Reason == 6-win).

% Si el rival amenaza con DOS jugadas ganadoras a la vez, la búsqueda ve la derrota.
test(ve_una_derrota_inevitable) :-
    vacia(E),
    board([E, E, E, E, E, ".RRR..."], Cols),
    best_move(Cols, 'Y', 5, _, info(Score, _, _)),
    assertion(Score < -90000).

test(tablero_vacio_juega_al_centro) :-
    vacia(E),
    board([E, E, E, E, E, E], Cols),
    best_move(Cols, 'R', 5, Col, info(_, Nodes, Reason)),
    assertion(memberchk(Col, [2, 3, 4])),
    assertion(Reason == minimax),
    assertion(Nodes > 0).

test(nunca_elige_una_columna_llena) :-
    board(["...R...", "...Y...", "...R...", "...Y...", "...R...", "...Y..."], Cols),
    best_move(Cols, 'R', 5, Col, _),
    assertion(Col \== 3).

test(tablero_lleno, [throws(error(domain_error(tablero_con_jugadas, lleno), _))]) :-
    board(["RYRYRYR", "RYRYRYR", "YRYRYRY", "YRYRYRY", "RYRYRYR", "RYRYRYR"], Cols),
    best_move(Cols, 'R', 5, _, _).

% La IA contra sí misma: la partida termina, siempre con jugadas válidas.
test(partida_completa_ia_contra_ia) :-
    vacia(E),
    board([E, E, E, E, E, E], Cols),
    self_play(Cols, 'R', 0, Moves),
    assertion(Moves =< 42).

% Profundidad 5 en el tablero vacío (el caso más costoso) debe responder rápido.
test(responde_a_tiempo) :-
    vacia(E),
    board([E, E, E, E, E, E], Cols),
    statistics(cputime, T0),
    best_move(Cols, 'R', 5, _, info(_, Nodes, _)),
    statistics(cputime, T1),
    Seconds is T1 - T0,
    format(user_error, "~n  profundidad 5, tablero vacío: ~D nodos en ~2f s~n", [Nodes, Seconds]),
    assertion(Seconds < 10).

:- end_tests(decisiones).

self_play(Cols, _P, N, N) :-
    valid_moves(Cols, []), !.
self_play(Cols, P, N0, N) :-
    best_move(Cols, P, 3, C, _),
    valid_moves(Cols, Valid),
    memberchk(C, Valid),
    N1 is N0 + 1,
    (   winning_drop(Cols, C, P)
    ->  N = N1
    ;   drop(Cols, C, P, New),
        opponent(P, O),
        self_play(New, O, N1, N)
    ).
