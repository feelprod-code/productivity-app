# Assistant de Nettoyage Pennylane x Gemini

Ce projet fournit un script automatique pour nettoyer et renseigner les fournisseurs manquants sur vos factures Pennylane en analysant les fichiers justificatifs (PDF) via l'IA de Gemini.

## Fonctionnalités

1. **Scan Intelligent** : Identifie les factures fournisseurs (`supplier_invoices`) de Pennylane où le nom du fournisseur est vide, et qui possèdent un fichier PDF associé.
2. **Extraction IA (Gemini 3 Flash)** : Analyse le PDF du justificatif pour en extraire :
   - Le nom du fournisseur exact (ex: Adobe, Sony, DJI, EDF...)
   - La date de la facture
   - Le montant HT, le montant de la TVA et le montant TTC
3. **Matching Intelligent** : Compare le nom trouvé par l'IA avec vos fournisseurs existants sur Pennylane (insensible à la casse, retrait des extensions légales de type SAS, SARL, Ltd, etc.).
4. **Création Automatique** : Si le fournisseur n'existe pas, il est créé proprement dans votre Pennylane.
5. **Mise à Jour** : Envoie une requête de mise à jour à l'API Pennylane avec le bon ID fournisseur (et complète la date et les montants financiers s'ils étaient manquants).
6. **Mode Sécurisé (Dry-Run)** : Par défaut, le script tourne en mode simulation pour vous permettre de vérifier les extractions avant toute modification réelle.

## Installation

1. Assurez-vous d'avoir Python 3 installé.
2. Naviguez dans le dossier du projet et installez les dépendances nécessaires :
   ```bash
   pip install -r requirements.txt
   ```

## Configuration

Créez ou modifiez le fichier `.env` à la racine de votre dossier de travail `ANTIGRAVITY` (ou dans ce sous-dossier) en ajoutant vos clés API :

```env
# Clé API Gemini (Google AI Studio)
GEMINI_API_KEY="votre_cle_gemini"

# Clé API Pennylane (à récupérer dans vos paramètres d'intégration Pennylane)
PENNYLANE_API_KEY="votre_cle_pennylane"
```

## Utilisation

Le script s'exécute depuis le terminal.

### 1. Lancer une Simulation (Dry-Run)
Pour tester le script sans modifier vos données sur Pennylane et observer les prédictions de Gemini :
```bash
python cleaner.py
```

Pour limiter le test aux 5 premières factures incomplètes détectées :
```bash
python cleaner.py --limit 5
```

### 2. Lancer le Nettoyage Réel (Production)
Pour appliquer réellement les modifications dans Pennylane (création des fournisseurs manquants et mise à jour des factures) :
```bash
python cleaner.py --run
```

Vous pouvez combiner avec la limite :
```bash
python cleaner.py --run --limit 10
```

### 3. Autres options
Pour exécuter le nettoyage réel mais **sans créer de nouveaux fournisseurs** s'ils n'existent pas déjà dans Pennylane :
```bash
python cleaner.py --run --no-create
```
