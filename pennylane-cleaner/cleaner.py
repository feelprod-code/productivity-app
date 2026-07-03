#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Assistant de Nettoyage Pennylane x Gemini
Auteur : FeelProd Automation
Description : Ce script récupère les factures fournisseurs de Pennylane n'ayant pas de fournisseur
              renseigné, télécharge le justificatif PDF associé, l'analyse avec Gemini 2.5/3 Flash,
              effectue un matching intelligent de fournisseur et met à jour Pennylane.
"""

import os
import sys
import time
import tempfile
import re
import requests
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Importation du SDK Gemini officiel moderne
from google import genai
from google.genai import types

# Charger les variables d'environnement (.env local)
# Recherche d'abord dans le dossier courant, puis dans le dossier parent
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Configuration
PENNYLANE_API_KEY = os.getenv("PENNYLANE_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PENNYLANE_BASE_URL = "https://app.pennylane.com/api/external/v2"

# Validation des clés requises
if not GEMINI_API_KEY:
    print("❌ Erreur : La variable d'environnement GEMINI_API_KEY est manquante dans ton fichier .env.")
    sys.exit(1)

if not PENNYLANE_API_KEY:
    print("❌ Erreur : La variable d'environnement PENNYLANE_API_KEY est manquante.")
    print("👉 Assure-toi de la renseigner dans ton fichier .env ou de la définir en variable d'environnement.")
    # On ne s'arrête pas ici au cas où l'utilisateur veut exécuter en mode test sans Pennylane
    # mais on affichera une erreur si une requête Pennylane est tentée.

# Initialiser le client de l'API Gemini
# Le SDK google-genai utilise par défaut la variable GEMINI_API_KEY
gemini_client = genai.Client()

# Définition du schéma pour l'extraction structurée par Gemini
class InvoiceExtraction(BaseModel):
    supplier_name: str = Field(
        description="Le nom exact du fournisseur (ex: Adobe, Sony, DJI, EDF, OVH, etc.). Sois concis."
    )
    invoice_date: Optional[str] = Field(
        None, 
        description="La date d'émission de la facture au format YYYY-MM-DD. None si introuvable."
    )
    amount_before_tax: Optional[float] = Field(
        None, 
        description="Le montant total hors taxes (HT) en euros. Utilise des points pour les décimales."
    )
    tax: Optional[float] = Field(
        None, 
        description="Le montant total de la TVA en euros. None si non applicable ou introuvable."
    )
    amount: Optional[float] = Field(
        None, 
        description="Le montant total toutes taxes comprises (TTC) en euros. Utilise des points pour les décimales."
    )


# =====================================================================
# Fonctions d'interaction avec l'API Pennylane
# =====================================================================

def get_pennylane_headers() -> Dict[str, str]:
    """Retourne les en-têtes requis pour s'authentifier auprès de l'API Pennylane."""
    if not PENNYLANE_API_KEY:
        raise ValueError("La clé d'API Pennylane (PENNYLANE_API_KEY) n'est pas configurée.")
    return {
        "Authorization": f"Bearer {PENNYLANE_API_KEY}",
        "Content-Type": "application/json",
        "X-Use-2026-API-Changes": "true"  # Pour s'assurer de la compatibilité V2 à jour
    }

def call_pennylane_api(method: str, endpoint: str, params: Dict = None, json_data: Dict = None) -> Dict[str, Any]:
    """Enveloppe robuste pour faire des requêtes à Pennylane avec temporisation pour le Rate Limiting."""
    url = f"{PENNYLANE_BASE_URL}/{endpoint.lstrip('/')}"
    headers = get_pennylane_headers()
    
    # Pause systématique pour respecter la limite de 5 req/s (Rate Limiting de Pennylane)
    time.sleep(0.25)
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, json=json_data)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, json=json_data)
        elif method.upper() == "PATCH":
            response = requests.patch(url, headers=headers, json=json_data)
        else:
            raise ValueError(f"Méthode HTTP non supportée : {method}")
            
        # Gérer spécifiquement le rate limit 429 au cas où
        if response.status_code == 429:
            print("⚠️ Rate limit atteint (HTTP 429). Pause forcée de 2 secondes...")
            time.sleep(2.0)
            return call_pennylane_api(method, endpoint, params, json_data)
            
        response.raise_for_status()
        
        # Gérer les réponses vides (ex: 204 No Content)
        if response.status_code == 204:
            return {}
            
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ Erreur lors de l'appel Pennylane {method} {url} : {e}")
        if 'response' in locals() and response is not None:
            print(f"   Status Code : {response.status_code}")
            print(f"   Réponse : {response.text}")
        raise

def load_pennylane_suppliers() -> List[Dict[str, Any]]:
    """Récupère l'ensemble des fournisseurs configurés dans Pennylane."""
    print("⏳ Récupération de la liste des fournisseurs Pennylane...")
    suppliers = []
    endpoint = "suppliers"
    params = {"limit": 100}
    
    while True:
        data = call_pennylane_api("GET", endpoint, params=params)
        
        # Récupération de la clé contenant la liste des fournisseurs
        batch = data.get("suppliers", [])
        suppliers.extend(batch)
        
        # Gestion de la pagination par curseur
        next_cursor = data.get("meta", {}).get("next_cursor")
        if next_cursor:
            params["cursor"] = next_cursor
        else:
            break
            
    print(f"✅ {len(suppliers)} fournisseurs récupérés avec succès.")
    return suppliers

