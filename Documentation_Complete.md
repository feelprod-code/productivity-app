# Manuel Technique & Documentation Développeur - Moteur de Comptabilité FeelProd

**Date de dernière mise à jour :** 9 Juillet 2026 (Mise à jour de l'après-midi)  
**Version du Projet :** v3.8  
**Moteur OCR :** Gemini-2.5-Flash via `@google/genai`  
**Base de données :** Supabase PostgreSQL  
**Interface :** Next.js App Router (React 19 + Tailwind CSS)  
**API Comptable :** Pennylane API v2  

---

## 🔍 1. Protocole de Renommage et de Tri des Factures

Ce protocole définit la technique moderne de renommage et de tri des justificatifs comptables à appliquer par toute instance de l'IA (locale et distante).

### A. Extraction d'Informations par OCR IA
Chaque document (PDF, HTML, image JPG/PNG) est analysé à l'aide de l'IA (Gemini 2.5 Flash) pour en extraire les métadonnées de facturation suivantes :
1. **Date d'émission** (`invoice_date`) : Format strict `AAAA-MM-JJ`.
2. **Fournisseur** (`supplier_name`) : Nom propre du marchand en majuscules (ex : `AMAZON`, `GOOGLE`, `URSSAF`).
3. **Montant total TTC** (`amount`) : Numérique décimal strict (ex : `15.99`).
4. **Destinataire facturé** (`recipient_name`) : Nom du client (ex : `Guillaume Philippe`, `Sabrina Kanouche`).
5. **Description du produit** (`description`) : Intitulé précis en français en 2 à 4 mots (ex : `Coque MacBook Air`, `Abonnement Canva`).

### B. Format de Nommage Cible
Le nom de fichier généré doit suivre rigoureusement le schéma suivant :
👉 **`[DATE (AAAA-MM-JJ)] - [FOURNISSEUR]_[DESCRIPTION] - [MONTANT]€.[EXT]`**

*   **Bloc central `[FOURNISSEUR]_[DESCRIPTION]`** :
    *   Tout en MAJUSCULES.
    *   Les accents sont supprimés.
    *   Tous les espaces et caractères spéciaux sont remplacés par des underscores `_`.
    *   Si la description est générique (ex: "facture", "achat"), on ne conserve que le fournisseur.
*   **Bloc montant `[MONTANT]€`** :
    *   Montant formaté avec deux décimales (ex: `120.00`).
    *   Le symbole `€` est inséré directement à la suite, sans espace ni mention "EUR".

*Exemples de noms propres :*
*   `2026-05-27 - VIA_SANA_SERVICE_STANDARD - 1848.00€.pdf`
*   `2026-03-21 - VERCEL_INC_SERVICES_CLOUD - 162.18€.pdf`
*   `2026-05-02 - SUNO_SUNO_PREMIER - 345.60€.pdf`

### C. Règles de Tri et Classification
Les factures sont classées automatiquement dans des sous-dossiers structurés :
*   **Dossier `Factures 2025/` et `Factures 2026/` (Professionnelles)** :
    *   Année supérieure ou égale à 2025.
    *   Destinataire : **Guillaume Philippe** ou **Philippe Guillaume**.
    *   *Exceptions validées* : Les SaaS technologiques (Google, Vercel, Supabase, Cloudflare, OpenAI, Canva, Suno, Adobe, etc.) et les déplacements/frais de moins de 150 € (Uber, SNCF, péages, parkings) sont acceptés d'office même sans mention nominative directe.
*   **Dossier `REJETE/` (Personnelles ou Tiers)** :
    *   Dépenses personnelles évidentes (Netflix, Spotify, Zara) ou facturées au nom de tiers (Sabrina, Celine, Anita, etc.).
    *   Les fichiers rejetés sont préfixés par la raison du rejet : `ERREUR_DATE - ...` ou `REJETE_TIERS - ...`.

---

## 🛠️ 2. Architecture Globale du Projet

Ce projet est un outil d'automatisation comptable et de rapprochement bancaire conçu pour FeelProd. Il permet d'interfacer les justificatifs de facturation locaux, les e-mails de facturation et l'interface Pennylane de manière autonome.

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

---

## 💾 3. Schéma de la Base de Données (Prisma Schema)

Le schéma Prisma définit les modèles nécessaires pour le stockage local des identifiants de fournisseurs, des factures physiques gérées, et des décisions de surcharge de l'utilisateur.

```prisma
// File: prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model contacts {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  created_at DateTime @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  name       String
  email      String
  subject    String?
  message    String
  source     String?  @default("feelprod-website")
  status     String?  @default("new")
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

---

## 🔌 4. Spécifications de l'API Pennylane v2

Le moteur d'intégration utilise des requêtes HTTP directes vers l'API de Pennylane pour effectuer des synchronisations et des rapprochements.

### Configuration des requêtes
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

### Endpoints consommés
1.  **`GET /bank_accounts`** : Récupère la liste des comptes bancaires de l'entreprise.
2.  **`GET /transactions`** : Récupère les transactions bancaires avec pagination par curseur.
3.  **`GET /supplier_invoices`** : Liste toutes les factures d'achat fournisseurs enregistrées.
4.  **`GET /supplier_invoices/:id`** : Récupère le détail d'une facture.
5.  **`PUT /supplier_invoices/:id`** : Met à jour les métadonnées de la facture.
6.  **`POST /file_attachments`** : Téléverse un fichier sur Pennylane et renvoie un `file_attachment_id`.
7.  **`POST /suppliers`** : Crée un nouveau fournisseur si aucun n'existe avec ce nom.
8.  **`POST /supplier_invoices/import`** : Enregistre officiellement la facture dans Pennylane.
9.  **`POST /supplier_invoices/:id/matched_transactions`** : Rapproche la facture d'une ligne de transaction bancaire.
10. **`DELETE /supplier_invoices/:id/matched_transactions/:txId`** : Supprime la liaison de rapprochement (dé-lettrage).

---

## 🧠 5. OCR intelligent par Gemini 2.5 Flash

L'analyse de factures est déléguée au modèle `gemini-2.5-flash` qui prend en entrée le fichier (en base64) et renvoie un JSON structuré.

### Structure d'appel
```typescript
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
        {
            inlineData: {
                data: fileBuffer.toString('base64'),
                mimeType: "application/pdf"
            }
        },
        {
            text: `Tu es un expert comptable AI. Analyse ce document de facture ou reçu.
Extrais les informations suivantes au format JSON strict (sans \`\`\`json ni markdown) :
{
  "supplier_name": "Le nom propre et exact du marchand/fournisseur en majuscules (ex: AMAZON, APPLE, CANVA, UBER, GANDI, CARPIMKO, URSSAF, etc.)",
  "invoice_date": "La date d'émission de la facture au format YYYY-MM-DD",
  "amount": le montant total TTC numérique (ex: 121.00),
  "recipient_name": "Le nom du destinataire facturé (ex: Guillaume Philippe, Sabrina Kanouche, Anita, Kacha, Philippe Guillaume)",
  "description": "Une description très courte et précise de l'achat en 2-4 mots en français (ex: Abonnement Canva Pro, Cotisation Kine, Deplacement Bolt, etc.)"
}`
        }
    ]
});
```

---

## 🚗 6. Algorithmes Comptables Clés

### A. Règle de Filtrage Pro / Perso / Tiers (OCR)
Cette règle détermine si la facture est une charge légitime ou s'il s'agit d'une dépense personnelle ou pour un tiers (qui doit être rejetée).

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
      supplier.includes("FNAC") ||
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

// ACCEPTATION PRO : isProRecipient && !isTiers
```

