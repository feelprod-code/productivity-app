import * as dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

async function run() {
  const pennylaneKey = process.env.PENNYLANE_API_KEY;
  const gmailClientId = process.env.GMAIL_CLIENT_ID;
  // Nous pouvons utiliser fetch ou directement l'API de base
  // Mais attendez, comment l'application compta interroge-t-elle Gmail ?
  // Regardons si l'application a un script d'authentification ou d'interrogation Gmail !
  console.log("Searching Gmail for Swiss Life...");
}
run();
