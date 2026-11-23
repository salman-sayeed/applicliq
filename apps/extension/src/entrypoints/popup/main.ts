import { applyCachedAppearance } from '@applicliq/ui';
import { mount } from 'svelte';

import App from './App.svelte';

import './app.css';

applyCachedAppearance();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
