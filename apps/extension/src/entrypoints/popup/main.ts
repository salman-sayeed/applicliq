import { applyCachedAppearance } from '@career-pocket/ui';
import { mount } from 'svelte';

import App from './App.svelte';

import './app.css';

applyCachedAppearance();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
