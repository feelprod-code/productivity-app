import * as fs from 'fs';
import pdfParse from 'pdf-parse';

async function readPdf(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  console.log("========================================");
  console.log("Lecture de :", filePath);
  const dataBuffer = fs.readFileSync(filePath);
  try {
    const data = await pdfParse(dataBuffer);
    console.log("Texte extrait :");
    console.log(data.text);
  } catch (err: any) {
    console.error("Erreur lecture PDF:", err.message);
  }
}

async function main() {
  await readPdf('/Users/philippeguillaume/.gemini/antigravity/brain/0fae5af3-cecd-49d7-9d6c-f4da721f8819/scratch/66247_cpo.pdf');
  await readPdf('/Users/philippeguillaume/.gemini/antigravity/brain/0fae5af3-cecd-49d7-9d6c-f4da721f8819/scratch/61365_cpo.pdf');
  await readPdf('/Users/philippeguillaume/.gemini/antigravity/brain/0fae5af3-cecd-49d7-9d6c-f4da721f8819/scratch/Relance_738327195533687.pdf');
}

main().catch(console.error);
