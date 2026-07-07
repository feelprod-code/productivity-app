#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import time
import json
import re
import requests
from dotenv import load_dotenv

# Charger les variables d'environnement
compta_env = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(compta_env, override=True)

PENNYLANE_API_KEY = os.getenv("PENNYLANE_API_KEY")
PENNYLANE_BASE_URL = "https://app.pennylane.com/api/external/v2"
DESKTOP_DIR = "/Users/philippeguillaume/Desktop"
CACHE_FILE = os.path.join(os.path.dirname(__file__), "import_dynamique_cache.json")

if not PENNYLANE_API_KEY:
    print("❌ Erreur : La clé d'API PENNYLANE_API_KEY est manquante.")
    sys.exit(1)

# Dictionnaire de cache en mémoire pour éviter d'appeler l'API Pennylane à chaque fois pour le même fournisseur
suppliers_cache = {}

def load_import_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_import_cache(cache):
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ Erreur sauvegarde cache : {e}")

def get_or_create_supplier_id(supplier_name):
    # 1. Vérifier dans le cache local en mémoire
    if supplier_name.upper() in suppliers_cache:
        return suppliers_cache[supplier_name.upper()]
        
    # 2. Chercher sur Pennylane
    url_list = f"{PENNYLANE_BASE_URL}/suppliers"
    headers = {
        "Authorization": f"Bearer {PENNYLANE_API_KEY}",
        "X-Use-2026-API-Changes": "true"
    }
    
    try:
        # Pause de précaution pour respecter le rate limit
        time.sleep(0.5)
        response = requests.get(url_list, headers=headers, params={"limit": 100}, timeout=30)
        
        if response.status_code == 429:
            time.sleep(3.0)
            return get_or_create_supplier_id(supplier_name)
            
        response.raise_for_status()
        data = response.json()
        suppliers = data.get("items") or data.get("suppliers") or []
        
        # Recherche par correspondance de nom (insensible à la casse)
        for s in suppliers:
            if (s.get("name") or "").strip().upper() == supplier_name.strip().upper():
                s_id = s.get("id")
                suppliers_cache[supplier_name.upper()] = s_id
                print(f"   ℹ️ Fournisseur existant trouvé : {supplier_name} (ID: {s_id})")
                return s_id
                
        # 3. Si non trouvé, créer le fournisseur
        print(f"   ➕ Création du fournisseur sur Pennylane : {supplier_name}")
        time.sleep(0.5)
        url_create = f"{PENNYLANE_BASE_URL}/suppliers"
        create_res = requests.post(url_create, headers=headers, json={"name": supplier_name.upper()}, timeout=30)
        
        if create_res.status_code == 429:
            time.sleep(3.0)
            return get_or_create_supplier_id(supplier_name)
            
        create_res.raise_for_status()
        res_json = create_res.json()
        new_id = res_json.get("supplier", {}).get("id") or res_json.get("id")
        
        if new_id:
            suppliers_cache[supplier_name.upper()] = new_id
            print(f"   ✅ Fournisseur créé avec succès : {supplier_name} (ID: {new_id})")
            return new_id
            
    except Exception as e:
        print(f"   ❌ Erreur lors de la recherche/création du fournisseur {supplier_name} : {e}")
        
    return None

def upload_file_attachment(file_path):
    url = f"{PENNYLANE_BASE_URL}/file_attachments"
    headers = {
        "Authorization": f"Bearer {PENNYLANE_API_KEY}",
        "X-Use-2026-API-Changes": "true"
    }
    
    try:
        filename = os.path.basename(file_path)
        with open(file_path, 'rb') as f:
            files = {
                'file': (filename, f, 'application/pdf')
            }
            response = requests.post(url, headers=headers, files=files, timeout=45)
            
            if response.status_code == 429:
                time.sleep(4.0)
                return upload_file_attachment(file_path)
                
            response.raise_for_status()
            res_json = response.json()
            return res_json.get("id") or res_json.get("file_attachment", {}).get("id")
    except Exception as e:
        print(f"   ❌ Erreur lors de l'upload du justificatif : {e}")
        return None

