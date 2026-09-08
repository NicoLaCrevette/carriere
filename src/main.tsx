import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useCareerStore } from './store/careerStore';
import { useUiStore } from './store/uiStore';
import { useMatchStore } from './store/matchStore';
import { useSceneStore } from './store/sceneStore';
import { useSettingsStore } from './store/settingsStore';

// En développement seulement : accès aux stores depuis la console du navigateur (débogage, tests manuels).
if (import.meta.env.DEV) {
  (window as unknown as { __carriere?: unknown }).__carriere = { useCareerStore, useUiStore, useMatchStore, useSceneStore, useSettingsStore };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
