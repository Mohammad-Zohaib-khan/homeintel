import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => { cleanup(); document.documentElement.dataset.theme = 'light'; localStorage.clear(); });
// jsdom gaps used by the app shell and map
if (!window.ResizeObserver) window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
Element.prototype.scrollIntoView = function scrollIntoView() {};
if (!HTMLDialogElement.prototype.showModal) { HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; }; HTMLDialogElement.prototype.close = function close() { this.open = false; }; }
