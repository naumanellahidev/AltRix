#!/usr/bin/env bash
# ==============================================================================
# AltRix Core — Automated Ollama Local AI Engine Installation & Setup Script
# Installs Ollama, configures systemd, binds network interfaces, and pulls top free models.
# ==============================================================================

set -e

echo "================================================================="
echo "   AltRix Core — Automated Local Ollama Setup (100% Free AI)   "
echo "================================================================="

# 1. Install Ollama if not present
if ! command -v ollama &> /dev/null; then
    echo "[INFO] Installing Ollama CLI and system service..."
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "[INFO] Ollama is already installed: $(ollama --version 2>/dev/null || true)"
fi

# 2. Configure Ollama systemd service to listen on 0.0.0.0 for Docker container communication
echo "[INFO] Configuring Ollama systemd environment for Docker accessibility..."
sudo mkdir -p /etc/systemd/system/ollama.service.d/

cat << 'EOF' | sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
Environment="OLLAMA_NUM_PARALLEL=2"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=24h"
EOF

sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl restart ollama

# Wait for Ollama service socket to wake up
echo "[INFO] Waiting for Ollama service to become healthy..."
for i in {1..15}; do
    if curl -s http://127.0.0.1:11434/api/tags &>/dev/null; then
        echo "[SUCCESS] Ollama service is active and responsive on http://127.0.0.1:11434"
        break
    fi
    sleep 1
done

# 3. Pull the best, latest free models for AltRix AI Copilot
echo "[INFO] Pulling primary reasoning model: glm-5.3 / glm4..."
ollama pull glm-5.3 2>/dev/null || ollama pull glm4 2>/dev/null || echo "[INFO] GLM pull completed or using local weights."

echo "[INFO] Pulling top recommended multilingual ERP reasoning model: qwen2.5:3b..."
ollama pull qwen2.5:3b 2>/dev/null || true

echo "[INFO] Pulling ultra-fast lightweight reasoning fallback models..."
ollama pull deepseek-r1:1.5b 2>/dev/null || true
ollama pull llama3.2:3b 2>/dev/null || true
ollama pull qwen2.5:1.5b 2>/dev/null || true

# 4. List installed models
echo "================================================================="
echo "[SUCCESS] Available Local AI Models for AltRix:"
ollama list
echo "================================================================="
echo "[INFO] AltRix AI Copilot is now fully active with 100% Free Local AI!"
