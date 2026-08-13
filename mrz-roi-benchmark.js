const state = {
  cases: [],
  running: false,
  workers: new Map()
};

const ROI_RATING_KEY = "mrzRoiBenchmarkRatings.v1";

const methods = [
  {
    id: "two-phase-ocrb-roi",
    name: "Duas fases: morfologia + OCR-B",
    description: "Gera linhas candidatas por visao computacional e confirma sequencias MRZ com OCR-B de ./tessdata.",
    detector: detectTwoPhaseOcrbRoi
  },
  {
    id: "dark-bands",
    name: "Bandas escuras",
    description: "Deteta linhas com muitos pixels escuros na metade inferior.",
    detector: detectDarkBandsRoi
  },
  {
    id: "shadow-normalized-bands",
    name: "Bandas com fundo local",
    description: "Compensa sombras antes de procurar linhas MRZ.",
    detector: detectShadowNormalizedBandsRoi
  },
  {
    id: "edge-density",
    name: "Densidade de bordas",
    description: "Procura zonas horizontais com muita variação, típico de texto OCR-B.",
    detector: detectEdgeDensityRoi
  },
  {
    id: "bottom-text-band",
    name: "Faixa inferior inteligente",
    description: "Escolhe a maior concentração de texto na zona inferior do documento.",
    detector: detectBottomTextBandRoi
  },
  {
    id: "morphology-bottomhat-scharr",
    name: "Morfologia: bottom-hat + Scharr",
    description: "Realca texto MRZ com bottom-hat, gradiente horizontal, Otsu e componentes ligados.",
    detector: detectMorphologyBottomHatScharrRoi
  },
  {
    id: "hybrid-morphology-bottom-band",
    name: "Hibrido: morfologia + faixa inferior",
    description: "Usa a morfologia quando concorda com a faixa inferior; caso contrario fica no metodo mais estavel.",
    detector: detectHybridMorphologyBottomBandRoi
  },
  {
    id: "fixed-lower-wide",
    name: "Fixo inferior largo",
    description: "Fallback simples para documentos alinhados com MRZ no fundo.",
    detector: detectFixedLowerWideRoi
  },
  {
    id: "fixed-lower-tight",
    name: "Fixo inferior apertado",
    description: "Fallback mais baixo e mais estreito para fotos já aproximadas.",
    detector: detectFixedLowerTightRoi
  }
];

document.addEventListener("DOMContentLoaded", init);

function init() {
  renderMethods();
  document.getElementById("image-input").addEventListener("change", onImagesSelected);
  document.getElementById("run-all").addEventListener("click", runAll);
  document.getElementById("clear-all").addEventListener("click", clearAll);
  document.getElementById("clear-ratings").addEventListener("click", clearRatings);
}

function renderMethods() {
  document.getElementById("method-list").innerHTML = methods.map(method => `
    <label class="pipeline-option">
      <input type="checkbox" value="${method.id}" checked>
      <span><strong>${escapeHtml(method.name)}</strong><br>${escapeHtml(method.description)}</span>
    </label>
  `).join("");
  document.getElementById("method-count").textContent = `${methods.length} metodos ativos`;
}

function onImagesSelected(event) {
  for (const file of [...event.target.files]) addCase(file);
  event.target.value = "";
  renderCases();
}

function addCase(file) {
  state.cases.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    file,
    url: URL.createObjectURL(file),
    results: []
  });
}

function clearAll() {
  for (const testCase of state.cases) URL.revokeObjectURL(testCase.url);
  state.cases = [];
  renderCases();
  setStatus("Sem imagens carregadas.");
}

function clearRatings() {
  localStorage.removeItem(ROI_RATING_KEY);
  for (const testCase of state.cases) {
    for (const result of testCase.results) result.rating = null;
  }
  renderCases();
  renderSummary();
}

async function runAll() {
  if (state.running) return;
  const selected = selectedMethods();
  if (!state.cases.length) {
    setStatus("Carrega imagens primeiro.");
    return;
  }
  if (!selected.length) {
    setStatus("Seleciona pelo menos um metodo.");
    return;
  }

  state.running = true;
  document.getElementById("run-all").disabled = true;
  try {
    for (let caseIndex = 0; caseIndex < state.cases.length; caseIndex++) {
      const testCase = state.cases[caseIndex];
      setStatus(`Imagem ${caseIndex + 1}/${state.cases.length}: ${testCase.file.name}`);
      testCase.results = [];
      const img = await loadImage(testCase.file);
      for (const method of selected) {
        const started = performance.now();
        let result;
        try {
          result = await runMethod(method, img, testCase);
        } catch (error) {
          result = buildMethodErrorResult(method, error);
        }
        result.ms = Math.round(performance.now() - started);
        testCase.results.push(result);
      }
      renderCases();
      renderSummary();
    }
    setStatus("Deteção concluida.");
  } catch (error) {
    setStatus(`Erro: ${error.message || error}`);
  } finally {
    state.running = false;
    document.getElementById("run-all").disabled = false;
  }
}

function selectedMethods() {
  const selected = [...document.querySelectorAll("#method-list input:checked")].map(input => input.value);
  return methods.filter(method => selected.includes(method.id));
}

async function runMethod(method, img, testCase) {
  const detected = await method.detector(img);
  const roi = clampPixelRoi(detected.roi || detected, img);
  const debug = await cropDebugImages(img, roi);
  const rating = loadRating(testCase, method.id);
  return {
    methodId: method.id,
    methodName: method.name,
    roi,
    score: detected.score || 0,
    warning: detected.warning || "",
    rating,
    ...debug
  };
}

function buildMethodErrorResult(method, error) {
  return {
    methodId: method.id,
    methodName: method.name,
    roi: { x: 0, y: 0, w: 1, h: 1 },
    score: 0,
    warning: `Erro no metodo: ${error?.message || error}`,
    rating: null,
    cropUrl: tinyPlaceholderDataUrl(),
    overlayUrl: tinyPlaceholderDataUrl()
  };
}

