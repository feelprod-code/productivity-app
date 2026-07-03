#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script interactif Playwright pour se connecter à Pennylane,
générer la clé API et l'enregistrer dans le fichier .env de façon automatique.
Fonctionne sur le Mac de l'utilisateur de façon visible (headful).
"""

import os
import sys
import time
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

# Charger le fichier .env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

EMAIL = "guillaumephilippe@me.com"
PASSWORD = "Philippe1968@"
ENV_FILE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))

def save_token_to_env(token: str):
    """Met à jour le fichier .env avec la clé API récupérée."""
    if not os.path.exists(ENV_FILE_PATH):
        with open(ENV_FILE_PATH, 'w') as f:
            f.write(f'PENNYLANE_API_KEY="{token}"\n')
        return

    with open(ENV_FILE_PATH, 'r') as f:
        lines = f.readlines()

    updated = False
    new_lines = []
    for line in lines:
        if line.strip().startswith("PENNYLANE_API_KEY="):
            new_lines.append(f'PENNYLANE_API_KEY="{token}"\n')
            updated = True
        else:
            new_lines.append(line)

    if not updated:
        new_lines.append(f'\nPENNYLANE_API_KEY="{token}"\n')

    with open(ENV_FILE_PATH, 'w') as f:
        f.writelines(new_lines)
    
    print(f"🎉 Clé API enregistrée avec succès dans ton fichier .env !")

def main():
    print("🚀 Lancement du navigateur Playwright en mode visible sur ton Mac...")
    print("👉 Ne ferme pas la fenêtre qui va s'ouvrir. Tu pourras suivre ou aider si besoin.")
    
    with sync_playwright() as p:
        # Lancer le navigateur visible (headless=False)
        browser = p.chromium.launch(headless=False, args=["--start-maximized"])
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        
        print("🔗 Navigation vers Pennylane...")
        page.goto("https://app.pennylane.com/sign_in", timeout=60000)
        
        # Attendre que la page soit bien chargée
        time.sleep(2)
        
        try:
            print("✏️ Saisie des identifiants de connexion...")
            # Remplir l'email
            email_field = page.locator('input[type="email"]')
            email_field.first.wait_for(timeout=10000)
            email_field.first.fill(EMAIL)
            
            # Remplir le mot de passe
            password_field = page.locator('input[type="password"]')
            password_field.first.fill(PASSWORD)
            
            # Cliquer sur connexion
            submit_btn = page.locator('button[type="submit"]')
            if submit_btn.count() > 0:
                submit_btn.first.click()
            else:
                # Appuyer sur Entrée
                page.keyboard.press("Enter")
                
            print("⏳ Connexion en cours...")
            
        except Exception as e:
            print(f"⚠️ Note : Impossible de remplir le formulaire automatiquement ({e}).")
            print("👉 Merci de te connecter manuellement dans la fenêtre du navigateur ouverte.")

        # Laisser le temps à la connexion de se faire (et de gérer un éventuel 2FA ou Captcha par l'utilisateur)
        print("\n🔒 SI PENNYLANE DEMANDE UNE SÉCURITÉ (CODE SMS, NOTIFICATION SUR TON TÉLÉPHONE, CAPTCHA) :", flush=True)
        print("👉 Valide la notification ou tape le code SMS directement dans la fenêtre du navigateur ouverte sur ton écran.", flush=True)
        print("⏳ En attente de ta validation et de la connexion réussie (Délai max : 4 minutes)...", flush=True)
        
        # Attendre que l'utilisateur soit connecté et ne soit plus sur la page de connexion
        connected = False
        for i in range(240): # Attendre jusqu'à 4 minutes
            if i % 15 == 0 and i > 0:
                print(f"⏳ Toujours en attente (temps écoulé : {i}s)...", flush=True)
            current_url = page.url
            if "sign_in" not in current_url and "login" not in current_url and "app.pennylane.com" in current_url:
                connected = True
                break
            time.sleep(1)
            
        if not connected:
            print("❌ Temps d'attente de connexion dépassé (2 minutes). Arrêt.")
            browser.close()
            return
            
        print("✅ Connexion réussie !")
        
        # Navigation directe vers l'onglet Développeurs
        print("🔗 Navigation vers la page des tokens API...")
        page.goto("https://app.pennylane.com/settings/developers", timeout=30000)
        time.sleep(3)
        
        print("⚙️ Recherche du bouton de création de jeton...")
        try:
            # Chercher le bouton "Générer un jeton"
            # On cherche par texte pour être résistant aux changements de design
            generate_btn = page.locator("text=Générer un jeton").first
            if not generate_btn.is_visible():
                generate_btn = page.locator("text=Créer un jeton").first
            if not generate_btn.is_visible():
                generate_btn = page.locator("button:has-text('jeton')").first
                
            generate_btn.click()
            time.sleep(1.5)
            
            print("✍️ Saisie du nom du jeton...")
            # Saisir le nom dans le champ du modal
            # Le champ est souvent un input texte
            name_input = page.locator('input[type="text"]').first
            name_input.fill("Anti-Gravity Nettoyeur")
            
            # Valider
            confirm_btn = page.locator("text=Générer").first
            if not confirm_btn.is_visible():
                confirm_btn = page.locator("button:has-text('Créer')").first
            confirm_btn.click()
            time.sleep(2)
            
            print("🔑 Récupération du jeton généré...")
            # Trouver la clé API affichée (souvent dans un champ readonly ou précédé d'un bouton copier)
            # On va chercher toutes les valeurs ou textes dans les inputs ou divs
            token = None
            
            # Méthode 1 : Chercher dans un input en lecture seule ou input text
            inputs = page.locator('input')
            for i in range(inputs.count()):
                val = inputs.nth(i).input_value()
                # Les tokens de Pennylane ressemblent souvent à des chaînes de caractères longues
                if len(val) > 20 and not val.startswith("Anti-Gravity") and "@" not in val:
                    token = val
                    break
                    
            # Méthode 2 : Si pas trouvé dans un input, chercher un code dans les divs
            if not token:
                divs = page.locator('div')
                for i in range(divs.count()):
                    text = divs.nth(i).inner_text()
                    # Si c'est un token
                    if len(text) > 20 and len(text) < 100 and " " not in text and "\n" not in text:
                        # Test simple si c'est alphanumérique ou avec caractères spéciaux de token
                        if re.match(r'^[A-Za-z0-9_\-\.]+$', text):
                            token = text
                            break
                            
            if token:
                print(f"🎉 Clé API trouvée !")
                save_token_to_env(token)
            else:
                print("⚠️ Impossible de copier la clé API automatiquement.")
                print("👉 Génère-la manuellement dans la fenêtre de ton navigateur ouverte, puis copie-la et colle-la dans ton fichier .env.")
                
        except Exception as e:
            print(f"⚠️ Erreur lors de la génération automatique : {e}")
            print("👉 S'il te plaît, termine la génération à la main sur la fenêtre visible à l'écran, copie la clé et colle-la dans ton .env.")
            
        print("\nℹ️ Tu peux maintenant fermer la fenêtre du navigateur ou le script le fera dans 30 secondes...")
        time.sleep(30)
        browser.close()

if __name__ == "__main__":
    import re
    main()
