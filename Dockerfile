# Dockerfile for demowright with audio capture (Xvfb + PulseAudio + Firefox)
#
# Playwright's built-in video recorder doesn't capture page audio.
# This container provides a virtual display (Xvfb) and audio sink (PulseAudio)
# so headed Firefox outputs audio to PulseAudio, which demowright records via
# its module-pipe-sink integration.

FROM node:22-bookworm

# System deps: Xvfb, PulseAudio, ffmpeg, and Firefox browser dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    pulseaudio \
    ffmpeg \
    # Firefox dependencies (Playwright installs the browser binary, but needs system libs)
    libgtk-3-0 \
    libdbus-glib-1-2 \
    libxt6 \
    libasound2 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxshmfence1 \
    fonts-noto \
    fonts-noto-cjk \
    # espeak-ng as free TTS fallback
    espeak-ng \
    # dbus (avoids noisy PulseAudio warnings)
    dbus \
    # Window manager + xdotool + screen tools (for example 08 system file picker
    # which can't be captured by Playwright's video recorder — needs ffmpeg x11grab)
    fluxbox \
    xdotool \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Install Playwright Firefox browser
RUN bunx playwright install firefox

# Copy the rest of the project
COPY . .

# Build
RUN bun run build

COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY docker-record-screen.sh /app/docker-record-screen.sh
RUN chmod +x /docker-entrypoint.sh /app/docker-record-screen.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["bunx", "playwright", "test", "--config", "examples/playwright.config.ts"]