async function cropDebugImages(img, roi) {
  const crop = document.createElement("canvas");
  const cropSize = fitCanvasSize(roi.w, roi.h, 1200, 360);
  crop.width = cropSize.width;
  crop.height = cropSize.height;
  const cropCtx = crop.getContext("2d");
  cropCtx.imageSmoothingEnabled = true;
  cropCtx.imageSmoothingQuality = "high";
  cropCtx.drawImage(img, roi.x, roi.y, roi.w, roi.h, 0, 0, crop.width, crop.height);

  const overlay = document.createElement("canvas");
  const overlaySize = fitCanvasSize(img.naturalWidth, img.naturalHeight, 900, 700);
  const overlayWidth = overlaySize.width;
  const overlayHeight = overlaySize.height;
  overlay.width = overlayWidth;
  overlay.height = overlayHeight;
  const overlayCtx = overlay.getContext("2d");
  overlayCtx.drawImage(img, 0, 0, overlayWidth, overlayHeight);
  const sx = overlayWidth / img.naturalWidth;
  const sy = overlayHeight / img.naturalHeight;
  overlayCtx.lineWidth = Math.max(2, Math.round(overlayWidth * 0.004));
  overlayCtx.strokeStyle = "#ffffff";
  overlayCtx.fillStyle = "rgba(0, 0, 0, 0.28)";
  overlayCtx.fillRect(0, 0, overlayWidth, overlayHeight);
  overlayCtx.clearRect(roi.x * sx, roi.y * sy, roi.w * sx, roi.h * sy);
  overlayCtx.strokeRect(roi.x * sx, roi.y * sy, roi.w * sx, roi.h * sy);

  return {
    cropUrl: safeCanvasDataUrl(crop),
    overlayUrl: safeCanvasDataUrl(overlay)
  };
}

function fitCanvasSize(width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / Math.max(1, width), maxHeight / Math.max(1, height), 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function safeCanvasDataUrl(canvas) {
  try {
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return tinyPlaceholderDataUrl();
  }
}

function tinyPlaceholderDataUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "14px Arial";
  ctx.fillText("Imagem de debug demasiado grande.", 18, 42);
  return canvas.toDataURL("image/jpeg", 0.75);
}

function renderCases() {
  const container = document.getElementById("cases");
  container.innerHTML = state.cases.map(testCase => `
    <article class="case-card" data-id="${testCase.id}">
      <div class="case-top">
        <div class="case-preview">
          <img src="${testCase.url}" alt="${escapeHtml(testCase.file.name)}">
        </div>
        <div class="case-meta">
          <h3>${escapeHtml(testCase.file.name)}</h3>
          <p class="muted">${Math.round(testCase.file.size / 1024)} KB</p>
        </div>
      </div>
      <div class="roi-results">${renderResults(testCase)}</div>
    </article>
  `).join("");

  container.querySelectorAll("[data-rating]").forEach(button => {
    button.addEventListener("click", () => {
      const testCase = state.cases.find(item => item.id === button.dataset.caseId);
      const result = testCase?.results.find(item => item.methodId === button.dataset.methodId);
      if (!testCase || !result) return;
      result.rating = button.dataset.rating;
      saveRating(testCase, result.methodId, result.rating);
      updateRatingUi(button.closest(".roi-result-card"), result.rating);
      renderSummary();
    });
  });

  renderSummary();
  setStatus(state.cases.length ? `${state.cases.length} imagem(ns) carregada(s).` : "Sem imagens carregadas.");
}

function renderResults(testCase) {
  if (!testCase.results.length) {
    return `<p class="muted">Executa a deteção para ver os cortes propostos.</p>`;
  }

  return testCase.results.map(result => `
    <section class="result-card roi-result-card" data-method-id="${result.methodId}">
      <div class="result-head">
        <strong>${escapeHtml(result.methodName)}</strong>
        <span class="metric">Score <strong>${formatNumber(result.score)}</strong></span>
        <span class="metric">Tempo <strong>${result.ms} ms</strong></span>
        <span class="metric">ROI <strong>${roiLabel(result.roi, testCase)}</strong></span>
      </div>
      ${result.warning ? `<p class="muted">${escapeHtml(result.warning)}</p>` : ""}
      <div class="roi-rating">
        <button type="button" class="${result.rating === "ok" ? "" : "secondary"}" data-rating="ok" data-case-id="${testCase.id}" data-method-id="${result.methodId}">Certo</button>
        <button type="button" class="${result.rating === "bad" ? "" : "secondary"}" data-rating="bad" data-case-id="${testCase.id}" data-method-id="${result.methodId}">Errado</button>
        <span class="muted" data-rating-label>${result.rating ? `Avaliado: ${result.rating === "ok" ? "certo" : "errado"}` : "Por avaliar"}</span>
      </div>
      <div class="debug-images roi-debug-images">
        <figure>
          <img src="${result.overlayUrl}" alt="Zona detetada">
          <figcaption>Imagem com zona detetada</figcaption>
        </figure>
        <figure>
          <img src="${result.cropUrl}" alt="Corte proposto">
          <figcaption>Corte proposto</figcaption>
        </figure>
      </div>
    </section>
  `).join("");
}

function updateRatingUi(card, rating) {
  if (!card) return;
  const okButton = card.querySelector('[data-rating="ok"]');
  const badButton = card.querySelector('[data-rating="bad"]');
  const label = card.querySelector("[data-rating-label]");
  okButton?.classList.toggle("secondary", rating !== "ok");
  badButton?.classList.toggle("secondary", rating !== "bad");
  if (label) label.textContent = `Avaliado: ${rating === "ok" ? "certo" : "errado"}`;
}

