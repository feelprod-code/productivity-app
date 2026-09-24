import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm

MONTH_NAMES = {
    "2026-04": ("Avril 2026", "2026-04-30_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_AVRIL_-_4563.32EUR.pdf", "cpam-releve-avril-2026", 4563.32),
    "2026-05": ("Mai 2026", "2026-05-31_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_MAI_-_6056.03EUR.pdf", "cpam-releve-mai-2026", 6056.03),
    "2026-06": ("Juin 2026", "2026-06-30_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_JUIN_-_5468.60EUR.pdf", "cpam-releve-juin-2026", 5468.60),
    "2026-07": ("Juillet 2026", "2026-07-31_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_JUILLET_-_4643.40EUR.pdf", "cpam-releve-juillet-2026", 4643.40),
    "2026-08": ("Août 2026", "2026-08-31_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_AOUT_-_4319.23EUR.pdf", "cpam-releve-aout-2026", 4319.23),
}

def parse_raw_text():
    with open("scripts/raw_cpam_statements_2026.txt", "r", encoding="utf-8") as f:
        lines = f.readlines()

    months_data = {
        "2026-04": [],
        "2026-05": [],
        "2026-06": [],
        "2026-07": [],
        "2026-08": []
    }

    current_month = "2026-07"
    current_regime = "REGIME GENERAL"

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if "JUILLET 2026" in line: current_month = "2026-07"
        elif "JUIN 2026" in line: current_month = "2026-06"
        elif "MAI 2026" in line: current_month = "2026-05"
        elif "AVRIL 2026" in line: current_month = "2026-04"
        elif "AOUT 2026" in line: current_month = "2026-08"

        if "M.G.E.N." in line:
            current_regime = "M.G.E.N."
        elif "REGIME GENERAL" in line:
            current_regime = "REGIME GENERAL"

        parts = line.split(';')
        if len(parts) >= 8 and parts[0].strip()[:2].isdigit() and len(parts[0].strip()) == 10 and not parts[0].strip().startswith("Total"):
            date_pay = parts[0].strip()
            num_lot = parts[1].strip()
            num_fact = parts[2].strip()
            caisse = parts[3].strip()
            patient = parts[4].strip()
            num_secu = parts[5].strip()
            nature = parts[6].strip()
            dates_actes = parts[7].strip().replace('\xa0', ' ')
            raw_montant = parts[-1].strip().replace(',', '.')
            try:
                montant = float(raw_montant)
            except:
                continue

            months_data[current_month].append({
                "date_pay": date_pay,
                "regime": current_regime,
                "num_lot": num_lot,
                "num_fact": num_fact,
                "caisse": caisse,
                "patient": patient,
                "num_secu": num_secu,
                "nature": nature,
                "dates_actes": dates_actes,
                "montant": montant
            })

    return months_data

