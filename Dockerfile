FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# Datos persistentes: monta un volumen de Railway en /data.
# Railway monta los volúmenes como root, así que el proceso corre como root
# para poder escribir en ellos (el contenedor está aislado igualmente).
ENV DATA_FILE=/data/db.json
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]