function renderSummary() {
  const rows = buildSummaryRows();
  const counter = document.getElementById("summary-count");
  const table = document.getElementById("summary-table");
  counter.textContent = rows.length ? `${rows.length} metodos com avaliações` : "Sem avaliações.";
  if (!rows.length) {
    table.innerHTML = `<p class="muted">Marca resultados como certo/errado para ver o resumo.</p>`;
    return;
  }

  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Metodo</th>
          <th>Avaliações</th>
          <th>Certo</th>
          <th>Errado</th>
          <th>Taxa certa</th>
          <th>Score medio</th>
          <th>Tempo medio</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.methodName)}</td>
            <td>${row.total}</td>
            <td>${row.ok}</td>
            <td>${row.bad}</td>
            <td>${formatPercent(row.okRate)}</td>
            <td>${formatNumber(row.avgScore)}</td>
            <td>${Math.round(row.avgMs)} ms</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function buildSummaryRows() {
  const stats = new Map();
  for (const testCase of state.cases) {
    for (const result of testCase.results) {
      if (!result.rating) continue;
      if (!stats.has(result.methodId)) {
        stats.set(result.methodId, { methodId: result.methodId, methodName: result.methodName, total: 0, ok: 0, bad: 0, score: 0, ms: 0 });
      }
      const row = stats.get(result.methodId);
      row.total++;
      row.ok += result.rating === "ok" ? 1 : 0;
      row.bad += result.rating === "bad" ? 1 : 0;
      row.score += result.score;
      row.ms += result.ms;
    }
  }

  return [...stats.values()]
    .map(row => ({ ...row, okRate: row.ok / row.total, avgScore: row.score / row.total, avgMs: row.ms / row.total }))
    .sort((a, b) => b.okRate - a.okRate || b.ok - a.ok || b.avgScore - a.avgScore || a.avgMs - b.avgMs);
}

function detectDarkBandsRoi(img) {
  return detectProjectionRoi(img, { normalize: false, scoreMode: "dark" });
}

function detectShadowNormalizedBandsRoi(img) {
  return detectProjectionRoi(img, { normalize: true, scoreMode: "dark" });
}

function detectEdgeDensityRoi(img) {
  return detectProjectionRoi(img, { normalize: true, scoreMode: "edge" });
}

function detectBottomTextBandRoi(img) {
  return detectProjectionRoi(img, { normalize: true, scoreMode: "combined", minY: 0.54, maxY: 0.96, paddingTop: 0.035, paddingBottom: 0.035 });
}

function detectMorphologyBottomHatScharrRoi(img) {
  return detectMorphologyBottomHatScharrCandidate(img, { fallback: true });
}

function detectHybridMorphologyBottomBandRoi(img) {
  const bottom = detectBottomTextBandRoi(img);
  const morph = detectMorphologyBottomHatScharrCandidate(img, { fallback: false });

  if (!morph.roi) {
    return {
      ...bottom,
      score: bottom.score + 250,
      warning: "Morfologia sem candidato confiavel; usado faixa inferior."
    };
  }

  const overlap = roiOverlapRatio(morph.roi, bottom.roi);
  const centerDelta = Math.abs(roiCenterY(morph.roi) - roiCenterY(bottom.roi)) / img.naturalHeight;
  const strongMorphology = morph.lineCount >= 2 && morph.roi.y / img.naturalHeight >= 0.48;

  if (overlap >= 0.38 || centerDelta <= 0.13 || strongMorphology) {
    return {
      ...morph,
      roi: expandPixelRoi(morph.roi, img, { x: 0.015, yTop: 0.025, yBottom: 0.04 }),
      score: morph.score + bottom.score * 0.35 + overlap * 1500,
      warning: `Morfologia aceite; overlap com faixa inferior ${Math.round(overlap * 100)}%.`
    };
  }

  return {
    ...bottom,
    score: bottom.score + morph.score * 0.12,
    warning: `Morfologia rejeitada; overlap ${Math.round(overlap * 100)}%, centro distante.`
  };
}

async function detectTwoPhaseOcrbRoi(img) {
  const candidates = generateMorphologyLineCandidates(img)
    .sort((a, b) => b.score - a.score)
    .slice(0, 18)
    .sort((a, b) => a.roi.y - b.roi.y);

  if (!candidates.length) {
    const fallback = detectBottomTextBandRoi(img);
    return {
      ...fallback,
      roi: forceFullImageWidthRoi(fallback.roi, img),
      warning: "Fase 1 sem linhas candidatas; usado fallback faixa inferior com largura total."
    };
  }

  const worker = await getRoiOcrWorker();
  const timeoutMs = getRoiOcrConfig().timeoutMs;
  const validated = [];

  for (const candidate of candidates) {
    const roi = expandPixelRoi(candidate.roi, img, { x: 0.01, yTop: 0.006, yBottom: 0.006 });
    const blob = await cropRoiToBlob(img, roi, { targetWidth: 1200, grayscale: true, sharpen: true });
    const ocr = await withTimeout(
      worker.recognize(blob),
      timeoutMs,
      "Timeout OCR-B ao validar linha candidata."
    );
    const text = normalizeCandidateMrzText(ocr?.data?.text || "");
    const validationScore = mrzLineValidationScore(text);
    if (validationScore > 0) {
      validated.push({ ...candidate, roi, text, score: candidate.score + text.length * 12 + validationScore });
    }
  }

  const sequence = chooseValidatedMrzSequence(validated, img);
  if (!sequence.length) {
    const passportFallback = await detectPassportBottomOcrFallback(img, worker, timeoutMs);
    if (passportFallback) return passportFallback;

    const fallback = detectBottomTextBandRoi(img);
    return {
      ...fallback,
      roi: forceFullImageWidthRoi(fallback.roi, img),
      score: sum(candidates.map(candidate => candidate.score)) * 0.05,
      warning: `OCR-B validou 0/${candidates.length} linhas; usado fallback faixa inferior com largura total.`
    };
  }

  const roi = mergeValidatedLineRois(sequence, img);
  return {
    roi,
    score: sum(sequence.map(line => line.score)) + sequence.length * 1800,
    lineCount: sequence.length,
    warning: `OCR-B confirmou ${sequence.length} linha(s) MRZ em ${candidates.length} candidato(s).`
  };
}

