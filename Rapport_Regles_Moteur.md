# Référentiel des Règles, Scripts et Code du Moteur de Comptabilité

**Date du document :** 9 juillet 2026 (Mise à jour de l'après-midi)
**Version du Moteur :** v2.8 (Juillet 2026)
**Propriétaire :** Guillaume Philippe (FeelProd)

---

## I. Les Règles de Gestion Comptable (Pro/Perso)

### 1. Protocole de Renommage et Format Cible
Le nom de fichier généré par le moteur doit suivre rigoureusement le schéma suivant :
👉 **`[DATE (AAAA-MM-JJ)] - [FOURNISSEUR]_[DESCRIPTION] - [MONTANT]€.[EXT]`**

*   **Formatage du bloc central `[FOURNISSEUR]_[DESCRIPTION]`** :
    *   Tout en MAJUSCULES, accents supprimés.
    *   Espaces et caractères spéciaux remplacés par des underscores `_`.
    *   Si la description est générique, on ne garde que le fournisseur.
*   **Formatage du bloc montant `[MONTANT]€`** :
    *   Montant décimal à deux chiffres après la virgule (ex: `1848.00`).
    *   Le symbole `€` est accolé directement sans espace ni mention "EUR".

*Exemples types :*
*   `2026-05-27 - VIA_SANA_SERVICE_STANDARD - 1848.00€.pdf`
*   `2026-03-21 - VERCEL_INC_SERVICES_CLOUD - 162.18€.pdf`

---

### 2. Règle de Destinataire (Apple & Amazon)
*   **Critère d'Acceptation (Pro) :** Le justificatif est valide s'il mentionne le destinataire **`Guillaume Philippe`** ou **`Philippe Guillaume`**.
*   **Moyen de paiement (Amazon) :** Les achats Amazon pro sont uniquement validés s'ils sont réglés via **PayPal** ou les cartes professionnelles se terminant par **`1397`** ou **`6150`**.

---

### 3. Règle pour les autres Fournisseurs
*   Tout justificatif adressé à des tiers (*Kacha*, *Anita*, *Sabrina Kanouche*) est rejeté dans le répertoire `REJETE/` sous les catégories `REJETE_TIERS` ou `ERREUR_DATE`.

---

### 4. Exceptions Légales et Techniques (Mise à jour v2.1)
*   **Fournisseurs Technologiques / SaaS :** Les factures de *Google Cloud*, *Vercel*, *Supabase*, *Cloudflare*, *OpenAI*, *OpenRouter*, *GitHub*, *Canva*, *Suno*, *Adobe* et *Stripe* sont validées en pro même si le destinataire est vide ou contient la marque **`feelprod`**.
*   **Frais de Déplacement & Restauration (< 150 €) :** Pour les montants inférieurs à 150 €, les tickets ne comportant pas de nom de destinataire (ex: *Le Paris Halles*, péages *SAPN*, *APRR*, parkings *Indigo*, carburant *Total*) sont validés comme professionnels dès lors qu'ils correspondent à une transaction sur le compte pro.

---

### 5. Rapprochement et Résolution PayPal (Mise à jour v2.2)
*   **Résolution du Marchand Réel :** Les transactions PayPal (portant le libellé bancaire générique `PayPal Europe`) sont automatiquement résolues via le fichier `paypal_cache.json` pour identifier le fournisseur d'origine.
*   **Extraction des Mails PayPal :** Si aucun justificatif PDF officiel du marchand n'est trouvé, l'Autopilot recherche dans les e-mails Gmail/iCloud le reçu de paiement envoyé par PayPal correspondant au montant exact et à la date (+/- 15 jours). Il extrait le nom du revendeur, convertit le corps HTML du mail en justificatif et l'importe sous extension `.html` sur Pennylane.

---

### 6. Optimisations, Sauvegarde Locale et Cohérence (Mise à jour v2.8)
*   **Sauvegarde Locale Automatisée (Dossier Compta)** : Avant chaque synchronisation avec Pennylane, l'Autopilot télécharge le justificatif extrait, le renomme proprement et le sauvegarde sur votre machine dans le dossier `/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/` sous le bon répertoire d'année (`Factures YYYY`) et de mois (ex: `07 - Juillet`).
*   **Exclusion du Nom du Porteur** : Les prénoms et noms du titulaire de la carte (`guillaume`, `philippe`) et les termes comme `cblm` et `paris` sont exclus de la recherche de mots-clés.
*   **Recherche 100% E-mail (Retrait du scan local)** : À la demande de l'utilisateur, la recherche locale sur l'ordinateur a été entièrement retirée pour préserver la confidentialité et éviter d'ouvrir des documents personnels locaux. L'Autopilot cherche désormais uniquement dans vos boîtes mails (Gmail et iCloud).
*   **Traitement par Lots et Parallélisation** : L'Autopilot traite les requêtes par lots de 3 en parallèle et interroge Gmail et iCloud simultanément pour accélérer le traitement.

---

## II. Les Scripts d'Automatisation du Dossier

Le dossier `compta/scripts/` comprend plusieurs scripts clés pour automatiser les flux. Voici comment les exécuter et leur rôle :

1.  **Démarrer l'Application :**
    ```bash
    ./scripts/start_compta_app.sh
    ```
    *Libère le port 3000 si occupé et lance le serveur local Next.js.*

2.  **Renommer et Trier les Pièces Locaux :**
    ```bash
    npx ts-node scripts/rename_local_invoices_ia.ts
    ```
    *Scan les dossiers locaux de factures, extrait le fournisseur, la date et le montant via Gemini, renomme les fichiers propres et préfixe les rejets par `REJETE - ...`.*

3.  **Nettoyer les Pièces sur Pennylane :**
    ```bash
    npx ts-node scripts/clean_pennylane_justificatifs.ts
    ```
    *Analyse les pièces jointes génériques sur Pennylane, extrait le libellé via Gemini, renomme les factures pro et dé-lettre/rejette les pièces perso.*

4.  **Ré-injecter et Rapprocher en Masse (Nouveau) :**
    ```bash
    npx ts-node scripts/reupload_and_reconcile.ts
    ```
    *Neutralise les factures obsolètes (décalage de date), purge la base locale, téléverse les factures pro triées du Bureau et les rapproche des écritures bancaires 2025/2026.*

5.  **Mettre à jour le Cache PayPal :**
    ```bash
    npm run sync-paypal
    ```
    *Se connecte à vos e-mails pour y numériser et extraire les reçus de paiement PayPal et mettre à jour le cache local.*

---

## III. Les Algorithmes de Décision Clés (Code Source)

### 1. Règle d'Acceptation Pro du Destinataire (OCR Gemini)

```typescript
const isProRecipient = recipient.includes("guillaume philippe") ||
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
                               supplier.includes("RESTAURANT") || 
                               supplier.includes("PEAGE") || 
                               supplier.includes("INDIGO") ||
                               supplier.includes("TOTAL")
                           ))
                       ));

const isTiers = recipient.includes("sabrina") || 
                recipient.includes("kanouche") || 
                recipient.includes("anita") || 
                recipient.includes("kacha");
```

### 2. Algorithme d'Auto-Catégorisation des Transactions

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
  if (labelLower.includes("sncf") || labelLower.includes("peage") || labelLower.includes("uber") || labelLower.includes("parking") || labelLower.includes("total")) {
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

---

## IV. Règle d'Intégrité de la Base Locale (Double Synchronisation)

Pour éviter tout décalage d'état entre Pennylane et l'application locale :
*   **Règle absolue :** Tout module d'importation de justificatif dans l'application doit réaliser une **double écriture synchrone** :
    1.  **Pennylane API** : Envoi du fichier (`POST /file_attachments`) et importation du justificatif fournisseur (`POST /supplier_invoices/import`).
    2.  **Base Locale (Supabase + Prisma)** : Upload du fichier dans le bucket `invoices` de Supabase Storage, puis création d'un enregistrement `Invoice` dans la base SQL locale via Prisma avec le statut `COMPLETED`.
