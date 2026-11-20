# IA de Conecta 4 en SWI-Prolog (imagen oficial).
FROM swipl:stable

WORKDIR /app
COPY connect4.pl server.pl tests.pl ./

# Las pruebas corren al construir: si alguna falla, la imagen no se construye.
RUN swipl -g run_tests -t halt tests.pl

EXPOSE 8082
CMD ["swipl", "/app/server.pl"]