async function detectPassportBottomOcrFallback(img, worker, timeoutMs) {
  const rois = [
    { x: 0, y: img.naturalHeight * 0.66, w: img.naturalWidth, h: img.naturalHeight * 0.28 },
    { x: 0, y: img.naturalHeight * 0.58, w: img.naturalWidth, h: img.naturalHeight * 0.38 },
    { x: 0, y: img.naturalHeight * 0.72, w: img.naturalWidth, h: img.naturalHeight * 0.22 }
  ].map(roi => clampPixelRoi(roi, img));

  let best = null;
  for (const roi of rois) {
    const blob = await cropRoiToBlob(img, roi, { targetWidth: 1600, grayscale: true, sharpen: true });
    const ocr = await withTimeout(
      worker.recognize(blob),
      timeoutMs,
      "Timeout OCR-B ao validar fallback inferior de passaporte."
    );
    const text = normalizeCandidateMrzText(ocr?.data?.text || "");
    const score = mrzBlockValidationScore(text);
    if (score > (best?.score || 0)) best = { roi, score, text };
  }

  if (!best) return null;
  return {
    roi: best.roi,
    score: best.score,
    lineCount: 2,
    warning: "Fallback TD3/passaporte validado por OCR-B na faixa inferior larga."
  };
}

function forceFullImageWidthRoi(roi, img) {
  return clampPixelRoi({
    x: 0,
    y: roi.y,
    w: img.naturalWidth,
    h: roi.h
  }, img);
}

function generateMorphologyLineCandidates(img) {
  const width = 900;
  const height = Math.max(1, Math.round(img.naturalHeight * width / img.naturalWidth));
  const variants = [
    { grayCloseX: 7, grayCloseY: 2, binaryCloseX: 18, binaryCloseY: 2, minWidth: 0.46 },
    { grayCloseX: 5, grayCloseY: 1, binaryCloseX: 14, binaryCloseY: 1, minWidth: 0.38 },
    { grayCloseX: 9, grayCloseY: 2, binaryCloseX: 24, binaryCloseY: 2, minWidth: 0.52 }
  ];

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const gray = grayFromPixels(pixels, width, height);
  const candidates = [];

  for (const variant of variants) {
    const blurred = boxBlurGray(gray, width, height, 1);
    const closed = grayscaleClose(blurred, width, height, variant.grayCloseX, variant.grayCloseY);
    const bottomHat = new Float32Array(gray.length);
    for (let i = 0; i < bottomHat.length; i++) bottomHat[i] = Math.max(0, closed[i] - blurred[i]);

    const gradient = scharrHorizontal(bottomHat, width, height);
    const threshold = otsu(gradient);
    const binary = thresholdBinary(gradient, threshold);
    const closedBinary = binaryClose(binary, width, height, variant.binaryCloseX, variant.binaryCloseY);
    const components = connectedComponents(closedBinary, width, height);

    for (const component of components) {
      const aspect = component.w / Math.max(1, component.h);
      const fill = component.area / Math.max(1, component.w * component.h);
      const yRatio = component.y / height;
      const hRatio = component.h / height;
      if (
        aspect < 8 ||
        component.w < width * variant.minWidth ||
        hRatio < 0.006 ||
        hRatio > 0.08 ||
        yRatio < 0.34
      ) continue;

      const roi = scaleRoiFromWorking(
        { x: component.x, y: component.y, w: component.w, h: component.h },
        img,
        width,
        height
      );
      candidates.push({
        roi,
        x: component.x,
        y: component.y,
        w: component.w,
        h: component.h,
        cy: component.cy,
        score: component.w * 0.9 + aspect * 45 + yRatio * 240 + fill * 180
      });
    }
  }

  return dedupeLineCandidates(candidates, img).slice(0, 30);
}

function dedupeLineCandidates(candidates, img) {
  const sorted = candidates.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const candidate of sorted) {
    const duplicate = kept.some(item => roiOverlapRatio(item.roi, candidate.roi) > 0.62);
    if (!duplicate) kept.push(candidate);
  }
  return kept
    .map(candidate => ({ ...candidate, roi: clampPixelRoi(candidate.roi, img) }))
    .sort((a, b) => b.score - a.score);
}

function chooseValidatedMrzSequence(lines, img) {
  const sorted = lines.slice().sort((a, b) => a.roi.y - b.roi.y);
  let best = [];
  let bestScore = -Infinity;

  for (const size of [3, 2]) {
    for (let i = 0; i <= sorted.length - size; i++) {
      const group = sorted.slice(i, i + size);
      if (!isRegularMrzLineSequence(group)) continue;
      const bottomBias = (group[group.length - 1].roi.y + group[group.length - 1].roi.h) / img.naturalHeight;
      const score = sum(group.map(line => line.score)) + size * 3000 + bottomBias * 700;
      if (score > bestScore) {
        best = group;
        bestScore = score;
      }
    }
    if (best.length) return best;
  }

  return [];
}

function isRegularMrzLineSequence(group) {
  const heights = group.map(line => line.roi.h);
  const avgHeight = sum(heights) / Math.max(1, heights.length);
  const gaps = [];
  for (let i = 1; i < group.length; i++) {
    const previous = group[i - 1].roi;
    const current = group[i].roi;
    const gap = current.y - (previous.y + previous.h);
    if (gap < -avgHeight * 0.65 || gap > avgHeight * 1.8) return false;
    gaps.push(gap);
  }
  if (gaps.length > 1) {
    const avgGap = sum(gaps) / gaps.length;
    if (gaps.some(gap => Math.abs(gap - avgGap) > avgHeight * 0.9)) return false;
  }
  return true;
}

