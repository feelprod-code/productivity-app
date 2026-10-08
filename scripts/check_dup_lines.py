with open("scripts/raw_cpam_statements_2026.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

avril_lines = []
curr = ""
for line in lines:
    if "JUILLET 2026" in line: curr = "07"
    elif "JUIN 2026" in line: curr = "06"
    elif "MAI 2026" in line: curr = "05"
    elif "AVRIL 2026" in line: curr = "04"
    elif "AOUT 2026" in line: curr = "08"
    if curr == "04" and ";" in line:
        avril_lines.append(line.strip())

print(f"Total lines in Avril: {len(avril_lines)}")
from collections import Counter
c = Counter(avril_lines)
duplicates = [k for k, v in c.items() if v > 1]
print(f"Number of duplicate lines in Avril: {len(duplicates)}")
if duplicates:
    print("Example duplicate:", duplicates[0], "count:", c[duplicates[0]])
