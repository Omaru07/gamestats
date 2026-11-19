# Consola web: se compila con Node y se sirve con nginx, que además hace de proxy hacia
# GameStats (Go y Scala) y la IA (Prolog). El navegador solo habla con nginx: sin CORS.

# Etapa 1: compilar (tsc revisa los tipos y Vite arma los archivos finales)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Etapa 2: imagen final, pequeña
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