function mergeValidatedLineRois(lines, img) {
  const minY = Math.min(...lines.map(line => line.roi.y));
  const maxY = Math.max(...lines.map(line => line.roi.y + line.roi.h));
  const padding = Math.round((maxY - minY) * 0.28);
  return clampPixelRoi({
    x: 0,
    y: minY - padding,
    w: img.naturalWidth,
    h: maxY - minY + padding * 2
  }, img);
}

function detectMorphologyBottomHatScharrCandidate(img, options = {}) {
  const width = 900;
  const height = Math.max(1, Math.round(img.naturalHeight * width / img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const gray = grayFromPixels(pixels, width, height);
  const blurred = boxBlurGray(gray, width, height, 1);
  const closed = grayscaleClose(blurred, width, height, 7, 2);
  const bottomHat = new Float32Array(gray.length);
  for (let i = 0; i < bottomHat.length; i++) bottomHat[i] = Math.max(0, closed[i] - blurred[i]);

  const gradient = scharrHorizontal(bottomHat, width, height);
  const threshold = otsu(gradient);
  const binary = thresholdBinary(gradient, threshold);
  const closedBinary = binaryClose(binary, width, height, 18, 2);
  const components = connectedComponents(closedBinary, width, height);
  const selected = chooseMrzComponents(components, width, height);

  if (!selected.length) {
    if (!options.fallback) return { roi: null, score: 0, lineCount: 0, warning: "Morfologia sem componentes MRZ." };
    return { ...detectBottomTextBandRoi(img), warning: "Morfologia sem componentes MRZ; usado fallback faixa inferior." };
  }

  const bounds = mergeComponentBounds(selected, width, height);
  const roi = scaleRoiFromWorking(bounds, img, width, height);
  return {
    roi,
    score: sum(selected.map(component => component.score)),
    lineCount: selected.length
  };
}

function detectFixedLowerWideRoi(img) {
  return {
    roi: {
      x: Math.round(img.naturalWidth * 0.03),
      y: Math.round(img.naturalHeight * 0.58),
      w: Math.round(img.naturalWidth * 0.94),
      h: Math.round(img.naturalHeight * 0.34)
    },
    score: 1,
    warning: "Fallback fixo, sem deteção real."
  };
}

function detectFixedLowerTightRoi(img) {
  return {
    roi: {
      x: Math.round(img.naturalWidth * 0.05),
      y: Math.round(img.naturalHeight * 0.68),
      w: Math.round(img.naturalWidth * 0.90),
      h: Math.round(img.naturalHeight * 0.24)
    },
    score: 1,
    warning: "Fallback fixo, sem deteção real."
  };
}

function detectProjectionRoi(img, options) {
  const width = 900;
  const height = Math.max(1, Math.round(img.naturalHeight * width / img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const gray = grayFromPixels(pixels, width, height);
  if (options.normalize) normalizeShadows(gray, width, height, 21);

  const minY = Math.floor(height * (options.minY || 0.42));
  const maxY = Math.floor(height * (options.maxY || 0.96));
  const minX = Math.floor(width * 0.02);
  const maxX = Math.floor(width * 0.98);
  const scores = scoreRows(gray, width, height, minX, maxX, options.scoreMode);
  const smoothed = smoothArray(scores, 5);
  const bands = collectBands(smoothed, minY, maxY, Math.max(...smoothed.slice(minY, maxY)) * 0.32);
  const group = chooseMrzBands(bands);

  if (!group) {
    return { ...detectFixedLowerWideRoi(img), warning: "Sem banda forte detetada; usado fallback fixo." };
  }

  const y0Px = Math.max(0, Math.round(group.start - height * (options.paddingTop || 0.045)));
  const y1Px = Math.min(height - 1, Math.round(group.end + height * (options.paddingBottom || 0.05)));
  const xBounds = detectMrzXBounds(gray, width, y0Px, y1Px);

  return {
    roi: {
      x: Math.round(img.naturalWidth * xBounds.x),
      y: Math.round(img.naturalHeight * (y0Px / height)),
      w: Math.round(img.naturalWidth * xBounds.w),
      h: Math.round(img.naturalHeight * Math.max(0.12, (y1Px - y0Px) / height))
    },
    score: group.score
  };
}

function grayFromPixels(pixels, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < pixels.length; i += 4) {
    gray[i / 4] = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
  }
  return gray;
}

function scoreRows(gray, width, height, minX, maxX, mode) {
  const scores = new Array(height).fill(0);
  for (let y = 1; y < height - 1; y++) {
    let score = 0;
    for (let x = minX + 1; x < maxX - 1; x += 2) {
      const i = y * width + x;
      const dark = gray[i] < 132 ? 1 : 0;
      const edge = Math.abs(gray[i] - gray[i - 1]) + Math.abs(gray[i] - gray[i - width]);
      if (mode === "edge") score += edge > 34 ? 1 : 0;
      else if (mode === "combined") score += dark + (edge > 34 ? 0.65 : 0);
      else score += dark;
    }
    scores[y] = score;
  }
  return scores;
}

function collectBands(scores, minY, maxY, threshold) {
  const bands = [];
  let start = -1;
  for (let y = minY; y < maxY; y++) {
    if (scores[y] > threshold && start < 0) start = y;
    if ((scores[y] <= threshold || y === maxY - 1) && start >= 0) {
      const end = y;
      if (end - start >= 3) bands.push({ start, end, center: (start + end) / 2, score: sum(scores.slice(start, end + 1)) });
      start = -1;
    }
  }
  return bands;
}

function chooseMrzBands(bands) {
  const candidates = bands
    .filter(band => band.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 14)
    .sort((a, b) => a.center - b.center);

  let best = null;
  for (const size of [3, 2, 1]) {
    for (let i = 0; i <= candidates.length - size; i++) {
      const group = candidates.slice(i, i + size);
      const span = group[group.length - 1].center - group[0].center;
      const bottomBias = group[group.length - 1].center * 0.25;
      const spanPenalty = size > 1 ? Math.abs(span - 62) * 2.5 : 120;
      const score = sum(group.map(item => item.score)) + bottomBias - spanPenalty;
      if (!best || score > best.score) best = { start: group[0].start, end: group[group.length - 1].end, score };
    }
    if (best) return best;
  }
  return null;
}

function detectMrzXBounds(gray, width, y0, y1) {
  const scores = new Array(width).fill(0);
  const height = Math.max(1, y1 - y0 + 1);
  for (let x = 0; x < width; x++) {
    let dark = 0;
    for (let y = y0; y <= y1; y += 2) {
      if (gray[y * width + x] < 145) dark++;
    }
    scores[x] = dark / Math.ceil(height / 2);
  }

  const smooth = smoothArray(scores, 6);
  const threshold = Math.max(...smooth) * 0.16;
  let left = smooth.findIndex(value => value > threshold);
  let right = smooth.length - 1 - [...smooth].reverse().findIndex(value => value > threshold);
  if (left < 0 || right <= left) return { x: 0.03, w: 0.94 };

  left = Math.max(0, left - Math.round(width * 0.035));
  right = Math.min(width - 1, right + Math.round(width * 0.035));
  return { x: left / width, w: Math.max(0.45, (right - left + 1) / width) };
}

function grayscaleClose(gray, width, height, radiusX, radiusY) {
  return rectangularMinFilter(rectangularMaxFilter(gray, width, height, radiusX, radiusY), width, height, radiusX, radiusY);
}

function rectangularMaxFilter(src, width, height, radiusX, radiusY) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = 0;
      for (let yy = Math.max(0, y - radiusY); yy <= Math.min(height - 1, y + radiusY); yy++) {
        const row = yy * width;
        for (let xx = Math.max(0, x - radiusX); xx <= Math.min(width - 1, x + radiusX); xx++) {
          if (src[row + xx] > best) best = src[row + xx];
        }
      }
      out[y * width + x] = best;
    }
  }
  return out;
}

