import './styles.css';
import { mount } from './app.js';
import { mountRainbow } from './connect/rainbow.jsx';

mount(document.getElementById('app'));
mountRainbow(document.getElementById('rainbowkit-root'));
