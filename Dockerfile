FROM apify/actor-node-playwright-chrome:22
COPY package*.json ./
RUN npm install --include=dev --audit=false
COPY . .
RUN npm run build \
    && rm -rf src node_modules \
    && npm install --omit=dev --omit=optional --audit=false \
    && npm cache clean --force
COPY .actor .actor
CMD ["node", "dist/main.js"]
