#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de Renommage Intelligent de Factures via Gemini 3-Flash.
Auteur : FeelProd Automation
Description : Analyse les fichiers PDF de factures ou de reçus bruts (Amazon, PayPal, Spotify, SumUp, etc.),
              en extrait les informations réelles (Date, Fournisseur, Montant TTC) avec Gemini,
              et les renomme proprement au format normalisé : AAAA-MM-JJ - NOM_FOURNISSEUR - MONTANTEUR.pdf.
"""

import os
import sys
import time
import tempfile
import re
import shutil
import argparse
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

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DEFAULT_INPUT_DIR = "/Users/philippeguillaume/Desktop/Factures_A_Renommer"
DEFAULT_OUTPUT_DIR = "/Users/philippeguillaume/Desktop/Factures_Pretes_A_Importer"

if not GEMINI_API_KEY:
    print("❌ Erreur : La clé d'API GEMINI_API_KEY est manquante dans votre fichier .env.")
    sys.exit(1)

# Initialisation du client Gemini
gemini_client = genai.Client()

# Structure pour l'extraction structurée par l'IA
class InvoiceExtraction(BaseModel):
    supplier_name: str = Field(
        description=(
            "Le nom propre du fournisseur en majuscules sans suffixes d'entreprise (SAS, Ltd, SARL, etc.). "
            "RÈGLES D'OR DE NOMMAGE :\n"
            "1. RESTAURANTS / REPAS : Si c'est un reçu de restaurant ou une note de repas, extrayez le nom de l'établissement (ex: 'L'AMI JEAN', 'LE BISTROT').\n"
            "2. PAYPAL : Si le document est un reçu de paiement PayPal ou mentionne un paiement par PayPal, extrayez le marchand d'origine sous le format 'PAYPAL - [NOM_MARCHAND]' (ex: 'PAYPAL - ADOBE').\n"
            "3. SUMUP : Si c'est un relevé d'encaissements ou un reçu client SumUp, utilisez 'SUMUP'.\n"
            "4. TRANSPORTS : Pour Uber, Bolt, SNCF ou Taxis, utilisez le nom propre (ex: 'UBER', 'SNCF', 'TAXI G7').\n"
            "5. AUTRES FACTURES : Pour tout autre fournisseur (Amazon, Spotify, SoundCloud, Gandi, Swiss Life, Bouygues, etc.), utilisez le nom propre nettoyé (ex: 'AMAZON', 'SPOTIFY')."
        )
    )
    invoice_date: Optional[str] = Field(
        None, 
        description="La date d'émission de la facture ou du reçu au format YYYY-MM-DD. None si introuvable."
    )
    amount: Optional[float] = Field(
        None, 
        description="Le montant total toutes taxes comprises (TTC) payé ou facturé. Utilisez des points pour les décimales."
    )

def sanitize_name(name: str) -> str:
    # Remplacer les caractères non autorisés par des tirets
    clean = re.sub(r'[\\/*?:"<>|]', '-', name)
    # Remplacer les espaces multiples
    clean = re.sub(r'\s+', ' ', clean)
    return clean.strip().upper()

def analyze_invoice_pdf(file_path: str) -> Optional[Dict[str, Any]]:
    print(f"🧠 Analyse IA de {os.path.basename(file_path)}...")
    try:
        # Téléverser le fichier sur l'API Files de Gemini
        uploaded_file = gemini_client.files.upload(file=file_path)
        
        prompt = (
            "Analyse ce document de facturation ou de reçu. Extrais avec précision :\n"
            "1. Le nom propre du fournisseur. Si le paiement est fait via PayPal, utilise le format 'PAYPAL - [MARCHAND]' (ex: PAYPAL - ADOBE).\n"
            "2. La date de facturation ou du paiement (format YYYY-MM-DD).\n"
            "3. Le montant total TTC payé."
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
        
        # Nettoyage immédiat sur l'API Files
        try:
            gemini_client.files.delete(name=uploaded_file.name)
        except Exception:
            pass
            
        # Parsing et validation
        data = InvoiceExtraction.model_validate_json(result.text)
        return {
            "supplier_name": data.supplier_name,
            "invoice_date": data.invoice_date,
            "amount": data.amount
        }
    except Exception as e:
        print(f"❌ Erreur lors de l'analyse Gemini : {e}")
        return None

def process_file(file_path: str, output_dir: str, dry_run: bool = False) -> bool:
    if not file_path.lower().endswith('.pdf'):
        print(f"⏭️ Fichier ignoré (non PDF) : {os.path.basename(file_path)}")
        return False
        
    info = analyze_invoice_pdf(file_path)
    if not info:
        print(f"⚠️ Impossible d'analyser le fichier : {os.path.basename(file_path)}")
        return False
        
    supplier = info.get("supplier_name")
    date = info.get("invoice_date")
    amount = info.get("amount")
    
    if not supplier or not date or amount is None:
        print(f"⚠️ Métadonnées incomplètes extraites pour {os.path.basename(file_path)} : "
              f"Fournisseur={supplier}, Date={date}, Montant={amount}")
        # Enregistrement dans un dossier d'erreurs
        error_dir = os.path.join(output_dir, "ERREURS")
        if not dry_run:
            os.makedirs(error_dir, exist_ok=True)
            shutil.copy(file_path, os.path.join(error_dir, os.path.basename(file_path)))
            print(f"📁 Copié dans le dossier ERREURS.")
        return False
        
    # Formatage propre
    supplier = sanitize_name(supplier)
    
    try:
        amount_val = float(amount)
        amount_str = f"{amount_val:.2f}"
    except (ValueError, TypeError):
        amount_str = "0.00"
        
    new_filename = f"{date} - {supplier} - {amount_str}EUR.pdf"
    dest_path = os.path.join(output_dir, new_filename)
    
    print(f"✨ Résultat d'extraction : {date} | {supplier} | {amount_str} €")
    print(f"📂 Nouveau nom : {new_filename}")
    
    if dry_run:
        print(f"✨ [DRY-RUN] Le fichier serait copié vers : {dest_path}")
    else:
        os.makedirs(output_dir, exist_ok=True)
        # On copie le fichier pour éviter de détruire l'original dans le dossier de travail
        shutil.copy(file_path, dest_path)
        print(f"✅ Fichier renommé et copié avec succès !")
        
    return True

def main():
    parser = argparse.ArgumentParser(description="Renomme intelligemment vos factures d'achat avant importation.")
    parser.add_argument("--file", type=str, help="Chemin vers un fichier PDF unique à traiter.")
    parser.add_argument("--dir", type=str, help="Chemin vers un dossier de fichiers PDF à traiter.")
    parser.add_argument("--out", type=str, help="Dossier de destination pour les fichiers renommés.")
    parser.add_argument("--dry-run", action="store_true", help="Simuler les actions sans copier ni modifier de fichiers.")
    args = parser.parse_args()

    input_dir = args.dir or DEFAULT_INPUT_DIR
    output_dir = args.out or DEFAULT_OUTPUT_DIR

    # 1. Traitement d'un fichier unique
    if args.file:
        if not os.path.exists(args.file):
            print(f"❌ Le fichier indiqué n'existe pas : {args.file}")
            sys.exit(1)
        process_file(args.file, output_dir, args.dry_run)
        
    # 2. Traitement d'un dossier
    else:
        if not os.path.exists(input_dir):
            if not args.dry_run:
                os.makedirs(input_dir, exist_ok=True)
                print(f"📁 Dossier d'entrée créé sur le Bureau : {input_dir}")
                print(f"👉 Déposez-y vos factures à renommer puis relancez le script.")
            else:
                print(f"⚠️ Le dossier d'entrée n'existe pas : {input_dir}")
            sys.exit(0)
            
        files = [os.path.join(input_dir, f) for f in os.listdir(input_dir) if f.lower().endswith('.pdf')]
        
        if not files:
            print(f"ℹ️ Aucun fichier PDF trouvé dans le dossier : {input_dir}")
            sys.exit(0)
            
        print(f"🚀 Traitement de {len(files)} factures dans le dossier : {input_dir}...")
        success_count = 0
        
        for idx, f_path in enumerate(files, start=1):
            print(f"\n──────────────────────────────────────────────────")
            print(f"[{idx}/{len(files)}] Fichier : {os.path.basename(f_path)}")
            if process_file(f_path, output_dir, args.dry_run):
                success_count += 1
                
        print(f"\n==================================================")
        print(f"🎉 Tâche de renommage terminée !")
        print(f"   Fichiers traités : {success_count}/{len(files)}")
        print(f"   Dossier de sortie : {output_dir}")
        print(f"==================================================")

if __name__ == "__main__":
    main()
