// Installa la trascrizione vocale in locale: un ambiente Python suo (dati/voce-venv) con faster-whisper.
// Il modello (small, circa 500 MB) si scarica la prima volta che si registra un vocale.
//   npm run voce:installa
// Serve Python 3.10 o più recente. L'ambiente è separato: il Python di sistema non si tocca.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CARTELLA_DATI } from '../motore/ambiente.ts';

const venv = join(CARTELLA_DATI, 'voce-venv');
const pythonVenv = join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

// Il primo Python che risponde con una versione 3.10 o più recente.
function trovaPython(): string {
  const candidati = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const c of candidati) {
    try {
      const v = execFileSync(c, c === 'py' ? ['-3', '--version'] : ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const m = /Python (\d+)\.(\d+)/.exec(v);
      if (m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 10))) return c;
    } catch {
      // non c'è, si prova il prossimo
    }
  }
  throw new Error('non trovo Python 3.10 o più recente: installalo (python.org, o il gestore di pacchetti del sistema) e riprova');
}

// Pronto solo se dentro c'è pip: un venv creato a metà (su Debian/Ubuntu senza python3-venv) si rifà.
const pipPronto = () => {
  try {
    execFileSync(pythonVenv, ['-m', 'pip', '--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
if (!existsSync(pythonVenv) || !pipPronto()) {
  const python = trovaPython();
  console.log(`Creo l'ambiente in ${venv} con ${python}…`);
  try {
    execFileSync(python, [...(python === 'py' ? ['-3'] : []), '-m', 'venv', '--clear', venv], { stdio: 'inherit' });
  } catch {
    rmSync(venv, { recursive: true, force: true });
    throw new Error('non riesco a creare l\'ambiente Python. Su Debian o Ubuntu installa prima il pacchetto python3-venv (sudo apt install python3-venv) e riprova');
  }
}
console.log('Installo faster-whisper…');
execFileSync(pythonVenv, ['-m', 'pip', 'install', '--upgrade', 'pip'], { stdio: 'inherit' });
execFileSync(pythonVenv, ['-m', 'pip', 'install', 'faster-whisper'], { stdio: 'inherit' });
console.log('Fatto. Riavvia il programma (npm start): il microfono della chat trascrive sul PC.');
