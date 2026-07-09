import * as fs from 'fs';
import * as path from 'path';

const COMPTA_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";
const TRIEE_DIR = "/Users/guillaumephilippe/Desktop/pennylane triee";

const missingFiles = [
  "Factures 2025/04 - Avril/2025-04-01 - ILEDEFRANCE_MOBILITES_ABONNEMENT_NAVIGO_MOIS - 88.80€.pdf",
  "Factures 2025/04 - Avril/2025-04-01 - JIASHAN_YUNSHANGYUN_WENHUA_CHUANMEI_CO_LTD_CARTOUCHE_DENCRE - 45.99€.pdf",
  "Factures 2025/05 - Mai/2025-05-28 - AMAZON_DIGITAL_FRANCE_SAS_OPTION_PRIME_VIDEO - 1.99€.pdf",
  "Factures 2025/06 - Juin/2025-06-12 - AMAZON_DIGITAL_FRANCE_SAS_ANIME_DIGITAL_NETWORK_ADN - 6.99€.pdf",
  "Factures 2025/06 - Juin/2025-06-28 - AMAZON_DIGITAL_FRANCE_SAS_AD_FREE_FOR_PRIME_VIDEO - 1.99€.pdf",
  "Factures 2025/07 - Juillet/2025-07-12 - AMAZON_DIGITAL_FRANCE_SAS_ANIME_DIGITAL_NETWORK_ADN - 6.99€.pdf",
  "Factures 2025/07 - Juillet/2025-07-20 - AMAZON_BALLON_DE_VOLLEYBALL_WILSON - 21.37€.pdf",
  "Factures 2025/07 - Juillet/2025-07-26 - SHENZHENYINSHECHUANGXINKEJIYOUXIAN_GONGSI_STABILISATEUR_POUR_SMARTPHONE - 299.00€.pdf",
  "Factures 2025/08 - Août/2025-08-28 - AMAZON_DIGITAL_FRANCE_SAS_AD_FREE_PRIME_VIDEO - 1.99€.pdf",
  "Factures 2025/11 - Novembre/2025-11-16 - AMAZON_LAMPE_DE_BUREAU - 25.99€.pdf",
  "Factures 2026/01 - Janvier/2026-01-12 - AMAZON_DIGITAL_FRANCE_SAS_ANIME_DIGITAL_NETWORK_ADN - 6.99€.pdf",
  "Factures 2026/01 - Janvier/2026-01-12 - LBC_FRANCE_ECRAN_VIEWSONIC - 431.69€.pdf",
  "Factures 2026/01 - Janvier/2026-01-13 - LE_PARIS_HALLES_REPAS_RESTAURANT - 19.85€.pdf",
  "Factures 2026/01 - Janvier/2026-01-23 - GANDI_HEBERGEMENT_SIMPLE - 18.00€.pdf",
  "Factures 2026/01 - Janvier/2026-01-28 - AMAZON_DIGITAL_FRANCE_SAS_ABONNEMENT_PRIME_VIDEO - 1.99€.pdf",
  "Factures 2026/01 - Janvier/2026-01-31 - AMELI_RELEVE_COMPTE_TIERSPAYANT - 6728.64€.pdf",
  "Factures 2026/02 - Février/2026-02-02 - FREE_FACTURE_FREEBOX - 23.99€.pdf",
  "Factures 2026/02 - Février/2026-02-04 - DOCTOLIB_SERVICES_DOCTOLIB - 168.00€.pdf",
  "Factures 2026/02 - Février/2026-02-20 - BOUYGUES_TELECOM_ABONNEMENT_BBOX - 48.99€.pdf",
  "Factures 2026/02 - Février/2026-02-23 - GANDI_RENOUVELLEMENT_DOMAINE - 28.78€.pdf",
  "Factures 2026/02 - Février/2026-02-28 - AMAZON_DIGITAL_FRANCE_SAS_ABONNEMENT_PRIME_VIDEO - 1.99€.pdf",
  "Factures 2026/03 - Mars/2026-03-06 - BOUYGUES_TELECOM_SERVICES_TELECOM_BOX - 35.99€.pdf",
  "Factures 2026/03 - Mars/2026-03-12 - AMAZON_DIGITAL_FRANCE_SAS_ANIME_ADN - 6.99€.pdf",
  "Factures 2026/03 - Mars/2026-03-23 - GANDI_HEBERGEMENT_SIMPLE_HOSTING - 18.00€.pdf",
  "Factures 2026/03 - Mars/2026-03-28 - AMAZON_DIGITAL_FRANCE_SAS_AD_FREE_PRIME_VIDEO - 1.99€.pdf",
  "Factures 2026/04 - Avril/2026-04-01 - VOLKSWAGEN_BANK_LOYER_FINANCIER_VEHICULE - 428.98€.pdf",
  "Factures 2026/04 - Avril/2026-04-12 - AMAZON_DIGITAL_FRANCE_SAS_ANIME_DIGITAL_NETWORK_ADN - 6.99€.pdf",
  "Factures 2026/04 - Avril/2026-04-21 - GOOGLE_LLC_SERVICES_GOOGLE_CLOUD - 100.00€.pdf",
  "Factures 2026/04 - Avril/2026-04-23 - GANDI_HOSTING_S_FASCIAS - 18.00€.pdf",
  "Factures 2026/04 - Avril/2026-04-28 - AMAZON_DIGITAL_FRANCE_SAS_AD_FREE_PRIME_VIDEO - 1.99€.pdf",
  "Factures 2026/05 - Mai/2026-05-07 - DOCTOLIB_SERVICES_DOCTOLIB - 168.00€.pdf",
  "Factures 2026/06 - Juin/2026-06-18 - URSSAF_REGULARISATION_COTISATIONS_SOCIALES - 2088.00€.pdf",
  "Factures 2026/07 - Juillet/2026-07-08 - LCL_ASSURANCE_MULTIRISQUE_PROFESSIONNELLE - 223.28€.pdf"
];

