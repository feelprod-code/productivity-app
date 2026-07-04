import os
import json
import re
import sys
import base64
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from pypdf import PdfReader

# Chemins de configuration Google OAuth
TOKEN_PATH = os.path.expanduser("~/.config/google/gmail_token_feelprod.json")
SECRET_PATH = "/Users/philippeguillaume/ANTIGRAVITY/youtube-automation/client_secrets.json"

def get_gmail_service():
    if not os.path.exists(TOKEN_PATH):
        print("❌ Token d'authentification Gmail manquant. Lance d'abord la connexion.")
        sys.exit(1)
    with open(TOKEN_PATH, 'r') as f:
        token_data = json.load(f)
    with open(SECRET_PATH, 'r') as f:
        secret_data = json.load(f)["installed"]
    creds = Credentials(
        token=token_data.get("access_token"),
        refresh_token=token_data.get("refresh_token"),
        token_uri=secret_data["token_uri"],
        client_id=secret_data["client_id"],
        client_secret=secret_data["client_secret"],
        scopes=token_data.get("scopes", ["https://www.googleapis.com/auth/gmail.readonly"])
    )
    return build("gmail", "v1", credentials=creds)

def get_email_attachments(service, msg_id):
    msg = service.users().messages().get(userId="me", id=msg_id).execute()
    payload = msg.get("payload", {})
    parts = payload.get("parts", [])
    
    attachments = []
    for part in parts:
        filename = part.get("filename", "")
        body = part.get("body", {})
        attachment_id = body.get("attachmentId", "")
        
        if filename and filename.endswith("daily-payout-payments-report.pdf"):
            print(f"   📥 Téléchargement de la pièce jointe : {filename}")
            attachment = service.users().messages().attachments().get(
                userId="me", messageId=msg_id, id=attachment_id
            ).execute()
            file_data = base64.urlsafe_b64decode(attachment['data'].encode('UTF-8'))
            attachments.append((filename, file_data))
    return attachments

def parse_sumup_pdf(file_bytes):
    # Enregistrer temporairement le PDF
    temp_path = "/tmp/temp_sumup_report.pdf"
    with open(temp_path, "wb") as f:
        f.write(file_bytes)
        
    reader = PdfReader(temp_path)
    full_text = ""
    for page in reader.pages:
        full_text += page.extract_text() + "\n"
        
    # Nettoyage des caractères invisibles ou mal formés
    full_text = full_text.replace('\xa0', ' ')
    
    # Recherche des patients
    # Pattern recherché : 1 x <nom_patient> €<brut>
    # Exemple : 1 x Grios €63.65 €0.82
    patients = []
    lines = full_text.split('\n')
    for line in lines:
        if '1 x' in line and '€' in line:
            # Recherche de la partie "1 x [Nom] €[Montant]"
            match = re.search(r'1\s*x\s*([^€]+)€\s*([0-9.,]+)', line)
            if match:
                name = match.group(1).strip()
                amount_str = match.group(2).replace(',', '.')
                try:
                    amount = float(amount_str)
                    # Éviter les doublons de lignes identiques
                    if not any(p['name'] == name and p['amount'] == amount for p in patients):
                        patients.append({"name": name, "amount": amount})
                except ValueError:
                    pass
                    
    # Extraction du montant total net du versement
    # Exemple : "Versement effectué ... €214.35" ou "Montant du versement €214.35"
    net_amount = 0.0
    net_match = re.search(r'(?:Versement effectué|Montant du versement|La somme transférée)[^\d€]*€\s*([0-9.,]+)', full_text, re.IGNORECASE)
    if net_match:
        try:
            net_amount = float(net_match.group(1).replace(',', '.'))
        except ValueError:
            pass
            
    # Fallback pour le montant total net (somme des totaux de la ligne)
    if net_amount == 0.0:
        totaux_match = re.search(r'Totaux:\s*€[0-9.,]+\s*[^€]*€[0-9.,]+\s*[^€]*€[0-9.,]+\s*=\s*€\s*([0-9.,]+)', full_text)
        if totaux_match:
            try:
                net_amount = float(totaux_match.group(1).replace(',', '.'))
            except ValueError:
                pass
                
    if os.path.exists(temp_path):
        os.remove(temp_path)
        
    return {
        "patients": patients,
        "net_amount": net_amount
    }

def main():
    # 1. Lire les transactions de l'entrée standard (JSON passé par le script TS)
    try:
        input_data = json.load(sys.stdin)
    except Exception as e:
        print("❌ Erreur de lecture de l'entrée standard JSON :", e)
        sys.exit(1)
        
    txs = input_data.get("transactions", [])
    if not txs:
        print("ℹ️ Aucune transaction SumUp à traiter.")
        return
        
    service = get_gmail_service()
    
    results = []
    
    # 2. Parcourir et traiter chaque transaction bancaire SumUp
    for tx in txs:
        tx_id = String(tx.get("id")) if tx.get("id") else ""
        tx_date_str = tx.get("date") # format "YYYY-MM-DD"
        tx_amount = abs(float(tx.get("amount", 0)))
        
        print(f"\n⚡ Traitement de la transaction SumUp {tx_id} | Date: {tx_date_str} | Montant: {tx_amount} €")
        
        # Déterminer la plage de dates de recherche Gmail (+/- 2 jours)
        tx_date = datetime.strptime(tx_date_str, "%Y-%m-%d")
        after_date = (tx_date - timedelta(days=2)).strftime("%Y/%m/%d")
        before_date = (tx_date + timedelta(days=3)).strftime("%Y/%m/%d")
        
        q = f"sumup after:{after_date} before:{before_date}"
        print(f"   🔍 Recherche Gmail avec la requête : '{q}'")
        
        gmail_res = service.users().messages().list(userId="me", q=q, maxResults=15).execute()
        messages = gmail_res.get("messages", [])
        
        matched_patients = None
        
        for m in messages:
            attachments = get_email_attachments(service, m["id"])
            for filename, data in attachments:
                parsed = parse_sumup_pdf(data)
                pdf_net = parsed["net_amount"]
                
                print(f"   🔍 PDF lu : Montant net trouvé = {pdf_net} € (Attendu: {tx_amount} €)")
                
                if abs(pdf_net - tx_amount) < 0.05: # Tolérance aux arrondis de centimes
                    print(f"   ✅ MATCH TROUVÉ ! {len(parsed['patients'])} patient(s) identifié(s).")
                    matched_patients = parsed["patients"]
                    break
            if matched_patients is not None:
                break
                
        if matched_patients:
            results.append({
                "id": tx_id,
                "patients": matched_patients,
                "amount": tx_amount
            })
        else:
            print("   ⏭️ Aucun email SumUp correspondant à ce montant n'a été trouvé.")
            
    # Écrire le résultat final sur la sortie standard sous forme de JSON
    print("\n--- JSON_RESULT_START ---")
    print(json.dumps(results))
    print("--- JSON_RESULT_END ---")

# Petit helper pour forcer la conversion en string
def String(val):
    return str(val)

if __name__ == "__main__":
    main()
