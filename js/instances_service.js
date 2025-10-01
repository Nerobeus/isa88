// instances_service.js — Importation des PDF d'instances (LIST OF VARIANTS) 
(function (global) {
  const InstanceService = {
    lastResult: null,

    async parseFile(file, emId = "0000", revision = 1) {
      console.log("[Instances] Import démarré :", file.name);

      const pdfData = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

      let foundPage = null;
      let foundPageNum = null;
      let headerInfo = null;

      // 🔍 Recherche de la vraie page "LIST OF VARIANTS"
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent({ disableCombineTextItems: true });
        const fullText = textContent.items.map(it => it.str).join(" ");

        if (/LIST OF VARIANTS/i.test(fullText)) {
          const items = textContent.items.map(it => ({
            text: (it.str || "").trim(),
            x: it.transform[4],
            y: it.transform[5]
          }));

          const header = detectVariantHeader(items);
          if (header) {
            console.log("[Instances] Table des variants détectée page", pageNum, "→ header:", header);
            foundPage = page;
            foundPageNum = pageNum;
            headerInfo = header;
            break;
          } else {
            console.log("[Instances] Faux positif LIST OF VARIANTS page", pageNum);
          }
        }
      }

      if (!foundPage) {
        console.warn("[Instances] Pas de section LIST OF VARIANTS trouvée");
        return { variants: [], pageNum: 1, file };
      }

      // 🧭 Extraction multi-pages des variants jusqu'au chapitre suivant
      const STOP_RE = /CONTROL MODULES|MEASUREMENTS|CHARACTERISTICS|MACHINE PARAMETERS|EXTERNAL/i;
      const variants = [];
      for (let p = foundPageNum; p <= pdf.numPages; p++) {
        const page = (p === foundPageNum) ? foundPage : await pdf.getPage(p);
        const tc = await page.getTextContent({ disableCombineTextItems: true });
        const fullText = tc.items.map(it => it.str).join(" ");

        if (p !== foundPageNum && STOP_RE.test(fullText)) {
          console.log("[Instances] Fin de la section LIST OF VARIANTS détectée page", p);
          break;
        }

        const items = tc.items.map(it => ({
          text: (it.str || "").trim(),
          x: it.transform[4],
          y: it.transform[5]
        }));
        const headerThisPage = detectVariantHeader(items) || headerInfo;

        if (!headerThisPage) {
          console.log("[Instances] Header non détecté page", p, "→ saut de page");
          continue;
        }

        const rows = await extractVariantsByPositions(page, headerThisPage);
        rows.forEach(r => {
          const index = variants.length + 1;
          variants.push({
            id: `${emId}-${index.toString().padStart(2, "0")}-R${revision}`,
            emId,
            index,
            revision,
            variantId: r.variantId || "",
            description: r.description || "",
            bbox: r.bbox,
            page: p
          });
        });

        if (STOP_RE.test(fullText) && p !== foundPageNum) {
          console.log("[Instances] Fin de section sur la même page après extraction", p);
          break;
        }
      }

      console.log("[Instances] Variants extraits (multi-pages) :", variants);

      // Sauvegarde DB
      await DBService.save("variants", variants);

      const result = { variants, pageNum: foundPageNum, file };
      this.lastResult = result;

      // Toujours remplir le tableau
      try {
        await updateVariantsTable(variants);
        console.log("[Instances] Tableau rempli");
      } catch (e) {
        console.error("[Instances] Erreur updateVariantsTable:", e);
      }

      // ✅ Utilise init() pour conserver le fichier et activer navigation
      const tabPanel = document.querySelector("#tab-instances.tab-panel.active");
      if (tabPanel && window.InstancesOverlay && typeof InstancesOverlay.init === "function") {
        InstancesOverlay.init(file, variants, foundPageNum)
          .then(() => console.log("[Instances] PDF rendu via init()"))
          .catch(e => console.error("[Instances] Erreur overlay:", e));
      } else {
        console.log("[Instances] Onglet Instances inactif → rendu PDF différé");
      }

      return result;
    },

    async renderIfNeeded() {
      if (this.lastResult) {
        const { file, pageNum, variants } = this.lastResult;

        try {
          await updateVariantsTable(variants);
          console.log("[Instances] Tableau rempli (renderIfNeeded)");
        } catch (e) {
          console.error("[Instances] Erreur updateVariantsTable (renderIfNeeded):", e);
        }

        // ✅ On passe aussi par init() pour réactiver navigation
        if (window.InstancesOverlay && typeof InstancesOverlay.init === "function") {
          InstancesOverlay.init(file, variants, pageNum)
            .then(() => console.log("[Instances] PDF rendu (renderIfNeeded)"))
            .catch(e => console.error("[Instances] Erreur overlay:", e));
        }
      }
    }
  };

  function detectVariantHeader(items) {
    const variants = items.filter(it => /\bVariant\b/i.test(it.text));
    const descriptions = items.filter(it => /\bDescription\b/i.test(it.text));
    if (!variants.length || !descriptions.length) return null;

    const yTol = 5;
    for (const v of variants) {
      const d = descriptions.find(desc => Math.abs(desc.y - v.y) <= yTol && desc.x > v.x);
      if (d) {
        return { xVariant: v.x, yHeader: v.y, xDescription: d.x };
      }
    }
    return null;
  }

  // 🔧 Met à jour le tableau #results-table
  async function updateVariantsTable(variants) {
    const tbody = document.querySelector("#results-table tbody");
    if (!tbody) {
      console.warn("[Instances] ⚠️ Table HTML #results-table non trouvée");
      return;
    }

    tbody.innerHTML = "";
    console.log("[Instances] updateVariantsTable() appelée avec", variants.length, "variants");

    const allCMs = await DBService.getAllRoles();
    console.log("[Instances] Total Roles collectés:", allCMs.length);

    const norm = s => String(s || "").replace(/[-_]/g, "").toUpperCase();

    variants.forEach((v) => {
      const tr = document.createElement("tr");

      const td1 = document.createElement("td");
      td1.textContent = v.variantId ?? "?";
      tr.appendChild(td1);

      const td2 = document.createElement("td");
      td2.textContent = "📄";
      tr.appendChild(td2);

      const tdValid = document.createElement("td");
      const tdAlerts = document.createElement("td");

      const validElems = [];
      const alerts = [];

      const tokens = (v.description ?? "").split(/\s+/).filter(t => t.length >= 4);
      tokens.forEach(t => {
        const exact = allCMs.find(c => c.RoleOrSignal === t);
        if (exact) {
          validElems.push(`<strong>${exact.RoleOrSignal}</strong> ${exact.TagName}`);
          return;
        }
        const loose = allCMs.find(c => norm(c.RoleOrSignal) === norm(t));
        if (loose) {
          alerts.push(`${t} → ${loose.RoleOrSignal}`);
        }
      });

      if (validElems.length) {
        tdValid.innerHTML = validElems.join("<br>");
      } else {
        tdValid.textContent = "-";
      }

      tdAlerts.textContent = alerts.length ? alerts.join("\n") : "-";

      tr.appendChild(tdValid);
      tr.appendChild(tdAlerts);

      tbody.appendChild(tr);
    });

    console.log("[Instances] Contenu final du <tbody>:", tbody.innerHTML);
  }

  async function extractVariantsByPositions(page, header) {
    const HEADER_HEIGHT = 8;
    const FOOTER_OFFSET = 30;
    const CENTER_OFFSET = -6;

    const viewport = page.getViewport({ scale: 1 });
    const pageCenter = viewport.width / 2;

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
    if (footerHits.length) {
      yFooter = Math.min(yFooter, Math.min(...footerHits.map(it => it.y)));
      console.log("[Instances] Footer détecté à y =", yFooter);
    }
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

    const offset = pageCenter - header.xVariant;
    const tableWidth = offset * 2;
    const xStart = header.xVariant;

    const rows = [];
    let currentTop = header.yHeader - HEADER_HEIGHT;

    for (let i = 0; i < variantNums.length; i++) {
      const v = variantNums[i];
      let h = 2 * (currentTop - v.y);
      let yBot = currentTop - h;

      yBot -= CENTER_OFFSET;
      h = currentTop - yBot;

      if (i === variantNums.length - 1) {
        yBot = yFooter;
        h = currentTop - yBot;
      }

      if (h > 5) {
        const xDescMin = header.xDescription - 5;
        const lineItems = raw.filter(it => it.y <= currentTop && it.y >= yBot);
        const descItems = lineItems.filter(it => it.x >= xDescMin).sort((a, b) => a.x - b.x);
        const description = mergeTokens(descItems);

        rows.push({
          variantId: v.text,
          description,
          bbox: {
            x: xStart,
            y: yBot,
            w: tableWidth,
            h: h
          }
        });
      }
      currentTop = yBot;
    }

    return rows;
  }

  function mergeTokens(items) {
    return items.map(it => it.text).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  global.InstanceService = InstanceService;
})(window);
