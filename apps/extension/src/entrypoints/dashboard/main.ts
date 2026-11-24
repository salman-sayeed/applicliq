import { applyCachedAppearance } from '@applicliq/ui';
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

applyCachedAppearance();

// `dashboard.html#job=<id>` opens that job's details; `#onboarding` replays the introduction.
const hash = new URLSearchParams(location.hash.slice(1));
const initialJobId = hash.get('job') ?? undefined;
const onboarding = hash.has('onboarding');
// `#view=insights` (the weekly recap notification) opens the Insights tab.
const initialView = hash.get('view') === 'insights' ? ('insights' as const) : undefined;
if (onboarding) history.replaceState(null, '', location.pathname);

export default mount(App, {
  target: document.getElementById('app')!,
  props: { initialJobId, onboarding, initialView },
});
