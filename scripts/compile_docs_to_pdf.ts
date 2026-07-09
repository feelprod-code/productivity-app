import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const MD_PATH = path.join(process.cwd(), 'Documentation_Complet_Moteur.md');
const PDF_PATH = '/Users/guillaumephilippe/Desktop/Documentation_Complet_Moteur_Compta.pdf';
const TITLE = 'Documentation Générale, Technique et Règles du Moteur de Comptabilité FeelProd';

function convertMarkdownToHtml(title: string, markdown: string): string {
  let md = markdown;

  // Escape HTML tags first
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks: ```typescript ... ```
  html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${code}</code></pre>`;
  });

  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Bullet points
  html = html.replace(/^\* (.*)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.*)$/gm, '<li>$1</li>');

  // Group list items
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  // Fix double grouping if any
  html = html.replace(/<\/ul>\n<ul>/g, '\n');

  // Paragraphs (lines that don't start with tags or lists)
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<pre') || trimmed.startsWith('</pre') || trimmed.startsWith('<code') || trimmed.startsWith('</code') || trimmed.startsWith('<ul') || trimmed.startsWith('</ul') || trimmed.startsWith('<li') || trimmed.startsWith('</li') || trimmed.startsWith('<hr') || trimmed.startsWith('👉')) {
      return line;
    }
    return `<p>${line}</p>`;
  });
  html = processedLines.join('\n');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700&display=swap');
    
    body {
      font-family: 'Inter', sans-serif;
      color: #1e293b;
      line-height: 1.6;
      padding: 40px;
      background: #fff;
      margin: 0;
    }
    
    .accent-bar {
      height: 4px;
      background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 2px;
      margin-bottom: 24px;
    }
    
    h1, h2, h3, h4 {
      font-family: 'Outfit', sans-serif;
      color: #0f172a;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    
    h1 {
      font-size: 26px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 10px;
      color: #0f172a;
      text-align: center;
      margin-bottom: 20px;
      margin-top: 10px;
    }
    
    h2 {
      font-size: 18px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 6px;
      color: #1e293b;
      margin-top: 30px;
    }
    
    h3 {
      font-size: 14px;
      color: #475569;
      margin-top: 20px;
    }
    
    p {
      margin-top: 0;
      margin-bottom: 12px;
      font-size: 14px;
      color: #334155;
    }
    
    code {
      font-family: 'Courier New', Courier, monospace;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
      color: #0f172a;
      font-weight: 600;
    }
    
    pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
      border: 1px solid #334155;
      margin-top: 10px;
      margin-bottom: 16px;
    }
    
    pre code {
      background: transparent;
      padding: 0;
      color: inherit;
      font-weight: normal;
    }
    
    ul, ol {
      margin-bottom: 16px;
      padding-left: 20px;
    }
    
    li {
      margin-bottom: 6px;
      font-size: 14px;
      color: #334155;
    }
    
    hr {
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 24px 0;
    }

    .callout {
      background-color: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin: 16px 0;
      color: #1e40af;
      font-size: 14px;
    }
    
    @media print {
      body {
        padding: 0;
      }
      pre {
        page-break-inside: avoid;
      }
      h2, h3 {
        page-break-after: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="accent-bar"></div>
  ${html}
</body>
</html>
  `;
}

async function main() {
  console.log("🚀 Starting consolidated PDF generation using Playwright...");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  if (!fs.existsSync(MD_PATH)) {
    console.error(`❌ Source file not found: ${MD_PATH}`);
    await browser.close();
    return;
  }

  console.log(`📖 Reading ${MD_PATH}...`);
  const mdContent = fs.readFileSync(MD_PATH, 'utf-8');
  const htmlContent = convertMarkdownToHtml(TITLE, mdContent);

  console.log(`🎨 Rendering HTML & Printing PDF to ${PDF_PATH}...`);
  await page.setContent(htmlContent);
  await page.pdf({
    path: PDF_PATH,
    format: 'A4',
    margin: {
      top: '20mm',
      bottom: '20mm',
      left: '20mm',
      right: '20mm'
    },
    printBackground: true
  });
  console.log(`✅ Consolidated PDF successfully generated: ${PDF_PATH}`);

  // Cleanup old individual PDFs from Desktop
  const oldFiles = [
    '/Users/guillaumephilippe/Desktop/Technique_Renommage_Factures.pdf',
    '/Users/guillaumephilippe/Desktop/Documentation_Complete_Moteur_Compta.pdf',
    '/Users/guillaumephilippe/Desktop/Rapport_Regles_Moteur.pdf'
  ];

  for (const file of oldFiles) {
    if (fs.existsSync(file)) {
      console.log(`🧹 Deleting old PDF: ${file}`);
      fs.unlinkSync(file);
    }
  }

  await browser.close();
  console.log("🏁 Compilation finished!");
}

main().catch(console.error);
