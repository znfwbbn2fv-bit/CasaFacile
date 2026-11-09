/* CasaFacile 1.4.0-beta — Cloudflare Access + Workers + D1 + R2.
 * Configure Cloudflare Access to protect the *entire site*, not just /api.
 * No public backend credentials are required in the browser.
 * Beta deploy must serve PWA and API from the same Cloudflare domain. */
window.CasaFacileCloudConfig={
  provider:'cloudflare',
  enabled:true
};
