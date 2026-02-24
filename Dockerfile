FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/emscripten-core/emsdk.git /emsdk
RUN /emsdk/emsdk install 3.1.58 && \
    /emsdk/emsdk activate 3.1.58

ENV PATH="/emsdk:/emsdk/upstream/emscripten:${PATH}"
ENV EMSDK="/emsdk"
ENV EMSDK_NODE=/emsdk/node/16.20.0_64bit/bin/node    

WORKDIR /app

CMD ["/bin/bash", "setup.sh"]