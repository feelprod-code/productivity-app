# Documentation Générale, Technique et Règles du Moteur de Comptabilité FeelProd

**Date du document :** 9 Juillet 2026 (Version consolidée)  
**Version globale :** v3.8  
**Propriétaire :** Guillaume Philippe (FeelProd)  

---

## 🔍 PARTIE I : PROTOCOLE DE RENOMMAGE ET DE TRI DES FACTURES

Ce protocole définit la technique moderne de renommage et de tri des justificatifs comptables à appliquer par toute instance de l'IA (locale et distante).

### 1. Extraction d'Informations par OCR IA
Chaque document (PDF, HTML, image JPG/PNG) est analysé à l'aide de l'IA (Gemini 2.5 Flash) pour en extraire les métadonnées de facturation suivantes :
*   **Date d'émission** (`invoice_date`) : Format strict `AAAA-MM-JJ`.
*   **Fournisseur** (`supplier_name`) : Nom propre du marchand en majuscules (ex : `AMAZON`, `GOOGLE`, `URSSAF`).
*   **Montant total TTC** (`amount`) : Numérique décimal strict (ex : `15.99`).
*   **Destinataire facturé** (`recipient_name`) : Nom du client (ex : `Guillaume Philippe`, `Sabrina Kanouche`).
*   **Description du produit** (`description`) : Intitulé précis en français en 2 à 4 mots (ex : `Coque MacBook Air`, `Abonnement Canva`).

### 2. Format de Nommage Cible
Le nom de fichier généré doit suivre rigoureusement le schéma suivant :
👉 **`[DATE (AAAA-MM-JJ)] - [FOURNISSEUR]_[DESCRIPTION] - [MONTANT]€.[EXT]`**

*   **Formatage du bloc central `[FOURNISSEUR]_[DESCRIPTION]`** :
    *   Tout en MAJUSCULES.
    *   Les accents sont supprimés.
    *   Tous les espaces et caractères spéciaux sont remplacés par des underscores `_`.
    *   Si la description est générique (ex: "facture", "achat"), on ne conserve que le fournisseur.
*   **Formatage du bloc montant `[MONTANT]€`** :
    *   Montant formaté avec deux décimales (ex: `120.00`).
    *   Le symbole `€` est inséré directement à la suite, sans espace ni mention "EUR".

*Exemples de noms propres :*
*   `2026-05-27 - VIA_SANA_SERVICE_STANDARD - 1848.00€.pdf`
*   `2026-03-21 - VERCEL_INC_SERVICES_CLOUD - 162.18€.pdf`
*   `2026-05-02 - SUNO_SUNO_PREMIER - 345.60€.pdf`

### 3. Règles de Tri et Classification des Pièces
Les factures sont classées automatiquement dans les répertoires cibles suivants :
*   **Dossier `Factures 2025/` et `Factures 2026/` (Professionnelles)** :
    *   Année supérieure ou égale à 2025.
    *   Destinataire : **Guillaume Philippe** ou **Philippe Guillaume**.
    *   *Exceptions validées* : Les SaaS technologiques (Google, Vercel, Supabase, Cloudflare, OpenAI, Canva, Suno, Adobe, etc.) et les déplacements/frais de moins de 150 € (Uber, SNCF, péages, parkings, Le Paris Halles) sont acceptés d'office comme professionnels même sans mention nominative.
*   **Dossier `REJETE/` (Personnelles ou Tiers)** :
    *   Dépenses personnelles évidentes (Netflix, Spotify, Zara) ou facturées au nom de tiers (Sabrina, Celine, Anita, etc.).
    *   Les fichiers rejetés sont préfixés par la raison du rejet : `ERREUR_DATE - ...` ou `REJETE_TIERS - ...`.

---

## 🛠️ PARTIE II : MANUEL TECHNIQUE ET DOCUMENTATION DÉVELOPPEUR

Cette section décrit le fonctionnement interne de l'application locale de comptabilité et son architecture.

### 1. Architecture Globale du Projet
L'application Next.js fait le pont entre le stockage local (Prisma SQLite/PostgreSQL) et les APIs distantes (Pennylane, Gemini).

```
                  ┌──────────────────────────────────────────────┐
                  │          INTERFACE UTILISATEUR               │
                  │   Next.js App Router (React 19 + Tailwind)   │
                  │ (Desktop Sidebar & Mobile Bottom Nav & PWA)  │
                  └──────────────────────┬───────────────────────┘
                                         │ HTTP / JSON
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │                 API ROUTES                   │
                  │     Next.js Route Handlers (App/Api/*)       │
                  └──────┬───────────────┬───────────────┬───────┘
                          │               │               │
                          ▼ Prisma Client  ▼ REST API      ▼ REST API
    ┌─────────────────────────────┐┌──────────────┐┌──────────────┐
    │          DATABASE           ││  PENNYLANE   ││  GEMINI AI   │
    │ PostgreSQL (Supabase Cloud) ││   API v2     ││  2.5 Flash   │
    └─────────────────────────────┘└──────────────┘└──────────────┘
```

