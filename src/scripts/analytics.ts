/**
 * Privacy-friendly analytics (GoatCounter), only when a code is set in Site
 * Settings. No cookies; a module script so the CSP stays strict.
 */
const code = document.documentElement.dataset.goatcounter;
if (code && !document.querySelector('script[data-goatcounter]')) {
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.append(s);
}
export {};
