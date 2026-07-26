// ============================================================
// Saravi · Worker principal (archivos estáticos + vista previa OG)
// ============================================================
// Este archivo reemplaza el servicio "automático" que Cloudflare hacía de tu
// repo. Ahora, TODO pasa primero por aquí:
//  - Si la visita es a pedido-inmediata.html?order=XXX, se le inyectan las
//    etiquetas <meta property="og:..."> con la foto/precio real del producto
//    antes de servir el archivo (para que WhatsApp muestre la vista previa
//    correcta).
//  - Cualquier otra visita (index.html, vendedor.html, imágenes, etc.) se
//    sirve exactamente igual que antes — este Worker no le cambia nada.
// ============================================================

const SUPABASE_URL = 'https://dwkuidvxqegdblablwst.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a3VpZHZ4cWVnZGJsYWJsd3N0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NzQ5NzcsImV4cCI6MjA5ODA1MDk3N30.6onUCOak6BHdKlCglFJQhJx0VnnjHaB3vsooNR6l8dk';
const SITE_NAME = 'Saravi';
const DEFAULT_IMAGE = 'https://saravi.shop/og-default.jpg'; // opcional: sube una imagen de marca genérica con este nombre a la raíz del repo

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function calcPublicPrice(p) {
  const vendorPrice = (p.price || 0) * (1 + (p.commission || 0) / 100);
  return vendorPrice * (1 + (p.margin || 0) / 100) + (p.shipping || 0);
}

class HeadMetaInjector {
  constructor(tagsHtml) { this.tagsHtml = tagsHtml; }
  element(element) { element.append(this.tagsHtml, { html: true }); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Todo lo que NO sea pedido-inmediata.html se sirve tal cual, como antes.
    if (!url.pathname.endsWith('pedido-inmediata.html')) {
      return env.ASSETS.fetch(request);
    }

    const originResponse = await env.ASSETS.fetch(request);
    const productId = url.searchParams.get('order');
    if (!productId) return originResponse; // link sin producto, nada que inyectar

    let product = null;
    try {
      const apiUrl = `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=name,image,price,commission,margin,shipping`;
      const res = await fetch(apiUrl, {
        headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON }
      });
      const rows = await res.json();
      product = rows && rows[0] ? rows[0] : null;
    } catch (err) {
      return originResponse; // si Supabase falla, se entrega la página normal, sin romper nada
    }

    if (!product) return originResponse;

    const currency = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    const precio = currency.format(calcPublicPrice(product));
    const titulo = `${product.name} · ${precio} — ${SITE_NAME}`;
    const descripcion = `Haz tu pedido de ${product.name} con entrega inmediata. Precio: ${precio}. Pagas al recibir.`;
    const imagen = product.image || DEFAULT_IMAGE;

    const tags = `
<meta property="og:type" content="product">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(titulo)}">
<meta property="og:description" content="${escapeHtml(descripcion)}">
<meta property="og:image" content="${escapeHtml(imagen)}">
<meta property="og:url" content="${escapeHtml(url.toString())}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(titulo)}">
<meta name="twitter:description" content="${escapeHtml(descripcion)}">
<meta name="twitter:image" content="${escapeHtml(imagen)}">
`;

    return new HTMLRewriter()
      .on('head', new HeadMetaInjector(tags))
      .transform(originResponse);
  }
};
