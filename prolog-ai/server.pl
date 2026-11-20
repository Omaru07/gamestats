% server.pl — servidor HTTP de la IA (puerto 8082).
%   POST /move   {"board": "<42 caracteres>", "player": "Y", "depth": 5}
%             -> {"column": 3, "score": 12, "nodesExplored": 1830, "depth": 5, "reason": "minimax"}
%   GET  /health -> {"status": "ok"}
% Cada petición la atiende un hilo distinto, así que varias partidas pueden pedir
% jugada al mismo tiempo.

:- use_module(library(http/thread_httpd)).
:- use_module(library(http/http_dispatch)).
:- use_module(library(http/http_json)).
:- use_module(connect4).

:- http_handler(root(health), health, []).
:- http_handler(root(move), move, [method(post)]).

:- initialization(main, main).

main :-
    (   getenv('PORT', Text), atom_number(Text, Port) -> true ; Port = 8082 ),
    http_server(http_dispatch, [port(Port)]),
    format(user_error, "Prolog escuchando en el puerto ~w~n", [Port]),
    thread_get_message(_).                     % mantiene vivo el proceso

health(_Request) :-
    reply_json_dict(_{status: "ok"}).

move(Request) :-
    catch(
        (   http_read_json_dict(Request, In),
            (   handle_move(In, Out)
            ->  reply_json_dict(Out)
            ;   bad_request("faltan los campos board y player")
            )
        ),
        Error,
        (   message_to_codes_safe(Error, Message),
            bad_request(Message)
        )).

handle_move(In, Out) :-
    get_dict(board, In, Board),
    get_dict(player, In, PlayerText),
    atom_string(Player, PlayerText),
    (   memberchk(Player, ['R', 'Y']) -> true
    ;   throw(error(domain_error(player_R_o_Y, PlayerText), _))
    ),
    (   get_dict(depth, In, D0), integer(D0) -> true ; D0 = 5 ),
    Depth is max(1, min(7, D0)),
    parse_board(Board, Cols),
    best_move(Cols, Player, Depth, Column, info(Score, Nodes, Reason)),
    Out = _{column: Column, score: Score, nodesExplored: Nodes,
            depth: Depth, reason: Reason}.

bad_request(Message) :-
    reply_json_dict(_{error: Message}, [status(400)]).

message_to_codes_safe(Error, Message) :-
    format(string(Message), "~q", [Error]).
