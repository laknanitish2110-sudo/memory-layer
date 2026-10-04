FROM node:22-slim

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies
RUN cd deploy && npm install && \
    cd ../packages/persistence && npm install && \
    cd ../api && npm install

EXPOSE 3000
ENV PORT=3000

WORKDIR /app/deploy
CMD ["npx", "tsx", "server.ts"]