function rectangularMinFilter(src, width, height, radiusX, radiusY) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = 255;
      for (let yy = Math.max(0, y - radiusY); yy <= Math.min(height - 1, y + radiusY); yy++) {
        const row = yy * width;
        for (let xx = Math.max(0, x - radiusX); xx <= Math.min(width - 1, x + radiusX); xx++) {
          if (src[row + xx] < best) best = src[row + xx];
        }
      }
      out[y * width + x] = best;
    }
  }
  return out;
}

function scharrHorizontal(src, width, height) {
  const out = new Float32Array(src.length);
  let maxValue = 1;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value = Math.abs(
        3 * src[i - width + 1] + 10 * src[i + 1] + 3 * src[i + width + 1] -
        3 * src[i - width - 1] - 10 * src[i - 1] - 3 * src[i + width - 1]
      );
      out[i] = value;
      if (value > maxValue) maxValue = value;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / maxValue) * 255;
  return out;
}

function thresholdBinary(gray, threshold) {
  const binary = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) binary[i] = gray[i] >= threshold ? 1 : 0;
  return binary;
}

function binaryClose(binary, width, height, radiusX, radiusY) {
  return binaryErode(binaryDilate(binary, width, height, radiusX, radiusY), width, height, radiusX, radiusY);
}

function binaryDilate(binary, width, height, radiusX, radiusY) {
  const out = new Uint8Array(binary.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      for (let yy = Math.max(0, y - radiusY); yy <= Math.min(height - 1, y + radiusY) && !value; yy++) {
        const row = yy * width;
        for (let xx = Math.max(0, x - radiusX); xx <= Math.min(width - 1, x + radiusX); xx++) {
          if (binary[row + xx]) {
            value = 1;
            break;
          }
        }
      }
      out[y * width + x] = value;
    }
  }
  return out;
}

function binaryErode(binary, width, height, radiusX, radiusY) {
  const out = new Uint8Array(binary.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 1;
      for (let yy = Math.max(0, y - radiusY); yy <= Math.min(height - 1, y + radiusY) && value; yy++) {
        const row = yy * width;
        for (let xx = Math.max(0, x - radiusX); xx <= Math.min(width - 1, x + radiusX); xx++) {
          if (!binary[row + xx]) {
            value = 0;
            break;
          }
        }
      }
      out[y * width + x] = value;
    }
  }
  return out;
}

function connectedComponents(binary, width, height) {
  const visited = new Uint8Array(binary.length);
  const components = [];
  const queue = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!binary[start] || visited[start]) continue;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      queue.length = 0;
      queue.push(start);
      visited[start] = 1;

      for (let qi = 0; qi < queue.length; qi++) {
        const index = queue[qi];
        const cx = index % width;
        const cy = Math.floor(index / width);
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (const next of [index - 1, index + 1, index - width, index + width]) {
          if (next < 0 || next >= binary.length || visited[next] || !binary[next]) continue;
          const nx = next % width;
          if (Math.abs(nx - cx) > 1) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      components.push({ x: minX, y: minY, w, h, area, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 });
    }
  }
  return components;
}

