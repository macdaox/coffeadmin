FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ca-certificates && update-ca-certificates

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=80

EXPOSE 80

CMD ["npm", "start"]
