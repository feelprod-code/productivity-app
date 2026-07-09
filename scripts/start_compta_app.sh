#!/bin/bash
# Script de démarrage pour l'application comptable FeelProd Compta
# Géré automatiquement par Antigravity

echo "🚀 Démarrage du serveur comptable FeelProd..."
cd "/Users/guillaumephilippe/ANTIGRAVITY/compta"

# Libérer le port 3000 s'il est déjà occupé
PID=$(lsof -t -i:3000)
if [ -n "$PID" ]; then
  echo "⚠️ Le port 3000 est occupé par le processus $PID. Libération..."
  kill -9 $PID
fi

# Démarrer le serveur Next.js sur toutes les interfaces réseau (accessible depuis iPhone)
npx next dev -H 0.0.0.0