function chooseMrzComponents(components, width, height) {
  const lineCandidates = components
    .map(component => {
      const aspect = component.w / Math.max(1, component.h);
      const bottom = component.y / height;
      const fill = component.area / Math.max(1, component.w * component.h);
      const score = component.w * 0.8 + aspect * 40 + bottom * 180 + fill * 120;
      return { ...component, aspect, bottom, fill, score };
    })
    .filter(component =>
      component.aspect >= 7 &&
      component.w >= width * 0.34 &&
      component.h >= height * 0.006 &&
      component.h <= height * 0.09 &&
      component.bottom >= 0.42
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 16)
    .sort((a, b) => a.cy - b.cy);

  let best = [];
  let bestScore = -Infinity;
  for (const size of [3, 2]) {
    for (let i = 0; i <= lineCandidates.length - size; i++) {
      const group = lineCandidates.slice(i, i + size);
      const xSpread = Math.max(...group.map(item => item.x)) - Math.min(...group.map(item => item.x));
      const widthSpread = Math.max(...group.map(item => item.w)) - Math.min(...group.map(item => item.w));
      const yGaps = [];
      for (let j = 1; j < group.length; j++) yGaps.push(group[j].cy - group[j - 1].cy);
      const averageGap = yGaps.length ? sum(yGaps) / yGaps.length : 0;
      const parallelPenalty = xSpread * 1.5 + widthSpread * 0.8;
      const gapPenalty = yGaps.length ? sum(yGaps.map(gap => Math.abs(gap - averageGap))) * 6 : 0;
      const score = sum(group.map(item => item.score)) + size * 900 - parallelPenalty - gapPenalty;
      if (score > bestScore) {
        bestScore = score;
        best = group;
      }
    }
    if (best.length) return best;
  }

  return lineCandidates.slice(0, 1);
}

function mergeComponentBounds(components, width, height) {
  const minX = Math.max(0, Math.min(...components.map(component => component.x)) - Math.round(width * 0.045));
  const maxX = Math.min(width - 1, Math.max(...components.map(component => component.x + component.w)) + Math.round(width * 0.045));
  const minY = Math.max(0, Math.min(...components.map(component => component.y)) - Math.round(height * 0.055));
  const maxY = Math.min(height - 1, Math.max(...components.map(component => component.y + component.h)) + Math.round(height * 0.065));
  return { x: minX, y: minY, w: maxX - minX + 1, h: Math.max(Math.round(height * 0.16), maxY - minY + 1) };
}

function scaleRoiFromWorking(roi, img, width, height) {
  return {
    x: Math.round(img.naturalWidth * roi.x / width),
    y: Math.round(img.naturalHeight * roi.y / height),
    w: Math.round(img.naturalWidth * roi.w / width),
    h: Math.round(img.naturalHeight * roi.h / height)
  };
}

function expandPixelRoi(roi, img, padding) {
  const dx = Math.round(img.naturalWidth * (padding.x || 0));
  const top = Math.round(img.naturalHeight * (padding.yTop || padding.y || 0));
  const bottom = Math.round(img.naturalHeight * (padding.yBottom || padding.y || 0));
  return clampPixelRoi({
    x: roi.x - dx,
    y: roi.y - top,
    w: roi.w + dx * 2,
    h: roi.h + top + bottom
  }, img);
}

function roiCenterY(roi) {
  return roi.y + roi.h / 2;
}

function roiOverlapRatio(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller ? intersection / smaller : 0;
}

function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (const value of gray) hist[Math.round(clamp(value))]++;

  const total = gray.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let sumB = 0;
  let weightB = 0;
  let maxVariance = -1;
  let threshold = 128;
  for (let i = 0; i < 256; i++) {
    weightB += hist[i];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += i * hist[i];
    const meanB = sumB / weightB;
    const meanF = (sumAll - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }
  return threshold;
}

function normalizeShadows(gray, width, height, radius) {
  const background = boxBlurGray(gray, width, height, radius);
  for (let i = 0; i < gray.length; i++) gray[i] = clamp((gray[i] / Math.max(24, background[i])) * 215);
}

function boxBlurGray(src, width, height, radius) {
  const horizontal = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    let total = 0;
    for (let x = -radius; x <= radius; x++) total += src[y * width + clampIndex(x, width)];
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = total / window;
      total += src[y * width + clampIndex(x + radius + 1, width)];
      total -= src[y * width + clampIndex(x - radius, width)];
    }
  }
  for (let x = 0; x < width; x++) {
    let total = 0;
    for (let y = -radius; y <= radius; y++) total += horizontal[clampIndex(y, height) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = total / window;
      total += horizontal[clampIndex(y + radius + 1, height) * width + x];
      total -= horizontal[clampIndex(y - radius, height) * width + x];
    }
  }
  return out;
}

async function getRoiOcrWorker() {
  await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
  const config = getRoiOcrConfig();
  const key = `${config.lang}|${config.langPath}`;
  if (state.workers.has(key)) return state.workers.get(key);

  setStatus(`A carregar OCR ${config.lang} em ${config.langPath}...`);
  const worker = await withTimeout(
    Tesseract.createWorker(config.lang, 1, {
      langPath: config.langPath,
      gzip: false,
      cacheMethod: "refresh"
    }),
    Math.max(12000, config.timeoutMs * 2),
    `Timeout ao carregar modelo OCR ${config.lang}.`
  );
  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
    tessedit_pageseg_mode: "7",
    user_defined_dpi: "300",
    preserve_interword_spaces: "1"
  });
  state.workers.set(key, worker);
  return worker;
}

function getRoiOcrConfig() {
  const lang = document.getElementById("roi-ocr-lang")?.value.trim() || "ocrb";
  const langPath = document.getElementById("roi-ocr-path")?.value.trim() || "./tessdata";
  const timeoutSeconds = Number(document.getElementById("roi-ocr-timeout")?.value) || 8;
  return { lang, langPath, timeoutMs: Math.max(2000, timeoutSeconds * 1000) };
}

