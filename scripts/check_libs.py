try:
    import reportlab
    print("reportlab installed")
except ImportError:
    print("reportlab not installed")

try:
    import fitz
    print("fitz installed")
except ImportError:
    print("fitz not installed")
