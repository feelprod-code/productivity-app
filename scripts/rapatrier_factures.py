#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de Rapatriement et Renommage des Factures Pennylane 2025-2026 via Gemini.
Auteur : FeelProd Automation
Description : Télécharge les justificatifs d'achat Pennylane, les analyse via Gemini 3-Flash
              pour extraire l'intitulé réel, la date et le montant, puis les enregistre
              sur le Bureau classés par année et par mois.
"""

import os
import sys
import time
import tempfile
import re
import json
import argparse
import requests
import urllib.parse
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Importation du SDK Gemini officiel
from google import genai
from google.genai import types

# Charger les variables d'environnement du projet compta en priorité
compta_env = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(compta_env, override=True)
load_dotenv(override=True)

PENNYLANE_API_KEY = os.getenv("PENNYLANE_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PENNYLANE_BASE_URL = "https://app.pennylane.com/api/external/v2"
DESKTOP_DIR = "/Users/philippeguillaume/Desktop/Factures_Rapatriees"
CACHE_FILE = os.path.join(os.path.dirname(__file__), "rapatrier_cache.json")

# Vérifications initiales
if not GEMINI_API_KEY:
    print("❌ Erreur : La clé d'API GEMINI_API_KEY est manquante dans votre fichier .env.")
    sys.exit(1)

if not PENNYLANE_API_KEY:
    print("❌ Erreur : La clé d'API PENNYLANE_API_KEY est manquante.")
    sys.exit(1)

# Initialisation du client Gemini
gemini_client = genai.Client()

# Structure pour l'extraction Gemini
class InvoiceExtraction(BaseModel):
    supplier_name: str = Field(
        description="Le nom exact et condensé du fournisseur (ex: Adobe, Sony, DJI, EDF, Amazon, Bouygues, etc.). Pas d'extensions juridiques."
    )
    invoice_date: Optional[str] = Field(
        None, 
        description="La date d'émission de la facture au format YYYY-MM-DD. None si introuvable."
    )
    amount: Optional[float] = Field(
        None, 
        description="Le montant total toutes taxes comprises (TTC) payé ou dû. None si introuvable."
    )

# Cache local
def load_cache() -> Dict[str, Any]:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ Erreur lors de la lecture du cache : {e}. Création d'un nouveau cache.")
    return {}

def save_cache(cache: Dict[str, Any]):
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ Erreur lors de la sauvegarde du cache : {e}")

# Fonctions d'interaction API Pennylane
def call_pennylane_api(method: str, endpoint: str, params: Dict = None) -> Dict[str, Any]:
    url = f"{PENNYLANE_BASE_URL}/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {PENNYLANE_API_KEY}",
        "Content-Type": "application/json",
        "X-Use-2026-API-Changes": "true",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"
    }
    # Temporisation pour respecter le Rate Limiting (5 req/sec max)
    time.sleep(0.25)
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params)
        else:
            raise ValueError(f"HTTP Method {method} not supported in read-only task.")
            
        if response.status_code == 429:
            print("⚠️ Rate limit atteint (HTTP 429). Pause de 2 secondes...")
            time.sleep(2.0)
            return call_pennylane_api(method, endpoint, params)
            
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"❌ Erreur Pennylane {method} {url} : {e}")
        raise

def fetch_invoices_2025_2026() -> List[Dict[str, Any]]:
    print("⏳ Récupération de l'ensemble des factures d'achat (2025-2026) depuis Pennylane...")
    invoices = []
    
    # Filtre sur la date d'émission supérieure ou égale au 1er Janvier 2025
    filter_obj = [
        { "field": "date", "operator": "gteq", "value": "2025-01-01" }
    ]
    # Très important : l'API Pennylane rejette les requêtes avec espaces dans le filtre JSON
    filter_str = json.dumps(filter_obj, separators=(',', ':'))
    
    params = {
        "filter": filter_str,
        "limit": 100
    }
    
    endpoint = "supplier_invoices"
    
    while True:
        data = call_pennylane_api("GET", endpoint, params=params)
        batch = data.get("items") or data.get("supplier_invoices") or []
        invoices.extend(batch)
        
        next_cursor = data.get("next_cursor") or data.get("meta", {}).get("next_cursor")
        if not next_cursor:
            break
        params["cursor"] = next_cursor
        
    print(f"📋 {len(invoices)} factures d'achat totales récupérées pour la période 2025-2026.")
    return invoices

# Analyse de justificatif avec Gemini
def analyze_pdf_with_gemini(pdf_url: str) -> Optional[Dict[str, Any]]:
    print(f"   🧠 Analyse du PDF par Gemini...")
    temp_file_path = None
    try:
        # Décoder l'URL pour éviter le double encodage dans requests
        decoded_url = urllib.parse.unquote(pdf_url)
        # Téléchargement
        response = requests.get(decoded_url, stream=True, timeout=30)
        response.raise_for_status()
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            for chunk in response.iter_content(chunk_size=8192):
                temp_file.write(chunk)
            temp_file_path = temp_file.name
            
        # Upload sur l'API Files de Gemini
        uploaded_file = gemini_client.files.upload(file=temp_file_path)
        
        prompt = (
            "Analyse ce justificatif d'achat. Extrais de manière très précise le nom du fournisseur, "
            "la date d'émission (format YYYY-MM-DD) et le montant total toutes taxes comprises (TTC) payé ou dû."
        )
        
        # Configuration Structured Output
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=InvoiceExtraction,
            temperature=0.0
        )
        
        result = gemini_client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[prompt, uploaded_file],
            config=gen_config
        )
        
        # Nettoyage
        try:
            gemini_client.files.delete(name=uploaded_file.name)
        except Exception:
            pass
            
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            
        # Parsing du résultat
        data = InvoiceExtraction.model_validate_json(result.text)
        return {
            "supplier_name": data.supplier_name,
            "invoice_date": data.invoice_date,
            "amount": data.amount
        }
    except Exception as e:
        print(f"   ❌ Erreur d'analyse Gemini : {e}")
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        return None

# Nettoyer les caractères interdits pour le système de fichier
def sanitize_filename(name: str) -> str:
    # Remplacer les caractères non autorisés par des tirets
    clean = re.sub(r'[\\/*?:"<>|]', '-', name)
    # Remplacer les espaces multiples
    clean = re.sub(r'\s+', ' ', clean)
    return clean.strip().upper()

# Télécharger le PDF physique
def download_pdf_to_dest(pdf_url: str, dest_path: str, retries: int = 3) -> bool:
    # Sleep systématique pour éviter d'inonder Pennylane
    time.sleep(1.0)
    
    # Décoder l'URL pour éviter le double encodage dans requests
    decoded_url = urllib.parse.unquote(pdf_url)
    
    for attempt in range(retries):
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"
            }
            response = requests.get(decoded_url, headers=headers, stream=True, timeout=30)
            
            if response.status_code == 429:
                wait_time = (attempt + 1) * 3.0
                print(f"   ⚠️ Rate limit sur le téléchargement PDF (429). Pause de {wait_time}s (Essai {attempt + 1}/{retries})...")
                time.sleep(wait_time)
                continue
                
            response.raise_for_status()
            with open(dest_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            return True
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2.0)
                continue
            print(f"   ❌ Erreur de téléchargement physique : {e}")
            return False
    return False

# Orchestration du script
def main():
    parser = argparse.ArgumentParser(description="Rapatriement et renommage des factures Pennylane.")
    parser.add_argument("--limit", type=int, default=0, help="Limiter le nombre de factures à traiter (0 = sans limite).")
    parser.add_argument("--force", action="store_true", help="Forcer l'analyse par Gemini même si en cache.")
    parser.add_argument("--dry-run", action="store_true", help="Mode simulation sans création de dossiers ou de fichiers.")
    args = parser.parse_args()

    cache = load_cache()
    invoices = fetch_invoices_2025_2026()
    
    # Filtrer uniquement les factures qui ont un justificatif
    invoices_with_files = [inv for inv in invoices if inv.get("public_file_url")]
    total_files = len(invoices_with_files)
    print(f"🎯 {total_files} factures possèdent un fichier justificatif associé.")
    
    if args.limit > 0:
        invoices_with_files = invoices_with_files[:args.limit]
        print(f"⚠️ Traitement limité aux {len(invoices_with_files)} premières factures.")

    processed_count = 0
    success_count = 0
    
    for idx, inv in enumerate(invoices_with_files, start=1):
        inv_id = str(inv.get("id"))
        pennylane_date = inv.get("date")
        pennylane_supplier = inv.get("supplier_name") or "INCONNU"
        pennylane_amount = inv.get("amount")
        pdf_url = inv.get("public_file_url")
        
        print(f"\n──────────────────────────────────────────────────")
        print(f"[{idx}/{len(invoices_with_files)}] Traitement facture ID : {inv_id}")
        print(f"   Pennylane : {pennylane_date} | {pennylane_supplier} | {pennylane_amount} €")
        
        # 1. Obtenir les métadonnées réelles via cache ou Gemini
        info = None
        if not args.force and inv_id in cache:
            print("   💾 Récupération depuis le cache local...")
            info = cache[inv_id]
        else:
            info = analyze_pdf_with_gemini(pdf_url)
            if info:
                # Sauvegarde immédiate dans le cache
                cache[inv_id] = info
                save_cache(cache)
                
        # Si Gemini a échoué ou n'a rien extrait, on se replie sur les données Pennylane
        if not info:
            print("   ⚠️ Échec de l'extraction par Gemini. Repli sur les métadonnées Pennylane.")
            info = {
                "supplier_name": pennylane_supplier,
                "invoice_date": pennylane_date,
                "amount": pennylane_amount
            }
            
        real_supplier = info.get("supplier_name") or pennylane_supplier
        real_date = info.get("invoice_date") or pennylane_date
        real_amount = info.get("amount")
        if real_amount is None:
            real_amount = pennylane_amount
            
        # Formatage des données
        real_supplier = sanitize_filename(real_supplier)
        
        # Détermination de l'année et du mois
        year = "INCONNU"
        month = "INCONNU"
        if real_date and len(real_date) >= 7:
            match = re.match(r"(\d{4})-(\d{2})", real_date)
            if match:
                year = match.group(1)
                month_num = match.group(2)
                
                # Traduction en nom de mois en français
                month_names = {
                    "01": "01 - Janvier", "02": "02 - Février", "03": "03 - Mars",
                    "04": "04 - Avril", "05": "05 - Mai", "06": "06 - Juin",
                    "07": "07 - Juillet", "08": "08 - Août", "09": "09 - Septembre",
                    "10": "10 - Octobre", "11": "11 - Novembre", "12": "12 - Décembre"
                }
                month = month_names.get(month_num, month_num)
                
        # Garder uniquement 2025 et 2026
        if year not in ["2025", "2026"]:
            print(f"   ⏭️ Facture ignorée car l'année réelle ({year}) n'est ni 2025 ni 2026.")
            continue
            
        # Montant formatté à deux décimales
        try:
            amount_val = float(real_amount)
            amount_str = f"{amount_val:.2f}"
        except (ValueError, TypeError):
            amount_str = "0.00"
            
        # 2. Construction du nom de fichier propre
        file_date = real_date if real_date else "0000-00-00"
        filename = f"{file_date} - {real_supplier} - {amount_str}EUR.pdf"
        
        # 3. Répertoire de destination
        # 3. Répertoire de destination direct sur le Bureau
        parent_desktop = f"/Users/philippeguillaume/Desktop/Factures {year}"
        target_dir = os.path.join(parent_desktop, month)
        dest_path = os.path.join(target_dir, filename)
        
        print(f"   🔮 Cible réelle : {real_date} | {real_supplier} | {amount_str} €")
        print(f"   📂 Fichier prévu : Factures {year}/{month}/{filename}")
        
        if args.dry_run:
            print("   ✨ [DRY-RUN] Simulation réussie (aucun fichier écrit).")
            success_count += 1
        else:
            # Si le fichier existe déjà, pas besoin de le retélécharger
            if os.path.exists(dest_path):
                print(f"   ℹ️ Le fichier existe déjà sur le Bureau. Passage au suivant.")
                success_count += 1
            else:
                # Création du dossier
                os.makedirs(target_dir, exist_ok=True)
                
                # Téléchargement
                if download_pdf_to_dest(pdf_url, dest_path):
                    print(f"   ✅ Fichier enregistré sur le Bureau avec succès.")
                    success_count += 1
                else:
                    print(f"   ❌ Échec du téléchargement du fichier.")
                
        processed_count += 1
        
    print(f"\n==================================================")
    print(f"🎉 Tâche terminée !")
    print(f"   Factures traitées : {processed_count}/{len(invoices_with_files)}")
    print(f"   Rapatriements réussis : {success_count}/{processed_count}")
    if not args.dry_run:
        print(f"   Dossier de destination : {DESKTOP_DIR}")
    print(f"==================================================")

if __name__ == "__main__":
    main()
