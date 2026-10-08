with open("scripts/raw_cpam_statements_2026.txt", "r", encoding="utf-8") as f:
    text = f.read()

print("Occurrences of AVRIL 2026:", text.count("AVRIL 2026"))
print("Occurrences of MAI 2026:", text.count("MAI 2026"))
print("Occurrences of JUIN 2026:", text.count("JUIN 2026"))
print("Occurrences of JUILLET 2026:", text.count("JUILLET 2026"))
print("Occurrences of AOUT 2026:", text.count("AOUT 2026"))