### 2. Schéma de la Base de Données (Prisma Schema)
Le schéma de base de données modélise les factures physiques importées, les identifiants de facturation fournisseurs, et les surcharges de transactions validées par l'utilisateur.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Invoice {
  id        String   @id @default(uuid())
  provider  String
  amount    Float?
  currency  String   @default("EUR")
  date      DateTime
  fileUrl   String
  status    String   @default("PENDING")
  type      String   @default("PRO")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Expense {
  id        String   @id @default(uuid())
  provider  String
  amount    Float?
  currency  String   @default("USD")
  date      DateTime
  fileUrl   String?
  status    String   @default("PAID")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model SupplierCredential {
  id            String   @id @default(uuid())
  name          String
  loginUrl      String?
  email         String?
  username      String?
  password      String?
  monthlyCharge Float?
  currency      String   @default("EUR")
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model TransactionOverride {
  id        String   @id
  isPro     Boolean
  category  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 3. Spécifications de l'API Pennylane v2
Toutes les interactions avec Pennylane s'effectuent via l'API v2 externe.
*   **Base URL :** `https://app.pennylane.com/api/external/v2`
*   **Headers requis :**
    ```json
    {
      "Authorization": "Bearer <PENNYLANE_API_KEY>",
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Use-2026-API-Changes": "true"
    }
    ```

#### Endpoints clés utilisés :
*   `GET /bank_accounts` : Récupère la liste des comptes bancaires de l'entreprise.
*   `GET /transactions` : Récupère les transactions bancaires.
*   `GET /supplier_invoices` : Liste toutes les factures fournisseurs.
*   `PUT /supplier_invoices/:id` : Met à jour les métadonnées de la facture.
*   `POST /file_attachments` : Téléverse un fichier (PDF/image) sur Pennylane.
*   `POST /supplier_invoices/import` : Enregistre officiellement la facture dans Pennylane.
*   `POST /supplier_invoices/:id/matched_transactions` : Rapproche une facture et une transaction bancaire.
*   `DELETE /supplier_invoices/:id/matched_transactions/:txId` : Supprime la liaison de rapprochement (dé-lettrage).

---

## 🚗 PARTIE III : RÉFÉRENTIEL DES RÈGLES ET ALGORITHMES COMPTABLES

Cette section répertorie les règles logiques métier implémentées dans le code source pour trier, classifier et réconcilier les factures de l'exercice pro.

### 1. Algorithme d'Acceptation Nominative (OCR Gemini)
Cet algorithme évalue le texte extrait par l'OCR pour rejeter les tiers ou accepter d'office les exceptions technologiques et petits frais.

```typescript
const isProRecipient = 
  recipient.includes("guillaume philippe") ||
  recipient.includes("philippe guillaume") ||
  recipient.includes("feelprod") ||
  ((recipient === "" || recipient === "null" || recipient === "n/a") && (
      supplier.includes("GOOGLE") ||
      supplier.includes("VERCEL") ||
      supplier.includes("OPENROUTER") ||
      supplier.includes("SUPABASE") ||
      supplier.includes("CLOUDFLARE") ||
      supplier.includes("GITHUB") ||
      supplier.includes("STRIPE") ||
      supplier.includes("OPENAI") ||
      (amount < 150 && (
          supplier.includes("HALLES") || 
          supplier.includes("SEBASTOPOL") || 
          supplier.includes("RESTAURANT") || 
          supplier.includes("BISTRO") || 
          supplier.includes("CAFE") || 
          supplier.includes("BRASSERIE") || 
          supplier.includes("PEAGE") || 
          supplier.includes("INDIGO") ||
          supplier.includes("TOTAL")
      ))
  ));

const isTiers = 
  recipient.includes("sabrina") || 
  recipient.includes("kanouche") || 
  recipient.includes("anita") || 
  recipient.includes("kacha");

// RÈGLE COMPTABLE : Validation = isProRecipient && !isTiers
```

### 2. Algorithme d'Auto-Catégorisation des Transactions
Rapproche les mots-clés de la transaction bancaire avec l'une des catégories comptables cibles.

```typescript
function guessCategory(label: string, isPro: boolean, amount: number): string {
  if (!isPro) return "PERSO";
  const labelLower = label.toLowerCase();
  
  if (labelLower.includes("openai") || labelLower.includes("chatgpt") || labelLower.includes("openrouter") || labelLower.includes("vercel") || labelLower.includes("github")) {
    return "LOGICIELS_IA";
  }
  if (labelLower.includes("restaurant") || labelLower.includes("cafe") || labelLower.includes("paris halles") || labelLower.includes("sebastopol")) {
    return "RESTAURANT";
  }
  if (labelLower.includes("amazon") || labelLower.includes("papeterie") || labelLower.includes("office")) {
    return "FOURNITURES";
  }
  if (labelLower.includes("sncf") || labelLower.includes("peage") || labelLower.includes("uber") || labelLower.includes("parking") || labelLower.includes("indigo") || labelLower.includes("total")) {
    return "DEPLACEMENTS";
  }
  if (labelLower.includes("doctolib") || labelLower.includes("medical") || labelLower.includes("pharmacie")) {
    return "CABINET";
  }
  if (labelLower.includes("urssaf") || labelLower.includes("carpimko") || labelLower.includes("prevoyance")) {
    return "COTISATIONS";
  }
  return "FOURNITURES";
}
```

### 3. Règle de Rapprochement et Résolution PayPal
*   Les transactions bancaires au libellé générique `PayPal Europe` sont résolues en interrogeant la base locale `paypal_cache.json` pour identifier le marchand réel (Suno, Spotify, Canva, etc.).
*   Si aucun PDF n'est disponible sur l'ordinateur, l'Autopilot recherche dans vos boîtes mails le reçu PayPal du montant correspondant, extrait le corps HTML, le convertit en justificatif `.html`, l'importe et le rapproche de la transaction bancaire sur Pennylane.

### 4. Règle d'Intégrité en Double Synchronisation
Pour éviter les désynchronisations visuelles, tout justificatif importé sur Pennylane doit obligatoirement subir une double écriture synchrone :
1.  **Pennylane** : Envoi du fichier (`POST /file_attachments`) et importation du justificatif (`POST /supplier_invoices/import`).
2.  **Base de Données Locale** : Upload de la pièce sur Supabase Storage, et création de l'enregistrement de facture dans PostgreSQL via Prisma avec le statut `COMPLETED`.

---

## 📂 PARTIE IV : CATALOGUE ET EXÉCUTION DES SCRIPTS COMPTABLES

### 1. Démarrer l'Application Locale
```bash
./scripts/start_compta_app.sh
```
*Libère le port 3000 si occupé et lance le serveur local Next.js.*

### 2. Renommer et Trier les Factures par OCR
```bash
npx ts-node scripts/rename_local_invoices_ia.ts --run
```
*Analyse les répertoires iCloud locaux de factures brutes, extrait le fournisseur, la date et le montant via Gemini, et applique les renommages et rejets propres.*

### 3. Nettoyer les Pièces Génériques de Pennylane
```bash
npx ts-node scripts/clean_pennylane_justificatifs.ts
```
*Télécharge les factures de Pennylane au libellé générique, applique l'OCR, met à jour le titre sur Pennylane, et archive/rejette les pièces perso.*

### 4. Ré-injecter et Rapprocher les Factures Propres
```bash
npx ts-node scripts/reupload_and_reconcile.ts
```
*Neutralise les factures obsolètes (décalage de date), purge la base locale, téléverse les factures pro triées du Bureau et les rapproche des écritures bancaires 2025/2026.*

### 5. Synchroniser le Cache PayPal
```bash
npm run sync-paypal
```
*Se connecte à vos messageries (Gmail/iCloud) pour en extraire les reçus PayPal et actualiser le cache local.*

---

## 📋 PARTIE V : PROTOCOLE FUTUR D'INTÉGRATION ET DE TRI MENSUEL

Pour intégrer de nouvelles factures de manière propre et autonome à l'avenir, suivez strictement cette procédure :

### Étape 1 : Récupération Transitoire (Landing Zone)
1. Téléchargez toutes les factures brutes depuis vos boîtes mail (Gmail / iCloud) sous format PDF ou image.
2. Déposez-les en vrac dans le dossier transitoire dédié sur votre Bureau :
   📁 **`Desktop/factures_a_traiter/`**

### Étape 2 : Lancement du Tri et Renommage IA
1. Ouvrez votre terminal et lancez le script de renommage local :
   ```bash
   npx ts-node scripts/rename_local_invoices_ia.ts --run
   ```
2. **Ce que fait le script automatiquement** :
   * Scanne le dossier transitoire du Bureau.
   * Interroge l'OCR Gemini pour chaque pièce brute.
   * Renomme la pièce sous le format strict `[DATE] - [FOURNISSEUR]_[DESCRIPTION] - [MONTANT]€.pdf`.
   * **Déplace** le fichier validé directement dans le bon sous-dossier de mois dans votre **Source de Vérité locale** : `/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures [ANNEE]/[MOIS]/`.
   * Déplace les rejets personnels ou de tiers vers `/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/REJETE/`.
   * **Résultat** : Le dossier transitoire du Bureau est entièrement vidé de ses fichiers traités, vous laissant un Bureau propre.

### Étape 3 : Double Synchronisation et Rapprochement
1. Une fois triées en local dans `4-Compta`, les nouvelles factures sont téléversées automatiquement vers la base en ligne **Supabase** et vers **Pennylane** pour y être associées à vos transactions de relevé bancaire.

