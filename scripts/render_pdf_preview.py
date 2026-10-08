import fitz

doc = fitz.open("generated_pdfs/2026-04-30_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_AVRIL_-_4563.32EUR.pdf")
page = doc.load_page(0)
pix = page.get_pixmap(dpi=150)
pix.save("generated_pdfs/preview_avril.png")
print(f"Preview saved with {doc.page_count} pages.")
