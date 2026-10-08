export type ActivityUniverse = 'feelprod' | 'kine' | 'consolidated';

export type FeelProdItemType = 
  | 'tjm_tournage'
  | 'tjm_realisation'
  | 'tjm_drone'
  | 'forfait_montage'
  | 'forfait_etalonnage'
  | 'forfait_son'
  | 'materiel'
  | 'deplacement_km'
  | 'autre';

export interface FeelProdItem {
  id: string;
  type: FeelProdItemType;
  description: string;
  quantity: number;
  unit: 'jour' | 'demi-jour' | 'forfait' | 'km' | 'unite';
  unitPriceHT: number;
  totalHT: number;
}

export type InvoiceStatus = 'brouillon' | 'devis_envoye' | 'devis_accepte' | 'facture' | 'paye' | 'partiel' | 'en_retard';

export interface FeelProdInvoice {
  id: string;
  number: string; // FP-2026-001
  date: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  clientName: string;
  clientCompany?: string;
  clientEmail?: string;
  projectTitle: string;
  items: FeelProdItem[];
  totalHT: number;
  vatRate: number; // 20 (%)
  vatAmount: number;
  totalTTC: number;
  depositAmount: number; // Acompte
  remainingDue: number; // Reste à payer
  status: InvoiceStatus;
  accountingAccount: string; // '706000'
  vatAccount: string; // '445710'
  notes?: string;
}

export type KineActType = 'conventionne' | 'hors_nomenclature';

export type KinePaymentMethod = 'especes' | 'cheque' | 'cb' | 'virement' | 'attente';

export type KinePaymentStatus = 'regle' | 'en_attente' | 'differe';

export interface KineSession {
  id: string;
  number: string; // KIN-2026-001
  date: string; // YYYY-MM-DD
  patientName: string;
  patientPhone?: string;
  actType: KineActType;
  actLabel: string; // ex: "Thérapie Manuelle Tissulaire (HN)" ou "Rééducation du rachis (AMK 9.5)"
  sessionCount: number;
  unitPrice: number; // ex: 70.00
  totalAmount: number;
  vatRate: 0; // Exonéré
  vatExemptMention: string; // "Exonération de TVA, art. 261-4-1° du CGI"
  paymentMethod: KinePaymentMethod;
  paymentStatus: KinePaymentStatus;
  deferredDepositDate?: string; // Date d'encaissement prévue pour chèque différé
  accountingAccount: string; // '705000'
  notes?: string;
}

export interface FacturationFilter {
  universe: ActivityUniverse;
  period: 'month' | 'quarter' | 'year' | 'all';
  selectedYear: number;
  selectedMonth: number; // 0 to 11, or -1 for all
  searchQuery: string;
  statusFilter: string;
}