def import_supplier_invoice(file_attachment_id, supplier_id, date_str, amount, supplier_name):
    url = f"{PENNYLANE_BASE_URL}/supplier_invoices/import"
    headers = {
        "Authorization": f"Bearer {PENNYLANE_API_KEY}",
        "Content-Type": "application/json",
        "X-Use-2026-API-Changes": "true"
    }
    
    payload = {
        "file_attachment_id": file_attachment_id,
        "supplier_id": supplier_id,
        "date": date_str,
        "deadline": date_str,
        "currency_amount": f"{amount:.2f}",
        "currency_amount_before_tax": f"{amount:.2f}",
        "currency_tax": "0.00",
        "currency": "EUR",
        "invoice_lines": [
            {
                "currency_amount": f"{amount:.2f}",
                "currency_tax": "0.00",
                "vat_rate": "exempt",
                "label": f"Achat {supplier_name}"
            }
        ]
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 429:
            time.sleep(4.0)
            return import_supplier_invoice(file_attachment_id, supplier_id, date_str, amount, supplier_name)
            
        if response.status_code == 409:
            print("   ℹ️ Facture déjà existante (doublon évité).")
            return "ALREADY_EXISTS"
            
        response.raise_for_status()
        return "SUCCESS"
    except Exception as e:
        print(f"   ❌ Échec de la création de la facture Pennylane : {e}")
        return "FAILED"

def main():
    cache = load_import_cache()
    years = ["2025", "2026"]
    
    # 1. Lister tous les fichiers à importer
    files_to_import = []
    for y in years:
        year_dir = os.path.join(DESKTOP_DIR, f"Factures {y}")
        if not os.path.exists(year_dir):
            continue
            
        for root, dirs, files in os.walk(year_dir):
            for file in files:
                if not file.lower().endswith('.pdf'):
                    continue
                # Format : YYYY-MM-DD - FOURNISSEUR - MONTANTEUR.pdf
                regex = r"^(\d{4}-\d{2}-\d{2})\s+-\s+(.+?)\s+-\s+([\d.]+)(?:EUR)?\.pdf$"
                match = re.match(regex, file, re.IGNORECASE)
                if match:
                    date_str = match.group(1)
                    supplier = match.group(2).strip()
                    amount = float(match.group(3))
                    
                    files_to_import.append({
                        "filepath": os.path.join(root, file),
                        "filename": file,
                        "date": date_str,
                        "supplier": supplier,
                        "amount": amount
                    })
                    
    total_files = len(files_to_import)
    print(f"🚀 {total_files} factures prêtes à être injectées de façon dynamique sur Pennylane.")
    
    success_count = 0
    
    for idx, item in enumerate(files_to_import, start=1):
        filepath = item["filepath"]
        filename = item["filename"]
        supplier_name = item["supplier"]
        
        # Ignorer si déjà importé avec succès dans le cache
        if filename in cache and cache[filename].get("status") in ["SUCCESS", "ALREADY_EXISTS"]:
            print(f"[{idx}/{total_files}] ℹ️ Déjà traité (cache) : {filename}")
            success_count += 1
            continue
            
        print(f"\n[{idx}/{total_files}] ⏳ Traitement de : {filename}")
        
        # Respecter le rate limit
        time.sleep(1.0)
        
        # Step 1: Obtenir ou créer le fournisseur
        supplier_id = get_or_create_supplier_id(supplier_name)
        if not supplier_id:
            print("   ❌ Impossible d'obtenir un ID de fournisseur valide. Passage au fichier suivant.")
            cache[filename] = {"status": "FAILED", "reason": "no_supplier_id"}
            save_import_cache(cache)
            continue
            
        # Step 2: Uploader le PDF
        time.sleep(1.0)
        attachment_id = upload_file_attachment(filepath)
        if not attachment_id:
            print("   ❌ Échec du téléversement du justificatif.")
            cache[filename] = {"status": "FAILED", "reason": "upload_failed"}
            save_import_cache(cache)
            continue
            
        # Step 3: Importer la facture d'achat
        time.sleep(1.0)
        status = import_supplier_invoice(attachment_id, supplier_id, item["date"], item["amount"], supplier_name)
        
        if status in ["SUCCESS", "ALREADY_EXISTS"]:
            print(f"   ✅ Opération terminée ({status}).")
            cache[filename] = {"status": status, "id": attachment_id}
            save_import_cache(cache)
            success_count += 1
        else:
            cache[filename] = {"status": "FAILED", "reason": "import_failed"}
            save_import_cache(cache)
            
    print(f"\n==================================================")
    print(f"🎉 Processus d'importation terminé !")
    print(f"   Rapprochements et injections réussis : {success_count}/{total_files}")
    print(f"==================================================")

if __name__ == "__main__":
    main()