### B. Moteur d'Heuristique d'Auto-Catégorisation
Permet de classer automatiquement les transactions dans l'une des 7 catégories de l'application.

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
  if (labelLower.includes("amazon") || labelLower.includes("papeterie") || labelLower.includes("office") || labelLower.includes("fnac")) {
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

### C. Règle d'Intégrité de la Base Locale (Double Synchronisation)
Pour éviter tout décalage d'état visuel, tout module d'import de justificatif doit obligatoirement effectuer une **double écriture synchrone** :
1.  **Pennylane API** : Envoi du fichier (`POST /file_attachments`) et importation du justificatif fournisseur (`POST /supplier_invoices/import`).
2.  **Base Locale (Supabase + Prisma)** : Upload du fichier dans le bucket `invoices` de Supabase Storage, puis création d'un enregistrement `Invoice` dans la base SQL locale via Prisma avec le statut `COMPLETED`.

---

## 📂 7. Rôles et Exécution des Scripts du Projet

Les scripts principaux se trouvent dans `/scripts/` et peuvent être exécutés individuellement.

### 1. `rename_local_invoices_ia.ts`
Scanne les dossiers de factures locaux. Appelle Gemini pour analyser chaque PDF générique, renomme les fichiers valides sous le format propre, et déplace les rejets personnels dans `REJETE/`.
```bash
# Exécution réelle
npx ts-node scripts/rename_local_invoices_ia.ts --run
```

### 2. `clean_pennylane_justificatifs.ts`
Télécharge les factures de Pennylane, effectue l'OCR Gemini, met à jour le titre pro, ou dé-lettre et archive les factures privées.
```bash
npx ts-node scripts/clean_pennylane_justificatifs.ts
```

### 3. `reconcile_all_local_invoices.ts`
Recherche les transactions correspondantes non lettrées sur Pennylane, téléverse le fichier et effectue le rapprochement.
```bash
npx ts-node scripts/reconcile_all_local_invoices.ts
```

### 4. `reupload_and_reconcile.ts`
Neutralise les factures obsolètes (décalage de date), purge la base locale, téléverse les factures pro triées du Bureau et les rapproche des écritures bancaires 2025/2026.
```bash
npx ts-node scripts/reupload_and_reconcile.ts
```

---

## 💻 8. Guide de Démarrage et Développement

### 1. Variables d'Environnement requises (`.env`)
```env
DATABASE_URL="postgresql://user:password@db.supabase.co:5432/postgres?schema=public"
PENNYLANE_API_KEY="votre_cle_pennylane_api"
GEMINI_API_KEY="votre_cle_gemini_api"
```

### 2. Démarrage de l'Application Locale
```bash
chmod +x scripts/start_compta_app.sh
./scripts/start_compta_app.sh
```

### 3. Synchronisation de la Base de Données (Prisma)
```bash
npx prisma db push
npx prisma generate
```
