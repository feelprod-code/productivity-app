const { chromium } = require('playwright');

const USER_DATA_DIR = '/Users/philippeguillaume/ANTIGRAVITY/compta/scripts/pennylane_temp_profile';

async function main() {
  console.log("🚀 Lancement de la fenêtre sécurisée pour Pennylane...");
  
  // Utiliser le profil Chrome de l'utilisateur pour hériter des cookies/sessions
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false, // Doit être visible pour que l'utilisateur puisse s'authentifier si besoin
    channel: 'chrome', // Utiliser Google Chrome installé sur le système
    viewport: null, // Pleine taille
    args: ['--start-maximized']
  });
  
  const page = await context.newPage();
  
  console.log("🌐 Navigation vers Pennylane...");
  await page.goto('https://app.pennylane.com/');
  
  // Attendre que l'utilisateur soit connecté
  console.log("⏳ En attente de connexion... Si besoin, connectez-vous dans la fenêtre du navigateur.");
  
  let currentUrl = page.url();
  while (!currentUrl.includes('/companies/') && !currentUrl.includes('/dashboard')) {
    await page.waitForTimeout(1000);
    currentUrl = page.url();
  }
  
  // Extraire l'ID de l'entreprise depuis l'URL
  const match = currentUrl.match(/\/companies\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    console.error("❌ Impossible de trouver l'ID de l'entreprise dans l'URL.");
    await context.close();
    return;
  }
  
  const companyId = match[1];
  console.log(`✅ Connecté avec succès ! ID Entreprise : ${companyId}`);
  
  // Naviguer vers les factures d'achat (dépenses)
  const purchasesUrl = `https://app.pennylane.com/companies/${companyId}/purchases/invoices`;
  console.log(`🌐 Navigation vers l'onglet Achats : ${purchasesUrl}`);
  await page.goto(purchasesUrl);
  await page.waitForTimeout(3000);
  
  console.log("🧹 Début de la suppression automatique des factures d'achats...");
  
  let loop = true;
  let deletedCount = 0;
  
  while (loop) {
    // 1. Attendre que la table ou le contenu charge
    await page.waitForTimeout(2000);
    
    // 2. Chercher la case à cocher pour tout sélectionner
    // Sur Pennylane, la case "Tout sélectionner" est souvent une case à cocher globale
    const selectAllCheckbox = await page.locator('th input[type="checkbox"], input[aria-label="Sélectionner toutes les factures"], [data-testid="select-all-checkbox"]').first();
    
    if (await selectAllCheckbox.count() === 0) {
      console.log("ℹ️ Aucune facture d'achat trouvée (ou fin de la liste).");
      break;
    }
    
    // Cocher la case globale
    await selectAllCheckbox.click();
    await page.waitForTimeout(1000);
    
    // 3. Chercher le bouton de suppression ou corbeille
    // Pennylane affiche généralement une barre d'actions groupées avec un bouton "Supprimer" ou "Archiver"
    const deleteBtn = await page.locator('button:has-text("Supprimer"), button:has-text("supprimer"), [aria-label="Supprimer"], [data-testid="delete-button"]').first();
    
    if (await deleteBtn.count() === 0 || !(await deleteBtn.isEnabled())) {
      console.log("ℹ️ Aucun bouton de suppression disponible. Les factures ont peut-être déjà été supprimées.");
      break;
    }
    
    // Cliquer sur le bouton supprimer
    await deleteBtn.click();
    await page.waitForTimeout(1500);
    
    // 4. Valider le popup de confirmation si existant
    const confirmBtn = await page.locator('button:has-text("Confirmer"), button:has-text("Supprimer définitivement"), button.btn-danger, button:has-text("Oui")').first();
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
      console.log("   🗑️ Lot de factures supprimé.");
      deletedCount += 50; // Approximativement par page
      await page.waitForTimeout(3000);
    } else {
      console.log("⚠️ Popup de confirmation introuvable ou déjà validé.");
      break;
    }
    
    // Rafraîchir pour vérifier s'il reste des factures
    await page.reload();
  }
  
  console.log(`🎉 Suppression terminée ! Total de lots supprimés.`);
  console.log("🚪 Fermeture du navigateur...");
  await context.close();
}

main().catch(err => {
  console.error("❌ Une erreur est survenue lors de l'exécution de Playwright :", err);
});
