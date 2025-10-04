// variant_parsing.js — fonctions spécialisées pour l’extraction des variants
// baseline 0.1

(function(global){

  // --- Détection header variant ---
  function detectVariantHeader(items) {
    const variants = items.filter(it => /\bVariant\b/i.test(it.text));
    const descriptions = items.filter(it => /\bDescription\b/i.test(it.text));
    if (!variants.length || !descriptions.length) return null;
    const yTol = 5;
    for (const v of variants) {
      const d = descriptions.find(desc => Math.abs(desc.y - v.y) <= yTol && desc.x > v.x);
      if (d) return { xVariant: v.x, yHeader: v.y, xDescription: d.x };
    }
    return null;
  }

  // --- Extraction lignes variants ---
  async function extractVariantsByPositions(page, header) {
    const HEADER_HEIGHT = 8;
    const FOOTER_OFFSET = 30;
    const CENTER_OFFSET = -6;

    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent({ disableCombineTextItems: true });
    const raw = tc.items.map(it => ({
      text: (it.str || "").trim(),
      x: it.transform[4],
      y: it.transform[5]
    }));
    raw.sort((a, b) => (b.y - a.y) || (a.x - b.x));

    const FOOTER_RE = /(Page(\s+\d+)?|Interne|Confidentiel|C\d)/i;
    let yFooter = Math.min(...raw.map(it => it.y));
    const footerHits = raw.filter(it => FOOTER_RE.test(it.text));
    if (footerHits.length) yFooter = Math.min(yFooter, Math.min(...footerHits.map(it => it.y)));
    yFooter += FOOTER_OFFSET;

    const band = Math.min(Math.max((header.xDescription - header.xVariant) * 0.25, 6), 14);
    const xMin = header.xVariant - band;
    const xMax = header.xVariant + band;
    const numberRe = /^[0-9]{1,3}$/;

    let candidates = raw.filter(it =>
      numberRe.test(it.text) &&
      it.x >= xMin && it.x <= xMax &&
      it.y < (header.yHeader - 6) &&
      it.y > yFooter
    ).sort((a, b) => b.y - a.y);

    const yTol = 3;
    const variantNums = [];
    for (const c of candidates) {
      if (!variantNums.length || Math.abs(variantNums[variantNums.length - 1].y - c.y) > yTol) {
        variantNums.push(c);
      }
    }
    if (!variantNums.length) return [];

    const rows = [];
    let currentTop = header.yHeader - HEADER_HEIGHT;

    for (let i = 0; i < variantNums.length; i++) {
      const v = variantNums[i];
      let h = 2 * (currentTop - v.y);
      let yBot = currentTop - h;

      yBot -= CENTER_OFFSET;
      h = currentTop - yBot;

      if (h > 5) {
        const xDescMin = header.xDescription - 5;
        const lineItems = raw.filter(it => it.y <= currentTop && it.y >= yBot);
        const descItems = lineItems.filter(it => it.x >= xDescMin).sort((a, b) => a.x - b.x);
        const description = mergeTokens(descItems);

        let xDescStart = descItems.length ? descItems[0].x - 5 : xDescMin;
        let xDescEnd   = descItems.length ? descItems[descItems.length - 1].x + 60 : (xDescMin + 200);
        let w = xDescEnd - xDescStart;

        rows.push({
          variantId: v.text,
          description,
          bbox: { x: xDescStart, y: yBot, w, h }
        });
      }
      currentTop = yBot;
    }
    return rows;
  }

  // --- Merge tokens d’une ligne en description ---
  function mergeTokens(items) {
    return items.map(it => it.text).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  // --- Génération miniature alignée avec overlay ---
  async function generateVariantThumbnail(pdf, pageNum, bbox) {
    try {
      const page = await pdf.getPage(pageNum);
      const scale = 5;
      const viewport = page.getViewport({ scale });
      const transform = viewport.transform;

      function applyTransform(pt, m) {
        return {
          x: m[0] * pt.x + m[2] * pt.y + m[4],
          y: m[1] * pt.x + m[3] * pt.y + m[5],
        };
      }

      const p1 = applyTransform({ x: bbox.x, y: bbox.y }, transform);
      const p2 = applyTransform({ x: bbox.x + bbox.w, y: bbox.y + bbox.h }, transform);

      const sx = Math.min(p1.x, p2.x);
      const sy = Math.min(p1.y, p2.y);
      const sw = Math.abs(p2.x - p1.x);
      const sh = Math.abs(p2.y - p1.y);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = sw;
      canvas.height = sh;

      await page.render({
        canvasContext: ctx,
        viewport,
        transform: [1, 0, 0, 1, -sx, -sy]
      }).promise;

      return canvas.toDataURL("image/png");
    } catch (e) {
      await AlertService.create({
        type: "Parsing",
        message: "Erreur génération miniature",
        details: e.message,
        source: "VariantParsing",
        file: `Page ${pageNum}`,
        level: "error"
      });
      return null;
    }
  }

  global.VariantParsing = {
    detectVariantHeader,
    extractVariantsByPositions,
    mergeTokens,
    generateVariantThumbnail
  };

})(window);
