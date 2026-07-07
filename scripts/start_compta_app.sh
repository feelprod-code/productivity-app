#!/bin/bash
# Script de démarrage pour l'application macOS FeelProd Compta

# Dossier du projet compta
PROJECT_DIR="/Users/philippeguillaume/ANTIGRAVITY/compta"

# URL de l'application
URL="http://localhost:3000"

# Fonction pour vérifier si le serveur répond
check_server() {
    curl -s -o /dev/null -w "%{http_code}" "$URL"
}

# Charger l'environnement si nécessaire (ex: nvm ou node)
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Vérifier si le serveur est déjà en ligne
STATUS=$(check_server)

if [ "$STATUS" != "200" ]; then
    # Le serveur n'est pas en ligne, on le lance
    cd "$PROJECT_DIR"
    
    # Charger les variables d'environnement locales si le fichier .env existe
    if [ -f .env.local ]; then
        export $(cat .env.local | grep -v '^#' | xargs)
    fi
    
    # Lancement du serveur Next.js en tâche de fond
    npm run dev > /tmp/feelprod_compta.log 2>&1 &
    
    # Attendre que le serveur démarre (timeout de 30 secondes)
    for i in {1..30}; do
        STATUS=$(check_server)
        if [ "$STATUS" == "200" ]; then
            break
        fi
        sleep 1
    done
fi

# Ouvrir Google Chrome en mode application épurée (sans barre d'adresse)
open -a "Google Chrome" --args --app="$URL"
