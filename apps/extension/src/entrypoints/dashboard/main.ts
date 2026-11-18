import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

// `dashboard.html#job=<id>` opens that job's details.
const initialJobId = new URLSearchParams(location.hash.slice(1)).get('job') ?? undefined;

export default mount(App, { target: document.getElementById('app')!, props: { initialJobId } });
