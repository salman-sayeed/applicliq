import { SETTINGS_PAGES, type SettingsPageId, applyCachedAppearance } from '@applicliq/ui';
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

applyCachedAppearance();

// `options.html#notifications` opens that section.
const hash = location.hash.slice(1);
const section = SETTINGS_PAGES.some((p) => p.id === hash) ? (hash as SettingsPageId) : undefined;

export default mount(App, { target: document.getElementById('app')!, props: { section } });