const differentContentFiles = [
  "Factures 2025/04 - Avril/2025-04-01 - ILEDEFRANCE_MOBILITES_PASS_NAVIGO_MOIS - 88.80€.pdf",
  "Factures 2025/06 - Juin/2025-06-19 - MACSF_ASSURANCE_AUTOMOBILE - 1526.16€.pdf",
  "Factures 2025/09 - Septembre/2025-09-07 - ILEDEFRANCE_MOBILITES_FORFAIT_NAVIGO_MOIS - 88.80€.pdf",
  "Factures 2026/01 - Janvier/2026-01-23 - GANDI_SIMPLE_HOSTING_S - 18.00€.pdf",
  "Factures 2026/06 - Juin/2026-06-18 - URSSAF_REGULARISATION_ET_ECHEANCIERS_COTISATIONS - 2088.00€.pdf",
  "Factures 2026/06 - Juin/2026-06-28 - AMAZON_DIGITAL_FRANCE_SAS_ABONNEMENT_PRIME_VIDEO - 1.99€.pdf"
];

async function main() {
  console.log("🚀 Syncing 33 missing files from pennylane triee to 4-Compta...");
  for (const relPath of missingFiles) {
    const srcPath = path.join(TRIEE_DIR, relPath);
    const destPath = path.join(COMPTA_DIR, relPath);
    const destDir = path.dirname(destPath);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✅ Copied missing: ${relPath}`);
    } else {
      console.warn(`⚠️ Source file not found: ${srcPath}`);
    }
  }

  console.log("\n🚀 Aligning different content files (overwriting with pennylane triee version)...");
  for (const relPath of differentContentFiles) {
    const srcPath = path.join(TRIEE_DIR, relPath);
    const destPath = path.join(COMPTA_DIR, relPath);

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✅ Overwritten different: ${relPath}`);
    } else {
      console.warn(`⚠️ Source file not found: ${srcPath}`);
    }
  }

  console.log("\n🏁 Synchronization finished successfully!");
}

main().catch(console.error);
