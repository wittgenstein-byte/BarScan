FROM node:20-alpine

WORKDIR /app

# Copy root frontend files
COPY index.html app.js styles.css manifest.json ./
COPY assets ./assets

# Copy server package files
COPY server/package*.json ./server/

# Set working directory to the server folder to install dependencies
WORKDIR /app/server
RUN npm install --omit=dev

# Copy the rest of the server files
COPY server/ ./

EXPOSE 3001

CMD ["node", "index.js"]
