import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './stile.css';

// Niente StrictMode: con React 19 il doppio montaggio smonta le etichette 3D di drei (Html) e non le rimonta.
createRoot(document.getElementById('root')!).render(<App />);