def generate_pdf(month_key, items, output_path):
    month_name, filename, doc_id, expected_total = MONTH_NAMES[month_key]

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=12*mm,
        rightMargin=12*mm,
        topMargin=12*mm,
        bottomMargin=12*mm
    )

    styles = getSampleStyleSheet()

    # Custom palette (charte Ligne Claire / Didactique)
    c_cream = colors.HexColor("#FAF7F2")
    c_slate = colors.HexColor("#0F172A")
    c_muted = colors.HexColor("#475569")
    c_blue = colors.HexColor("#1E3A8A")
    c_light_blue = colors.HexColor("#EFF6FF")
    c_border = colors.HexColor("#CBD5E1")

    style_title = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=c_blue,
        spaceAfter=4
    )
    style_subtitle = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=c_muted,
        spaceAfter=10
    )
    style_header_table = ParagraphStyle(
        'HeaderTable',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#1E293B")
    )
    style_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=c_slate
    )
    style_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=c_slate
    )
    style_cell_right = ParagraphStyle(
        'TableCellRight',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        alignment=2,
        textColor=colors.HexColor("#047857")
    )

    story = []

    # Cartouche En-tête Praticien
    header_data = [
        [
            Paragraph("<b>GUILLAUME PHILIPPE</b><br/>Masseur-Kinésithérapeute D.E.<br/>N° RPPS : 10005682603 • N° ADELI : 757068309<br/>28 bis Boulevard de Sébastopol, 75004 Paris", style_subtitle),
            Paragraph(f"<b>AMELI PRO / ASSURANCE MALADIE</b><br/><b>Relevé officiel des paiements tiers-payant</b><br/>Période : <b>{month_name.upper()}</b><br/>Date d'édition : Conforme espace professionnel", style_subtitle)
        ]
    ]
    t_header = Table(header_data, colWidths=[95*mm, 91*mm])
    t_header.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_light_blue),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#BFDBFE")),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_header)
    story.append(Spacer(1, 10))

    # Titre de section
    total_releve = sum(it['montant'] for it in items)
    story.append(Paragraph(f"<b>Détail des virements reçus & des consultations prises en charge ({month_name})</b>", style_title))
    story.append(Paragraph(f"Total relevé des actes : <b>{total_releve:.2f} €</b> réparties sur <b>{len(items)} actes</b> et <b>{len(set(it['patient'] for it in items))} patients</b> distincts.", style_subtitle))

    # Tableau des actes
    table_data = [
        [
            Paragraph("Date", style_header_table),
            Paragraph("Organisme", style_header_table),
            Paragraph("Patient / Assuré", style_header_table),
            Paragraph("Actes & Période", style_header_table),
            Paragraph("Facture", style_header_table),
            Paragraph("Montant", ParagraphStyle('HRight', parent=style_header_table, alignment=2))
        ]
    ]

    for it in items:
        table_data.append([
            Paragraph(it['date_pay'], style_cell),
            Paragraph(f"<b>{it['regime']}</b><br/>{it['caisse']}", style_cell),
            Paragraph(f"<b>{it['patient']}</b><br/>{it['num_secu']}", style_cell),
            Paragraph(f"{it['nature']}<br/>{it['dates_actes']}", style_cell),
            Paragraph(it['num_fact'], style_cell),
            Paragraph(f"{it['montant']:.2f} €", style_cell_right)
        ])

    # Ligne total
    table_data.append([
        Paragraph("<b>TOTAL RELEVÉ</b>", style_cell_bold),
        Paragraph("", style_cell),
        Paragraph(f"<b>{len(set(it['patient'] for it in items))} patients</b>", style_cell_bold),
        Paragraph(f"<b>{len(items)} actes</b>", style_cell_bold),
        Paragraph("", style_cell),
        Paragraph(f"<b>{total_releve:.2f} €</b>", ParagraphStyle('TotRight', parent=style_cell_right, fontSize=8.5, textColor=colors.HexColor("#065F46")))
    ])

    col_widths = [18*mm, 32*mm, 52*mm, 42*mm, 20*mm, 22*mm]
    t_actes = Table(table_data, colWidths=col_widths, repeatRows=1)
    t_actes.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#F1F5F9")),
        ('BOTTOMPADDING', (0,0), (-1,0), 5),
        ('TOPPADDING', (0,0), (-1,0), 5),
        ('ALIGN', (0,0), (-1,0), 'LEFT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, colors.HexColor("#FAFAFA")]),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#ECFDF5")),
        ('TOPPADDING', (0,1), (-1,-1), 3),
        ('BOTTOMPADDING', (0,1), (-1,-1), 3),
    ]))

    story.append(t_actes)

    doc.build(story)
    print(f"Generated PDF for {month_name}: {output_path} ({total_releve:.2f} €)")

def main():
    os.makedirs("generated_pdfs", exist_ok=True)
    data = parse_raw_text()
    for m in ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]:
        items = data.get(m, [])
        if items:
            out_file = os.path.join("generated_pdfs", MONTH_NAMES[m][1])
            generate_pdf(m, items, out_file)

if __name__ == "__main__":
    main()
