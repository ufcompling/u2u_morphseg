FROM python:3.12-slim

# Install Bun
RUN apt-get update && apt-get install -y curl unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    ln -s $HOME/.bun/bin/bun /usr/local/bin/bun

RUN apt-get install -y \
    build-essential \
    git \
    python3.12-venv \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/emscripten-core/emsdk.git /emsdk
RUN /emsdk/emsdk install 3.1.58 && \
    /emsdk/emsdk activate 3.1.58

ENV PATH="/emsdk:/emsdk/upstream/emscripten:${PATH}"
ENV EMSDK="/emsdk"
ENV EMSDK_NODE=/emsdk/node/16.20.0_64bit/bin/node    

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

EXPOSE 5173

CMD ["bun", "run", "dev", "--host"]