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

# Run as non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser
RUN chown -R appuser:appuser /app
USER appuser

WORKDIR /app/deploy
CMD ["npx", "tsx", "server.ts"]
