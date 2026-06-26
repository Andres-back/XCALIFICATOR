FROM ghcr.io/presenton/presenton:latest

# Install shared library dependencies required by Chrome/Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libnspr4 \
    libnss3 \
    libgbm1 \
    libasound2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Pre-install Chrome so Docker seeds the named volume on first mount.
# On first container start with an empty named volume, Docker copies this
# directory into the volume — Chrome is then available without manual setup.
RUN PUPPETEER_CACHE_DIR=/root/.cache/puppeteer \
    npx puppeteer@22 browsers install 'chrome@146.0.7680.76'