function loadScript(src) {
  if (window.Tesseract) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Nao foi possivel carregar ${src}`));
    document.head.appendChild(script);
  });
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function cropRoiToBlob(img, roi, options = {}) {
  const targetWidth = options.targetWidth || 1000;
  const scale = Math.min(4, Math.max(1, targetWidth / Math.max(1, roi.w)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(roi.w * scale));
  canvas.height = Math.max(1, Math.round(roi.h * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, roi.x, roi.y, roi.w, roi.h, 0, 0, canvas.width, canvas.height);

  if (options.grayscale || options.sharpen) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyOcrLinePreprocess(imageData.data, canvas.width, canvas.height, options);
    ctx.putImageData(imageData, 0, 0);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Nao foi possivel gerar recorte para OCR."));
    }, "image/jpeg", 0.9);
  });
}

function applyOcrLinePreprocess(pixels, width, height, options) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < pixels.length; i += 4) {
    gray[i / 4] = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
  }
  const blurred = options.sharpen ? boxBlurGray(gray, width, height, 1) : gray;
  for (let i = 0; i < gray.length; i++) {
    const sharpened = options.sharpen ? clamp(gray[i] + (gray[i] - blurred[i]) * 0.75) : gray[i];
    const value = clamp((sharpened - 128) * 1.2 + 128);
    const p = i * 4;
    pixels[p] = value;
    pixels[p + 1] = value;
    pixels[p + 2] = value;
  }
}

function normalizeCandidateMrzText(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/[«‹＜]/g, "<")
    .replace(/[^A-Z0-9<\s]/g, "")
    .replace(/\s+/g, "");
}

function looksLikeMrzLine(text) {
  return mrzLineValidationScore(text) > 0;
}

function mrzBlockValidationScore(text) {
  const lines = splitLikelyMrzBlockLines(text);
  const hasPassportLine1 = lines.some(line => mrzLinePassportType(line) === "td3-line1");
  const hasPassportLine2 = lines.some(line => mrzLinePassportType(line) === "td3-line2");
  if (hasPassportLine1 && hasPassportLine2) return 5200 + text.length * 8;
  if (hasPassportLine2) return 2800 + text.length * 5;
  return 0;
}

function splitLikelyMrzBlockLines(text) {
  const normalized = String(text || "");
  const lines = new Set(normalized.match(/[A-Z0-9<]{35,}/g) || []);
  for (let i = 0; i <= normalized.length - 44; i += 44) {
    const line = normalized.slice(i, i + 44);
    if (line.length >= 35) lines.add(line);
  }
  for (let start = 0; start < normalized.length; start++) {
    for (let size = 35; size <= 44 && start + size <= normalized.length; size++) {
      const candidate = normalized.slice(start, start + size);
      if (mrzLinePassportType(candidate)) lines.add(candidate);
    }
  }
  return [...lines];
}

function mrzLineValidationScore(text) {
  if (!text || text.length < 20) return 0;
  const fillerCount = (text.match(/</g) || []).length;
  const type = mrzLinePassportType(text);

  if (text.includes("<<")) return 650;
  if (type === "td3-line1") return 520;
  if (type === "td3-line2") return 520;
  if (fillerCount >= 3 && /[A-Z0-9]{4,}/.test(text)) return 240;
  return 0;
}

function mrzLinePassportType(text) {
  const line = String(text || "");
  const passportLine1 = /^P[A-Z<][A-Z0-9<]{3}[A-Z0-9<]{20,}$/.test(line);
  if (passportLine1) return "td3-line1";

  const passportLine2 = /^[A-Z0-9<]{9}[0-9<][A-Z0-9]{3}[0-9OQDILTZSBG]{6}[0-9<][MF<][0-9OQDILTZSBG]{6}[0-9<][A-Z0-9<]*$/.test(line);
  if (passportLine2 && line.length >= 35) return "td3-line2";

  return "";
}

function smoothArray(values, radius) {
  return values.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const current = index + offset;
      if (current >= 0 && current < values.length) {
        total += values[current];
        count++;
      }
    }
    return total / Math.max(1, count);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Nao foi possivel abrir ${file.name}`));
    };
    img.src = url;
  });
}

function clampPixelRoi(roi, img) {
  const x = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(roi.x)));
  const y = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(roi.y)));
  const w = Math.max(8, Math.min(img.naturalWidth - x, Math.round(roi.w)));
  const h = Math.max(8, Math.min(img.naturalHeight - y, Math.round(roi.h)));
  return { x, y, w, h };
}

function roiLabel(roi, testCase) {
  const img = document.querySelector(`article[data-id="${testCase.id}"] .case-preview img`);
  const width = img?.naturalWidth || 1;
  const height = img?.naturalHeight || 1;
  const pct = {
    x: Math.round((roi.x / width) * 1000) / 10,
    y: Math.round((roi.y / height) * 1000) / 10,
    w: Math.round((roi.w / width) * 1000) / 10,
    h: Math.round((roi.h / height) * 1000) / 10
  };
  return `x=${pct.x}%, y=${pct.y}%, w=${pct.w}%, h=${pct.h}%`;
}

function ratingKey(testCase, methodId) {
  return `${testCase.file.name}:${testCase.file.size}:${testCase.file.lastModified}:${methodId}`;
}

function loadRatings() {
  try {
    return JSON.parse(localStorage.getItem(ROI_RATING_KEY) || "{}");
  } catch {
    return {};
  }
}

function loadRating(testCase, methodId) {
  return loadRatings()[ratingKey(testCase, methodId)] || null;
}

function saveRating(testCase, methodId, rating) {
  const ratings = loadRatings();
  ratings[ratingKey(testCase, methodId)] = rating;
  localStorage.setItem(ROI_RATING_KEY, JSON.stringify(ratings));
}

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

function formatPercent(value) {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function clampIndex(index, length) {
  return Math.min(length - 1, Math.max(0, index));
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}
