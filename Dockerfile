FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN cp .dev.vars.example .dev.vars
EXPOSE 3000
CMD ["sh", "-c", "npm run db:local && npm run dev -- --host 0.0.0.0"]