def create_pennylane_supplier(name: str) -> Dict[str, Any]:
    """Crée un nouveau fournisseur dans Pennylane et retourne son objet."""
    print(f"➕ Création du nouveau fournisseur dans Pennylane : {name}...")
    payload = {
        "name": name
    }
    return call_pennylane_api("POST", "suppliers", json_data=payload)

def load_incomplete_invoices() -> List[Dict[str, Any]]:
    """
    Récupère la liste des factures fournisseurs à traiter.
    Cible les factures où le fournisseur n'est pas renseigné mais un fichier justificatif est attaché.
    """
    print("⏳ Récupération des factures d'achat depuis Pennylane...")
    invoices = []
    endpoint = "supplier_invoices"
    params = {"limit": 100}
    
    while True:
        data = call_pennylane_api("GET", endpoint, params=params)
        batch = data.get("supplier_invoices", [])
        invoices.extend(batch)
        
        next_cursor = data.get("meta", {}).get("next_cursor")
        if next_cursor:
            params["cursor"] = next_cursor
        else:
            break
            
    print(f"📋 {len(invoices)} factures totales récupérées.")
    
    # Filtrage : Fournisseur manquant (supplier_name ou supplier_id vide/None) ET fichier justificatif présent
    incomplete = []
    for inv in invoices:
        has_no_supplier = (
            not inv.get("supplier_name") or 
            not inv.get("supplier_id") or 
            inv.get("supplier_name").strip() == ""
        )
        has_file = bool(inv.get("file_url"))
        
        if has_no_supplier and has_file:
            incomplete.append(inv)
            
    print(f"🎯 {len(incomplete)} factures incomplètes identifiées avec fichier justificatif attaché.")
    return incomplete

