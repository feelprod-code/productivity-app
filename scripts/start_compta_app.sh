#!/bin/bash
# Script de démarrage pour l'application comptable FeelProd Compta
# Géré automatiquement par Antigravity

# Définir le PATH complet pour s'assurer que node, npm, npx, lsof sont trouvés même lors d'un lancement GUI macOS
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

echo "🚀 Démarrage du serveur comptable FeelProd..."
cd "/Users/guillaumephilippe/ANTIGRAVITY/compta" || exit 1

# Libérer le port 3000 s'il est déjà occupé
PIDS=$(lsof -ti:3000 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "⚠️ Le port 3000 est occupé par le(s) processus $PIDS. Libération..."
  kill -9 $PIDS 2>/dev/null || true
  sleep 0.5
fi

# Journalisation des logs pour diagnostic
LOG_FILE="/Users/guillaumephilippe/ANTIGRAVITY/compta/.server.log"
echo "=== Démarrage Compta $(date) ===" > "$LOG_FILE"

# Démarrer le serveur Next.js avec le moteur Webpack stable (évite les paniques Turbopack PostCSS)
exec npx next dev --webpack -H 0.0.0.0 -p 3000 >> "$LOG_FILE" 2>&1

