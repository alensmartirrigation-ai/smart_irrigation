FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY server.js ./server.js

ENV NODE_ENV=production
EXPOSE 4000

USER node
CMD ["node", "src/index.js"]