def update_pennylane_invoice(invoice_id: str, update_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Met à jour une facture avec les nouvelles données."""
    endpoint = f"supplier_invoices/{invoice_id}"
    return call_pennylane_api("PUT", endpoint, json_data=update_payload)


# =====================================================================
# Logique d'analyse Gemini & Matching
# =====================================================================

def analyze_pdf_with_gemini(pdf_url: str) -> Optional[InvoiceExtraction]:
    """
    Télécharge le justificatif et utilise Gemini 3-Flash-Preview
    pour en extraire les informations de manière structurée.
    """
    print(f"   📥 Téléchargement du justificatif : {pdf_url}")
    try:
        # Téléchargement du fichier
        response = requests.get(pdf_url, stream=True)
        response.raise_for_status()
        
        # Enregistrement dans un fichier temporaire
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            for chunk in response.iter_content(chunk_size=8192):
                temp_file.write(chunk)
            temp_file_path = temp_file.name
            
        print(f"   🧠 Analyse du PDF par Gemini...")
        
        # Uploader le fichier temporaire avec l'API Files
        uploaded_file = gemini_client.files.upload(file=temp_file_path)
        
        # Appel à Gemini pour l'extraction structurée
        # Note : Nous utilisons le modèle de dernière génération recommandés (gemini-3-flash-preview)
        prompt = (
            "Analyse ce justificatif de dépenses d'achat. "
            "Extrais de manière très précise le nom du fournisseur, la date d'émission, "
            "le montant Hors Taxes (HT), le montant de la TVA et le montant TTC."
        )
        
        # Appel avec Structured Output (Pydantic Schema)
        # Note : On cible "gemini-3-flash-preview" conformément aux standards à jour.
        model_name = "gemini-3-flash-preview"
        
        # La configuration pour Structured Output
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=InvoiceExtraction,
            temperature=0.0, # Température basse pour une extraction factuelle
        )
        
        result = gemini_client.models.generate_content(
            model=model_name,
            contents=[prompt, uploaded_file],
            config=gen_config
        )
        
        # Nettoyage du fichier sur l'API Files
        try:
            gemini_client.files.delete(name=uploaded_file.name)
        except Exception as e:
            # Erreur mineure, on l'ignore pour ne pas bloquer le script
            pass
            
        # Suppression du fichier temporaire local
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            
        # Parser et valider la réponse structurée
        extracted_data = InvoiceExtraction.model_validate_json(result.text)
        return extracted_data
        
    except Exception as e:
        print(f"   ❌ Erreur d'analyse pour le fichier {pdf_url} : {e}")
        # Nettoyage de sécurité du fichier temporaire si existant
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        return None

def clean_text_for_matching(text: str) -> str:
    """Normalise un nom pour faciliter le matching (minuscules, retrait des accents et suffixes d'entreprises)."""
    if not text:
        return ""
    # En minuscules et sans espaces superflus
    text = text.lower().strip()
    # Supprimer les accents simples
    text = re.sub(r'[àáâãäå]', 'a', text)
    text = re.sub(r'[éèêë]', 'e', text)
    text = re.sub(r'[íìîï]', 'i', text)
    text = re.sub(r'[óòôõö]', 'o', text)
    text = re.sub(r'[úùûü]', 'u', text)
    text = re.sub(r'[ç]', 'c', text)
    # Remplacer la ponctuation par des espaces
    text = re.sub(r'[^\w\s]', ' ', text)
    # Supprimer les termes légaux courants de type de société
    suffixes = [
        r'\bsas\b', r'\bsarl\b', r'\binc\b', r'\bltd\b', r'\bco\b', r'\bcorp\b', 
        r'\bsa\b', r'\beurl\b', r'\bste\b', r'\bsociete\b', r'\bsocial\b', r'\bsystems\b',
        r'\bireland\b', r'\beurope\b', r'\bfrance\b'
    ]
    for suffix in suffixes:
        text = re.sub(suffix, '', text)
    # Nettoyer les espaces multiples
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def find_best_supplier_match(extracted_name: str, suppliers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Cherche un fournisseur existant correspondant au nom extrait par Gemini.
    Retourne l'objet fournisseur ou None si aucun ne correspond.
    """
    cleaned_extracted = clean_text_for_matching(extracted_name)
    if not cleaned_extracted:
        return None
        
    # Essayer de trouver une correspondance exacte ou une inclusion réciproque
    for supplier in suppliers:
        supplier_name = supplier.get("name", "")
        cleaned_supplier = clean_text_for_matching(supplier_name)
        
        # Match parfait
        if cleaned_extracted == cleaned_supplier:
            return supplier
            
        # Match par inclusion (ex: "Adobe" dans "Adobe Systems" ou vice versa)
        if len(cleaned_extracted) > 2 and len(cleaned_supplier) > 2:
            if cleaned_extracted in cleaned_supplier or cleaned_supplier in cleaned_extracted:
                return supplier
                
    return None


# =====================================================================
# Logique principale d'orchestration
# =====================================================================

def run_cleaner(dry_run: bool = True, auto_create_supplier: bool = True, limit_count: int = 0):
    """
    Lance le traitement de nettoyage.
    :param dry_run: Si True, affiche les modifications prévues sans les enregistrer sur Pennylane.
    :param auto_create_supplier: Si True, crée automatiquement les nouveaux fournisseurs dans Pennylane.
    :param limit_count: Si > 0, limite le nombre de factures à traiter (idéal pour tester).
    """
    mode_str = "SIMULATION (Dry-Run)" if dry_run else "PRODUCTION (Modifications réelles)"
    print(f"🚀 Lancement du nettoyeur Pennylane x Gemini en mode : {mode_str}\n")
    
    # 1. Charger les factures incomplètes
    try:
        incomplete_invoices = load_incomplete_invoices()
    except Exception:
        print("❌ Impossible de charger les factures depuis Pennylane. Arrêt.")
        return
        
    if not incomplete_invoices:
        print("🎉 Aucune facture incomplète trouvée avec justificatif attaché. Travail terminé !")
        return
        
    # Limiter le nombre de factures si spécifié
    if limit_count > 0:
        print(f"⏳ Limitation du traitement aux {limit_count} premières factures.")
        incomplete_invoices = incomplete_invoices[:limit_count]
        
    # 2. Charger les fournisseurs Pennylane existants
    try:
        suppliers = load_pennylane_suppliers()
    except Exception:
        print("❌ Impossible de charger la liste des fournisseurs Pennylane. Arrêt.")
        return
        
    # Dictionnaire local pour accélérer l'accès aux fournisseurs (Nom normalisé -> Fournisseur)
    # Permet de mettre à jour au fil des créations
    local_suppliers = list(suppliers)
    
    success_count = 0
    skipped_count = 0
    
    print("\n--- Début du traitement des factures ---\n")
    
    for idx, inv in enumerate(incomplete_invoices, 1):
        inv_id = inv.get("id")
        pdf_url = inv.get("file_url")
        inv_label = inv.get("label") or inv.get("invoice_number") or f"Facture #{idx}"
        
        print(f"[{idx}/{len(incomplete_invoices)}] Traitement de la Facture ID {inv_id} ({inv_label})...")
        
        # Analyser le justificatif avec Gemini
        extracted = analyze_pdf_with_gemini(pdf_url)
        if not extracted or not extracted.supplier_name:
            print(f"   ⚠️ Impossible d'extraire les données pour cette facture. Passage à la suivante.")
            skipped_count += 1
            continue
            
        print(f"   💡 Extrait par Gemini :")
        print(f"      - Fournisseur : '{extracted.supplier_name}'")
        print(f"      - Date : {extracted.invoice_date}")
        print(f"      - Montant HT : {extracted.amount_before_tax} €")
        print(f"      - TVA : {extracted.tax} €")
        print(f"      - Montant TTC : {extracted.amount} €")
        
        # Chercher le fournisseur dans Pennylane
        match = find_best_supplier_match(extracted.supplier_name, local_suppliers)
        supplier_id = None
        supplier_name_final = ""
        
        if match:
            supplier_id = match.get("id")
            supplier_name_final = match.get("name")
            print(f"   🔗 Fournisseur existant trouvé : '{supplier_name_final}' (ID: {supplier_id})")
        else:
            print(f"   ❓ Aucun fournisseur existant ne correspond à '{extracted.supplier_name}'")
            if auto_create_supplier:
                if dry_run:
                    print(f"   [Simulation] Serait créé : Nouveau fournisseur '{extracted.supplier_name}'")
                    supplier_id = "NEW_SIMULATED_ID"
                    supplier_name_final = extracted.supplier_name
                else:
                    try:
                        new_supplier = create_pennylane_supplier(extracted.supplier_name)
                        supplier_id = new_supplier.get("id")
                        supplier_name_final = new_supplier.get("name")
                        print(f"   ✅ Nouveau fournisseur créé : '{supplier_name_final}' (ID: {supplier_id})")
                        # Ajouter localement pour les prochaines factures du même fournisseur
                        local_suppliers.append(new_supplier)
                    except Exception as e:
                        print(f"   ❌ Échec de la création du fournisseur. Passage à la suite.")
                        skipped_count += 1
                        continue
            else:
                print("   ⚠️ Option auto_create_supplier désactivée. Passage à la suivante.")
                skipped_count += 1
                continue
                
        # Préparer le payload de mise à jour pour la facture
        # Nous n'écrasons pas les montants s'ils sont déjà renseignés dans Pennylane
        update_payload = {
            "supplier_id": supplier_id
        }
        
        # Mettre à jour la date si manquante dans Pennylane
        if not inv.get("date") and extracted.invoice_date:
            update_payload["date"] = extracted.invoice_date
            
        # Mettre à jour les montants si manquants ou égaux à zéro
        # Pour Pennylane, les montants financiers sont typiquement passés sous forme de chaînes de caractères
        # pour éviter les soucis de précision des flottants.
        try:
            has_no_amount = not inv.get("amount") or float(inv.get("amount")) == 0.0
        except ValueError:
            has_no_amount = True
            
        if has_no_amount:
            if extracted.amount is not None:
                update_payload["amount"] = str(extracted.amount)
                update_payload["currency_amount"] = str(extracted.amount)
            if extracted.amount_before_tax is not None:
                update_payload["currency_amount_before_tax"] = str(extracted.amount_before_tax)
            # Les en-têtes ou champs complémentaires peuvent être ajoutés ici si nécessaire
            
        if dry_run:
            print(f"   [Simulation] Facture ID {inv_id} mise à jour avec : {update_payload}")
            success_count += 1
        else:
            try:
                update_pennylane_invoice(inv_id, update_payload)
                print(f"   🎉 Facture ID {inv_id} : Fournisseur mis à jour -> {supplier_name_final}")
                success_count += 1
            except Exception as e:
                print(f"   ❌ Échec de la mise à jour de la facture {inv_id}.")
                skipped_count += 1
                
        print() # Saut de ligne entre chaque facture
        
    print("--- Fin du traitement ---")
    print(f"📊 Bilan : {success_count} factures traitées avec succès, {skipped_count} ignorées/échouées.\n")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Nettoyer les factures Pennylane avec l'IA de Gemini.")
    parser.add_argument(
        "--run", 
        action="store_true", 
        help="Exécuter les modifications réelles dans Pennylane (sans ce flag, le script tourne en mode simulation/dry-run)."
    )
    parser.add_argument(
        "--no-create", 
        action="store_true", 
        help="Désactiver la création automatique de nouveaux fournisseurs."
    )
    parser.add_argument(
        "--limit", 
        type=int, 
        default=0, 
        help="Limiter le traitement à N factures (ex. --limit 5)."
    )
    
    args = parser.parse_args()
    
    # Par défaut, le script tourne en mode dry_run (simulation)
    # L'utilisateur doit passer explicitement --run pour appliquer les modifications.
    dry_run = not args.run
    auto_create = not args.no_create
    
    run_cleaner(
        dry_run=dry_run, 
        auto_create_supplier=auto_create, 
        limit_count=args.limit
    )
