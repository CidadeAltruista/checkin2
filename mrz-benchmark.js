const state = {
  cases: [],
  workers: new Map(),
  running: false
};

const ROI_STORAGE_KEY = "mrzBenchmarkRois.v1";
const ENSEMBLE_PIPELINE_ID = "ensemble-consensus";
const ICAO_COUNTRY_CODES = window.countries ? new Set(window.countries.map(country => String(country["alpha-3"] || "").toUpperCase())) : new Set([
  "AGO", "ALB", "AND", "ARE", "ARG", "ARM", "AUS", "AUT", "AZE", "BEL", "BGR", "BIH", "BLR", "BRA",
  "CAN", "CHE", "CHL", "CHN", "COL", "CRI", "CYP", "CZE", "DEU", "DNK", "DOM", "DZA", "ECU", "ESP",
  "EST", "FIN", "FRA", "GBR", "GRC", "HRV", "HUN", "IDN", "IND", "IRL", "ISL", "ISR", "ITA", "JPN",
  "KOR", "LTU", "LUX", "LVA", "MAR", "MEX", "MLT", "NLD", "NOR", "NZL", "PER", "POL", "PRT", "ROU",
  "RUS", "SVK", "SVN", "SWE", "TUR", "UKR", "URY", "USA", "VEN", "ZAF"
]);

const pipelines = [
  {
    id: "ocrb-manual-shadow-local",
    name: "Experimental sombras: OCR-B/MRZ + fundo local",
    description: "Compensa sombras largas por subtracao de fundo local; melhor metodo base nos testes atuais.",
    roi: "manual",
    defaultChecked: true,
    optional: true,
    worker: "custom",
    heuristic: "classic",
    filters: { grayscale: true, shadowNormalize: 19, contrast: 1.35, threshold: null, sharpen: 0.35, denoise: 0 }
  },
  {
    id: "ocrb-manual-shadow-local-soft",
    name: "Experimental sombras: OCR-B/MRZ + fundo local suave",
    description: "Normalizacao de sombras mais leve, para nao lavar caracteres finos.",
    roi: "manual",
    defaultChecked: true,
    optional: true,
    worker: "custom",
    heuristic: "classic",
    filters: { grayscale: true, shadowNormalize: 27, contrast: 1.18, threshold: null, sharpen: 0.3, denoise: 0 }
  },
  {
    id: "ocrb-manual-strong",
    name: "OCR-B/MRZ: ROI manual + contraste forte",
    description: "Contraste 1.75 e nitidez 0.45. Bom fallback quando o fundo local lava caracteres.",
    roi: "manual",
    defaultChecked: true,
    optional: true,
    worker: "custom",
    heuristic: "classic",
    filters: { grayscale: true, contrast: 1.75, threshold: null, sharpen: 0.45, denoise: 0 }
  },
  {
    id: "ocrb-manual-shadow-gamma",
    name: "Experimental sombras: OCR-B/MRZ + gama suave",
    description: "Levanta sombras com gama antes do contraste, sem threshold duro.",
    roi: "manual",
    defaultChecked: true,
    optional: true,
    worker: "custom",
    heuristic: "classic",
    filters: { grayscale: true, gamma: 0.72, contrast: 1.35, threshold: null, sharpen: 0.45, denoise: 0 }
  }
];

document.addEventListener("DOMContentLoaded", initBenchmark);

function initBenchmark() {
  renderPipelines();
  document.getElementById("image-input").addEventListener("change", onImagesSelected);
  document.getElementById("truth-file").addEventListener("change", onTruthFileSelected);
  document.getElementById("apply-truth").addEventListener("click", applyGlobalTruth);
  document.getElementById("export-rois").addEventListener("click", exportRois);
  document.getElementById("import-rois").addEventListener("click", () => document.getElementById("roi-file").click());
  document.getElementById("roi-file").addEventListener("change", importRois);
  document.getElementById("reset-rois").addEventListener("click", resetSavedRois);
  document.getElementById("clear-all").addEventListener("click", clearAll);
  document.getElementById("run-all").addEventListener("click", runAll);
}

function renderPipelines() {
  const list = document.getElementById("pipeline-list");
  list.innerHTML = pipelines.map(pipeline => `
    <label class="pipeline-option${pipeline.optional ? " optional" : ""}">
      <input type="checkbox" value="${pipeline.id}" ${pipeline.defaultChecked ? "checked" : ""}>
      <span><strong>${pipeline.name}</strong><br>${pipeline.description}</span>
    </label>
  `).join("");
  document.getElementById("pipeline-count").textContent = `${pipelines.length} estrategias, ${pipelines.filter(item => item.defaultChecked).length} ativas por defeito`;
}

function onImagesSelected(event) {
  const files = [...event.target.files];
  for (const file of files) addCase(file);
  event.target.value = "";
  renderCases();
}

function addCase(file) {
  const url = URL.createObjectURL(file);
  state.cases.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    file,
    url,
    roi: loadSavedRoi(file) || { x: 3, y: 58, w: 94, h: 32 },
    truth: "",
    results: []
  });
}

function loadSavedRois() {
  try {
    return JSON.parse(localStorage.getItem(ROI_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveRois(rois) {
  localStorage.setItem(ROI_STORAGE_KEY, JSON.stringify(rois));
}

function loadSavedRoi(file) {
  const rois = loadSavedRois();
  const roi = rois[fileRoiKey(file)];
  return roi ? clampRoi(roi) : null;
}

function saveCaseRoi(testCase) {
  const rois = loadSavedRois();
  rois[fileRoiKey(testCase.file)] = clampRoi(testCase.roi);
  saveRois(rois);
}

function exportRois() {
  const rois = loadSavedRois();
  const blob = new Blob([JSON.stringify(rois, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mrz-rois.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importRois(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const imported = JSON.parse(await file.text());
    const rois = loadSavedRois();
    for (const [name, roi] of Object.entries(imported)) {
      const target = findCaseForTruthBlock(name);
      rois[target ? fileRoiKey(target.file) : normalizeFileKey(name)] = clampRoi(roi);
    }
    saveRois(rois);
    for (const testCase of state.cases) {
      const saved = loadSavedRoi(testCase.file);
      if (saved) testCase.roi = saved;
    }
    renderCases();
    setStatus("ROIs importados.");
  } catch (error) {
    alert(`JSON de ROIs invalido: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function resetSavedRois() {
  localStorage.removeItem(ROI_STORAGE_KEY);
  setStatus("ROIs gravados removidos.");
}

async function onTruthFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".json")) {
    applyTruthJson(text);
  } else {
    document.getElementById("global-truth").value = text;
  }
  event.target.value = "";
  renderCases();
}

function applyTruthJson(text) {
  try {
    const data = JSON.parse(text);
    const entries = Array.isArray(data)
      ? data.map(item => [item.file || item.name || item.filename, item.mrz || item.truth || item.text])
      : Object.entries(data);

    for (const [name, truth] of entries) {
      const match = findCaseForTruthBlock(name);
      if (match) {
        match.truth = normalizeMrzText(truth);
        refreshCaseMetrics(match);
      }
    }
  } catch (error) {
    alert(`JSON invalido: ${error.message}`);
  }
}

function applyGlobalTruth() {
  const input = document.getElementById("global-truth").value;
  const blocks = parseTruthBlocks(input);

  if (blocks.length) {
    const { applied, unmatched } = applyTruthBlocks(blocks);
    const suffix = unmatched.length ? ` Nao encontrados: ${unmatched.join(", ")}.` : "";
    renderCases();
    setStatus(`${applied} ground truth aplicado(s).${suffix}`);
    return;
  }

  const truth = normalizeMrzText(input);
  if (!truth) return;

  const target = state.cases.find(testCase => !testCase.truth) || state.cases[0];
  if (target) {
    target.truth = truth;
    refreshCaseMetrics(target);
    renderCases();
  }
}

function parseTruthBlocks(text) {
  const blocks = [];
  const lines = String(text || "").split(/\r?\n/);
  let currentName = "";
  let currentLines = [];

  function flush() {
    const truth = normalizeMrzText(currentLines.join("\n"));
    if (currentName && truth && !looksLikeMrzLine(currentName)) {
      blocks.push({ name: currentName.trim(), truth });
    }
    currentName = "";
    currentLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }

    if (!currentName) {
      currentName = line;
    } else {
      currentLines.push(line);
    }
  }

  flush();
  return blocks;
}

function looksLikeMrzLine(line) {
  const normalized = normalizeMrzText(line).replace(/\n/g, "");
  return normalized.includes("<") && normalized.length >= 20;
}

function applyTruthBlocks(blocks) {
  let applied = 0;
  const unmatched = [];

  for (const block of blocks) {
    const target = findCaseForTruthBlock(block.name);
    if (target) {
      target.truth = block.truth;
      refreshCaseMetrics(target);
      applied++;
    } else {
      unmatched.push(block.name);
    }
  }

  return { applied, unmatched };
}

function findCaseForTruthBlock(name) {
  const key = normalizeFileKey(name);
  if (!key) return null;

  const exact = state.cases.find(testCase => normalizeFileKey(testCase.file.name) === key);
  if (exact) return exact;

  if (key.length < 4) return null;

  return state.cases.find(testCase => normalizeFileKey(testCase.file.name).includes(key));
}

function fileBaseName(name) {
  return String(name || "").replace(/\.[^.]+$/, "");
}

function normalizeFileKey(name) {
  return fileBaseName(name).trim().toLowerCase();
}

function fileRoiKey(file) {
  const name = normalizeFileKey(file?.name);
  const size = Number(file?.size) || 0;
  const modified = Number(file?.lastModified) || 0;
  return `${name}:${size}:${modified}`;
}

function clearAll() {
  for (const testCase of state.cases) URL.revokeObjectURL(testCase.url);
  state.cases = [];
  document.getElementById("global-truth").value = "";
  setStatus("Sem imagens carregadas.");
  renderCases();
}

function renderCases() {
  const container = document.getElementById("cases");
  renderSummary();
  container.innerHTML = state.cases.map(testCase => `
    <article class="case-card" data-id="${testCase.id}">
      <div class="case-top">
        <div class="case-preview">
          <img src="${testCase.url}" alt="${escapeHtml(testCase.file.name)}">
          <div class="case-roi-box" style="${roiBoxStyle(testCase.roi)}"></div>
        </div>
        <div class="case-meta">
          <h3>${escapeHtml(testCase.file.name)}</h3>
          <div class="case-roi-controls">
            <label>↑↓ Topo <input type="range" data-roi="${testCase.id}" data-roi-field="y" min="0" max="90" value="${testCase.roi.y}"></label>
            <label>←→ Esquerda <input type="range" data-roi="${testCase.id}" data-roi-field="x" min="0" max="40" value="${testCase.roi.x}"></label>
            <label>Altura <input type="range" data-roi="${testCase.id}" data-roi-field="h" min="8" max="55" value="${testCase.roi.h}"></label>
            <label>Largura <input type="range" data-roi="${testCase.id}" data-roi-field="w" min="45" max="100" value="${testCase.roi.w}"></label>
          </div>
          <div class="field">
            <label>Ground truth MRZ</label>
            <textarea data-truth="${testCase.id}" rows="5" placeholder="Cole a MRZ real desta imagem">${escapeHtml(testCase.truth)}</textarea>
          </div>
        </div>
      </div>
      <div class="case-results">${renderResults(testCase)}</div>
    </article>
  `).join("");

  container.querySelectorAll("[data-truth]").forEach(textarea => {
    textarea.addEventListener("input", () => {
      const testCase = state.cases.find(item => item.id === textarea.dataset.truth);
      if (testCase) {
        testCase.truth = normalizeMrzText(textarea.value);
        refreshCaseMetrics(testCase);
        renderSummary();
      }
    });
  });

  container.querySelectorAll("[data-roi]").forEach(input => {
    input.addEventListener("input", () => {
      const testCase = state.cases.find(item => item.id === input.dataset.roi);
      if (!testCase) return;
      testCase.roi[input.dataset.roiField] = Number(input.value);
      testCase.roi = clampRoi(testCase.roi);
      saveCaseRoi(testCase);
      const card = input.closest(".case-card");
      const box = card?.querySelector(".case-roi-box");
      if (box) box.setAttribute("style", roiBoxStyle(testCase.roi));
      if (testCase.results.length) {
        testCase.results = [];
        const results = card?.querySelector(".case-results");
        if (results) results.innerHTML = `<p class="muted">ROI alterada. Executa novamente para gerar novos excertos.</p>`;
        renderSummary();
      }
    });
  });

  setStatus(state.cases.length ? `${state.cases.length} imagem(ns) carregada(s).` : "Sem imagens carregadas.");
}

function renderSummary() {
  const container = document.getElementById("summary-table");
  const counter = document.getElementById("summary-count");
  if (!container || !counter) return;

  const rows = buildSummaryRows();
  counter.textContent = rows.length
    ? `${rows.length} metodos comparados em ${countCasesWithResults()} imagens`
    : "Sem resultados.";

  if (!rows.length) {
    container.innerHTML = `<p class="muted">Executa o benchmark para ver o ranking agregado.</p>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Metodo</th>
          <th>Imagens</th>
          <th>CER heur.</th>
          <th>CER bruto</th>
          <th>Melhora</th>
          <th>Piorou</th>
          <th>Checksum OK</th>
          <th>Levenshtein</th>
          <th>Tempo medio</th>
          <th>Vitorias</th>
          <th>Perfeitas</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.pipelineName)}</td>
            <td>${row.count}</td>
            <td>${formatPercent(row.avgCer)}</td>
            <td>${formatPercent(row.avgRawCer)}</td>
            <td>${formatSignedPercent(row.avgImprovement)}</td>
            <td>${row.worse}</td>
            <td>${row.checksumOk}/${row.count}</td>
            <td>${formatNumber(row.avgDistance)}</td>
            <td>${Math.round(row.avgMs)} ms</td>
            <td>${row.wins}</td>
            <td>${row.exact}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function buildSummaryRows() {
  const stats = new Map();

  for (const testCase of state.cases) {
    const comparable = testCase.results.filter(result => testCase.truth);
    if (!comparable.length) continue;

    const best = [...comparable].sort(compareResults)[0];

    for (const result of comparable) {
      if (!stats.has(result.pipelineId)) {
        stats.set(result.pipelineId, {
          pipelineId: result.pipelineId,
          pipelineName: result.pipelineName,
          count: 0,
          cer: 0,
          rawCer: 0,
          improvement: 0,
          distance: 0,
          ms: 0,
          wins: 0,
          worse: 0,
          checksumOk: 0,
          exact: 0
        });
      }

      const row = stats.get(result.pipelineId);
      row.count++;
      row.cer += result.cer;
      row.rawCer += result.rawCer;
      row.improvement += result.rawCer - result.cer;
      row.distance += result.distance;
      row.ms += result.ms;
      if (result === best) row.wins++;
      if (result.cer > result.rawCer) row.worse++;
      if (result.trust.checksOk) row.checksumOk++;
      if (result.distance === 0) row.exact++;
    }
  }

  return [...stats.values()]
    .map(row => ({
      ...row,
      avgCer: row.cer / row.count,
      avgRawCer: row.rawCer / row.count,
      avgImprovement: row.improvement / row.count,
      avgDistance: row.distance / row.count,
      avgMs: row.ms / row.count
    }))
    .sort((a, b) =>
      a.avgCer - b.avgCer ||
      a.avgDistance - b.avgDistance ||
      b.exact - a.exact ||
      b.wins - a.wins ||
      a.avgMs - b.avgMs
    );
}

function countCasesWithResults() {
  return state.cases.filter(testCase => testCase.truth && testCase.results.length).length;
}

function roiBoxStyle(roi) {
  const safe = clampRoi(roi);
  return `left:${safe.x}%;top:${safe.y}%;width:${safe.w}%;height:${safe.h}%`;
}

function clampRoi(roi) {
  const x = Math.max(0, Math.min(95, Number(roi.x) || 0));
  const y = Math.max(0, Math.min(95, Number(roi.y) || 0));
  return {
    x,
    y,
    w: Math.max(5, Math.min(100 - x, Number(roi.w) || 5)),
    h: Math.max(5, Math.min(100 - y, Number(roi.h) || 5))
  };
}

function renderResults(testCase) {
  if (!testCase.results.length) {
    return `<p class="muted">Ainda sem resultados.</p>`;
  }

  return testCase.results.map(result => `
    <section class="result-row${result.error ? " result-error" : ""}">
      <div class="result-head">
        <strong>${escapeHtml(result.pipelineName)}</strong>
        <span class="metric">CER heur. <strong>${formatPercent(result.cer)}</strong></span>
        <span class="metric">CER bruto <strong>${formatPercent(result.rawCer)}</strong></span>
        <span class="metric">Melhora <strong>${formatSignedPercent(result.rawCer - result.cer)}</strong></span>
        <span class="metric">Conf. <strong>${result.trust.label}</strong></span>
        <span class="metric">Levenshtein <strong>${result.distance}</strong></span>
        <span class="metric">Tempo <strong>${result.ms} ms</strong></span>
      </div>
      ${result.error ? `<div class="error-box">${escapeHtml(result.error)}</div>` : ""}
      <div class="result-body">
        <div>
          <label>OCR bruto</label>
          <pre>${escapeHtml(result.rawNormalized || "(vazio)")}</pre>
        </div>
        <div>
          <label>Apos heuristicas</label>
          <pre>${escapeHtml(result.text || "(vazio)")}</pre>
        </div>
      </div>
      <div class="result-body">
        <div>
          <label>Diff vs ground truth</label>
          <pre class="diff">${result.diffHtml || "Sem ground truth."}</pre>
        </div>
      </div>
      <div class="debug-images">
        ${result.debug.map(item => `
          <figure class="debug-shot">
            <img src="${item.url}" alt="${escapeHtml(item.label)}">
            <figcaption>${escapeHtml(item.label)}</figcaption>
          </figure>
        `).join("")}
      </div>
    </section>
  `).join("");
}

async function runAll() {
  if (state.running || !state.cases.length) return;

  const selected = getSelectedPipelines();
  if (!selected.length) {
    alert("Seleciona pelo menos uma pipeline.");
    return;
  }

  state.running = true;
  document.getElementById("run-all").disabled = true;
  setStatus("A carregar OCR...");

  try {
    for (const [caseIndex, testCase] of state.cases.entries()) {
      testCase.results = [];
      renderCases();

      for (const [pipelineIndex, pipeline] of selected.entries()) {
        setStatus(`Imagem ${caseIndex + 1}/${state.cases.length}: ${pipeline.name} (${pipelineIndex + 1}/${selected.length})`);
        let result;
        try {
          const worker = await getWorker(pipeline);
          result = await runPipeline(worker, testCase, pipeline);
        } catch (error) {
          result = buildPipelineErrorResult(testCase, pipeline, error);
        }
        testCase.results.push(result);
        sortResults(testCase);
        renderCases();
      }
      addEnsembleResult(testCase);
      sortResults(testCase);
      renderCases();
    }
    setStatus("Benchmark concluido.");
  } catch (error) {
    console.error(error);
    setStatus(`Erro: ${error.message}`);
  } finally {
    state.running = false;
    document.getElementById("run-all").disabled = false;
  }
}

function getSelectedPipelines() {
  const selectedIds = [...document.querySelectorAll("#pipeline-list input:checked")].map(input => input.value);
  return pipelines.filter(pipeline => selectedIds.includes(pipeline.id));
}

async function getWorker(pipeline = {}) {
  await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");

  const config = getWorkerConfig(pipeline);
  const key = `${config.lang}|${config.langPath || ""}`;
  if (state.workers.has(key)) return state.workers.get(key);

  setStatus(`A carregar OCR ${config.lang}${config.langPath ? ` em ${config.langPath}` : ""}...`);
  const options = config.langPath
    ? { langPath: config.langPath, gzip: config.gzip, cacheMethod: "refresh" }
    : undefined;
  const worker = await withTimeout(
    Tesseract.createWorker(config.lang, 1, options),
    config.timeoutMs,
    `Timeout ao carregar modelo OCR ${config.lang}.`
  );
  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
    tessedit_pageseg_mode: "6",
    user_defined_dpi: "300",
    preserve_interword_spaces: "1"
  });
  state.workers.set(key, worker);
  return worker;
}

function getWorkerConfig(pipeline = {}) {
  if (pipeline.worker === "builtin") return { lang: "eng", langPath: "", timeoutMs: 60000, gzip: true };

  const lang = document.getElementById("custom-lang")?.value.trim() || "ocrb";
  const langPath = document.getElementById("custom-lang-path")?.value.trim() || "./tessdata";
  const timeoutSeconds = Number(document.getElementById("custom-timeout")?.value) || 25;
  return { lang, langPath, timeoutMs: Math.max(5000, timeoutSeconds * 1000), gzip: false };
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

async function runPipeline(worker, testCase, pipeline) {
  const started = performance.now();
  const prepared = await prepareImage(testCase, pipeline);
  const config = getWorkerConfig(pipeline);
  const ocr = await withTimeout(
    worker.recognize(prepared.blob),
    config.timeoutMs,
    `Timeout OCR em ${pipeline.name}.`
  );
  const rawText = ocr?.data?.text || "";
  const rawNormalized = normalizeMrzText(rawText);
  const heuristicText = applyMrzHeuristics(rawNormalized, pipeline.heuristic);
  const text = choosePostProcessedMrz(rawNormalized, heuristicText);
  const metrics = calculateResultMetrics(testCase.truth, text, rawNormalized);

  return {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    text,
    rawText,
    rawNormalized,
    ...metrics,
    ms: Math.round(performance.now() - started),
    debug: prepared.debug
  };
}

function buildPipelineErrorResult(testCase, pipeline, error) {
  const metrics = calculateResultMetrics(testCase.truth, "", "");
  return {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    text: "",
    rawText: "",
    rawNormalized: "",
    ...metrics,
    ms: 0,
    error: error?.message || String(error),
    debug: []
  };
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function refreshCaseMetrics(testCase) {
  for (const result of testCase.results) {
    Object.assign(result, calculateResultMetrics(testCase.truth, result.text, result.rawNormalized));
  }
  sortResults(testCase);
}

function calculateResultMetrics(truthInput, text, rawNormalized) {
  const truth = normalizeMrzText(truthInput);
  const distance = truth ? levenshtein(text, truth) : 0;
  const cer = truth ? distance / Math.max(1, truth.length) : 0;
  const rawDistance = truth ? levenshtein(rawNormalized, truth) : 0;
  const rawCer = truth ? rawDistance / Math.max(1, truth.length) : 0;

  return {
    rawDistance,
    rawCer,
    distance,
    cer,
    trust: calculateMrzTrust(text),
    diffHtml: truth ? diffHtml(truth, text) : ""
  };
}

function addEnsembleResult(testCase) {
  const sourceResults = testCase.results.filter(result => result.pipelineId !== ENSEMBLE_PIPELINE_ID && !result.error);
  if (sourceResults.length < 2) return;

  const started = performance.now();
  const selected = chooseTrustedEnsembleResult(sourceResults);
  const rawNormalized = selected?.rawNormalized || buildWeightedConsensusMrz(sourceResults) || sourceResults[0].rawNormalized;
  const text = selected?.text || (rawNormalized ? applyMrzChecksumHeuristics(rawNormalized) : "");
  if (!text) return;

  const metrics = calculateResultMetrics(testCase.truth, text, rawNormalized);
  testCase.results.push({
    pipelineId: ENSEMBLE_PIPELINE_ID,
    pipelineName: "Ensemble: seletivo por confianca",
    text,
    rawText: rawNormalized,
    rawNormalized,
    ...metrics,
    ms: Math.round(performance.now() - started),
    debug: []
  });
}

function chooseTrustedEnsembleResult(results) {
  const trusted = results
    .map(result => ({ result, text: normalizeMrzText(result.text), trust: calculateMrzTrust(result.text) }))
    .filter(item => item.text && item.trust.checksOk && item.trust.countryOk);

  if (!trusted.length) return null;

  const grouped = new Map();
  for (const item of trusted) {
    if (!grouped.has(item.text)) grouped.set(item.text, []);
    grouped.get(item.text).push(item);
  }

  const [text, items] = [...grouped.entries()]
    .sort((a, b) => trustedGroupScore(b[1]) - trustedGroupScore(a[1]))[0];
  const best = [...items].sort((a, b) => pipelineWeight(b.result.pipelineId) - pipelineWeight(a.result.pipelineId))[0].result;
  return { text, rawNormalized: best.rawNormalized || text };
}

function trustedGroupScore(items) {
  return items.length * 100 + sum(items.map(item => pipelineWeight(item.result.pipelineId)));
}

function buildWeightedConsensusMrz(results) {
  const candidates = results
    .map(result => ({ result, candidate: normalizeCandidateMrz(result.rawNormalized) }))
    .filter(item => item.candidate);
  if (candidates.length < 2) return candidates[0]?.candidate.text || "";

  const groups = candidates.reduce((map, item) => {
    const key = `${item.candidate.format}:${item.candidate.size}:${item.candidate.count}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());

  const group = [...groups.values()]
    .sort((a, b) => sum(b.map(weightedCandidateScore)) - sum(a.map(weightedCandidateScore)))[0];
  if (!group?.length) return "";

  const size = group[0].candidate.size;
  const count = group[0].candidate.count;
  const lines = [];
  for (let lineIndex = 0; lineIndex < count; lineIndex++) {
    let line = "";
    for (let charIndex = 0; charIndex < size; charIndex++) {
      line += voteWeightedMrzChar(group, lineIndex, charIndex);
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function weightedCandidateScore(item) {
  return pipelineWeight(item.result.pipelineId) + (item.candidate.valid ? 6 : 0);
}

function voteWeightedMrzChar(items, lineIndex, charIndex) {
  const votes = new Map();
  for (const item of items) {
    const char = item.candidate.lines[lineIndex][charIndex] || "<";
    const weight = weightedCandidateScore(item);
    votes.set(char, (votes.get(char) || 0) + weight);
  }

  return [...votes.entries()]
    .sort((a, b) => b[1] - a[1] || mrzCharPreference(a[0]) - mrzCharPreference(b[0]))[0][0];
}

function pipelineWeight(pipelineId) {
  const weights = {
    "ocrb-manual-shadow-local": 12,
    "ocrb-manual-shadow-local-soft": 10,
    "ocrb-manual-strong": 7,
    "ocrb-manual-shadow-gamma": 6
  };
  return weights[pipelineId] || 1;
}

function buildConsensusMrz(texts, applyHeuristic) {
  const candidates = texts
    .map(text => normalizeCandidateMrz(text))
    .filter(Boolean);
  if (candidates.length < 2) {
    const text = candidates[0]?.text || "";
    return applyHeuristic && text ? applyMrzChecksumHeuristics(text) : text;
  }

  const groups = candidates.reduce((map, candidate) => {
    const key = `${candidate.format}:${candidate.size}:${candidate.count}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(candidate);
    return map;
  }, new Map());

  const group = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  if (!group?.length) return "";

  const size = group[0].size;
  const count = group[0].count;
  const lines = [];
  for (let lineIndex = 0; lineIndex < count; lineIndex++) {
    let line = "";
    for (let charIndex = 0; charIndex < size; charIndex++) {
      line += voteMrzChar(group, lineIndex, charIndex);
    }
    lines.push(line);
  }

  const consensus = lines.join("\n");
  return applyHeuristic ? applyMrzChecksumHeuristics(consensus) : consensus;
}

function normalizeCandidateMrz(text) {
  const lines = normalizeMrzText(text).split(/\n/).filter(Boolean);
  const shaped = shapeMrzLines(lines);
  if (shaped.length === 3 && shaped.every(line => line.length === 30)) {
    return { text: shaped.join("\n"), lines: shaped, format: "TD1", size: 30, count: 3, valid: validTd1Lines(shaped) };
  }
  if (shaped.length === 2 && shaped.every(line => line.length === 44)) {
    return { text: shaped.join("\n"), lines: shaped, format: "TD3", size: 44, count: 2, valid: validTd3Lines(shaped) };
  }
  return null;
}

function voteMrzChar(candidates, lineIndex, charIndex) {
  const votes = new Map();
  for (const candidate of candidates) {
    const char = candidate.lines[lineIndex][charIndex] || "<";
    const weight = candidate.valid ? 3 : 1;
    votes.set(char, (votes.get(char) || 0) + weight);
  }

  return [...votes.entries()]
    .sort((a, b) => b[1] - a[1] || mrzCharPreference(a[0]) - mrzCharPreference(b[0]))[0][0];
}

function mrzCharPreference(char) {
  if (char === "<") return 0;
  if (/[0-9]/.test(char)) return 1;
  return 2;
}

function calculateMrzTrust(text) {
  const candidate = normalizeCandidateMrz(text);
  if (!candidate) return { score: 0, label: "sem formato", checksOk: false };

  const checksOk = candidate.valid;
  const countryOk = candidate.format === "TD1"
    ? isLikelyCountryCode(candidate.lines[0].slice(2, 5)) && isLikelyCountryCode(candidate.lines[1].slice(15, 18))
    : isLikelyCountryCode(candidate.lines[0].slice(2, 5)) && isLikelyCountryCode(candidate.lines[1].slice(10, 13));
  const score = (checksOk ? 100 : 0) + (countryOk ? 20 : 0);
  return {
    score,
    checksOk,
    countryOk,
    label: `${checksOk ? "checks OK" : "checks falham"}${countryOk ? "" : ", pais?"}`
  };
}

function sortResults(testCase) {
  testCase.results.sort(compareResults);
}

function compareResults(a, b) {
  if (a.error && !b.error) return 1;
  if (!a.error && b.error) return -1;
  return b.trust.score - a.trust.score || a.cer - b.cer || a.distance - b.distance || a.ms - b.ms;
}

async function prepareImage(testCase, pipeline) {
  const img = await loadImage(testCase.file);
  const roi = await getRoi(img, pipeline.roi, testCase);
  const canvas = document.createElement("canvas");
  const scale = Math.min(3, Math.max(1, 2200 / roi.w));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = Math.round(roi.w * scale);
  canvas.height = Math.round(roi.h * scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, roi.x, roi.y, roi.w, roi.h, 0, 0, canvas.width, canvas.height);

  const originalUrl = canvas.toDataURL("image/png");
  applyFilters(canvas, pipeline.filters);
  const processedUrl = canvas.toDataURL("image/png");
  const blob = await canvasToBlob(canvas, "image/png", 0.95);

  return {
    blob,
    debug: [
      { label: roiDebugLabel(pipeline.roi, roi, img), url: originalUrl },
      { label: "Processado", url: processedUrl }
    ]
  };
}

function roiDebugLabel(mode, roi, img) {
  const pct = {
    x: Math.round((roi.x / img.naturalWidth) * 1000) / 10,
    y: Math.round((roi.y / img.naturalHeight) * 1000) / 10,
    w: Math.round((roi.w / img.naturalWidth) * 1000) / 10,
    h: Math.round((roi.h / img.naturalHeight) * 1000) / 10
  };
  return `ROI ${mode}: x=${pct.x}%, y=${pct.y}%, w=${pct.w}%, h=${pct.h}%`;
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

async function getRoi(img, mode, testCase) {
  if (mode === "full") {
    return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  }

  if (mode === "manual") {
    const roi = clampRoi(testCase?.roi || { x: 3, y: 58, w: 94, h: 32 });
    return {
      x: Math.round(img.naturalWidth * roi.x / 100),
      y: Math.round(img.naturalHeight * roi.y / 100),
      w: Math.round(img.naturalWidth * roi.w / 100),
      h: Math.round(img.naturalHeight * roi.h / 100)
    };
  }

  if (mode === "lower") {
    return {
      x: Math.round(img.naturalWidth * 0.03),
      y: Math.round(img.naturalHeight * 0.58),
      w: Math.round(img.naturalWidth * 0.94),
      h: Math.round(img.naturalHeight * 0.36)
    };
  }

  return detectMrzRoi(img) || {
    x: Math.round(img.naturalWidth * 0.03),
    y: Math.round(img.naturalHeight * 0.55),
    w: Math.round(img.naturalWidth * 0.94),
    h: Math.round(img.naturalHeight * 0.40)
  };
}

function detectMrzRoi(img) {
  const width = 900;
  const height = Math.max(1, Math.round(img.naturalHeight * width / img.naturalWidth));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const scores = new Array(height).fill(0);
  const minY = Math.floor(height * 0.42);
  const maxY = Math.floor(height * 0.95);
  const minX = Math.floor(width * 0.02);
  const maxX = Math.floor(width * 0.98);

  for (let y = minY; y < maxY; y++) {
    let dark = 0;
    for (let x = minX; x < maxX; x += 2) {
      const i = (y * width + x) * 4;
      const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
      if (gray < 125) dark++;
    }
    scores[y] = dark;
  }

  const smoothed = scores.map((_, y) => {
    let total = 0;
    let count = 0;
    for (let dy = -4; dy <= 4; dy++) {
      const yy = y + dy;
      if (yy >= 0 && yy < height) {
        total += scores[yy];
        count++;
      }
    }
    return total / Math.max(1, count);
  });

  const threshold = Math.max(...smoothed.slice(minY, maxY)) * 0.33;
  const bands = [];
  let start = -1;

  for (let y = minY; y < maxY; y++) {
    if (smoothed[y] > threshold && start < 0) start = y;
    if ((smoothed[y] <= threshold || y === maxY - 1) && start >= 0) {
      const end = y;
      if (end - start >= 3) {
        bands.push({ start, end, center: (start + end) / 2, score: sum(smoothed.slice(start, end + 1)) });
      }
      start = -1;
    }
  }

  const group = chooseMrzBands(bands);
  if (!group) return null;

  const y0Px = Math.max(0, Math.round(group.start - height * 0.045));
  const y1Px = Math.min(height - 1, Math.round(group.end + height * 0.05));
  const xBounds = detectMrzXBounds(pixels, width, y0Px, y1Px);
  const y0 = y0Px / height;
  const y1 = y1Px / height;
  return {
    x: Math.round(img.naturalWidth * xBounds.x),
    y: Math.round(img.naturalHeight * y0),
    w: Math.round(img.naturalWidth * xBounds.w),
    h: Math.round(img.naturalHeight * Math.max(0.14, y1 - y0))
  };
}

function detectMrzXBounds(pixels, width, y0, y1) {
  const scores = new Array(width).fill(0);
  const height = Math.max(1, y1 - y0 + 1);

  for (let x = 0; x < width; x++) {
    let dark = 0;
    for (let y = y0; y <= y1; y += 2) {
      const i = (y * width + x) * 4;
      const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
      if (gray < 135) dark++;
    }
    scores[x] = dark / Math.ceil(height / 2);
  }

  const smooth = scores.map((_, x) => {
    let total = 0;
    let count = 0;
    for (let dx = -5; dx <= 5; dx++) {
      const xx = x + dx;
      if (xx >= 0 && xx < width) {
        total += scores[xx];
        count++;
      }
    }
    return total / Math.max(1, count);
  });

  const threshold = Math.max(...smooth) * 0.18;
  let left = smooth.findIndex(value => value > threshold);
  let right = smooth.length - 1 - [...smooth].reverse().findIndex(value => value > threshold);

  if (left < 0 || right <= left) {
    return { x: 0.03, w: 0.94 };
  }

  left = Math.max(0, left - Math.round(width * 0.035));
  right = Math.min(width - 1, right + Math.round(width * 0.035));
  return {
    x: left / width,
    w: Math.max(0.45, (right - left + 1) / width)
  };
}

function chooseMrzBands(bands) {
  const candidates = bands
    .filter(band => band.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .sort((a, b) => a.center - b.center);

  let best = null;
  for (let size of [3, 2]) {
    for (let i = 0; i <= candidates.length - size; i++) {
      const group = candidates.slice(i, i + size);
      const span = group[group.length - 1].center - group[0].center;
      const score = sum(group.map(item => item.score)) + group[group.length - 1].center * 0.4 - Math.abs(span - 70) * 3;
      if (!best || score > best.score) {
        best = { start: group[0].start, end: group[group.length - 1].end, score };
      }
    }
    if (best) return best;
  }
  return null;
}

function applyFilters(canvas, filters) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const gray = new Float32Array(canvas.width * canvas.height);

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const gammaValue = filters.gamma ? 255 * ((value / 255) ** filters.gamma) : value;
    gray[i / 4] = gammaValue;
  }

  if (filters.shadowNormalize) normalizeShadows(gray, canvas.width, canvas.height, filters.shadowNormalize);
  applyContrast(gray, filters.contrast || 1);
  if (filters.denoise) median3(gray, canvas.width, canvas.height);
  if (filters.sharpen) sharpen(gray, canvas.width, canvas.height, filters.sharpen);

  const threshold = filters.threshold === "otsu" ? otsu(gray) : filters.threshold;
  for (let i = 0; i < data.length; i += 4) {
    const value = threshold === null ? gray[i / 4] : (gray[i / 4] > threshold ? 255 : 0);
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);
}

function applyContrast(gray, contrast) {
  for (let i = 0; i < gray.length; i++) {
    gray[i] = clamp((gray[i] - 128) * contrast + 128);
  }
}

function normalizeShadows(gray, width, height, radius) {
  const background = boxBlurGray(gray, width, height, Math.max(3, Math.round(radius)));
  for (let i = 0; i < gray.length; i++) {
    gray[i] = clamp((gray[i] / Math.max(24, background[i])) * 215);
  }
}

function boxBlurGray(src, width, height, radius) {
  const horizontal = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const window = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[y * width + clampIndex(x, width)];
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = sum / window;
      sum += src[y * width + clampIndex(x + radius + 1, width)];
      sum -= src[y * width + clampIndex(x - radius, width)];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += horizontal[clampIndex(y, height) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / window;
      sum += horizontal[clampIndex(y + radius + 1, height) * width + x];
      sum -= horizontal[clampIndex(y - radius, height) * width + x];
    }
  }

  return out;
}

function clampIndex(index, length) {
  return Math.min(length - 1, Math.max(0, index));
}

function median3(gray, width, height) {
  const original = new Float32Array(gray);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const values = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) values.push(original[(y + dy) * width + x + dx]);
      }
      values.sort((a, b) => a - b);
      gray[y * width + x] = values[4];
    }
  }
}

function sharpen(gray, width, height, amount) {
  const original = new Float32Array(gray);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const blur = (
        original[i - width - 1] + original[i - width] + original[i - width + 1] +
        original[i - 1] + original[i] + original[i + 1] +
        original[i + width - 1] + original[i + width] + original[i + width + 1]
      ) / 9;
      gray[i] = clamp(original[i] + (original[i] - blur) * amount);
    }
  }
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

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Falha ao criar imagem processada.")), type, quality);
  });
}

function normalizeMrzText(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/[«‹]/g, "<")
    .split(/\r?\n/)
    .map(line => line.replace(/\s/g, "").replace(/[^A-Z0-9<]/g, ""))
    .filter(line => line.length)
    .join("\n");
}

function applyMrzHeuristics(text, mode = "classic") {
  if (mode === "grammar") return applyMrzGrammarHeuristics(text);
  return applyMrzClassicHeuristics(text);
}

function applyMrzChecksumHeuristics(text) {
  const lines = normalizeMrzText(text).split(/\n/).filter(Boolean);
  const shaped = shapeMrzLines(lines);

  if (shaped.length === 3 && shaped.every(line => line.length === 30)) {
    return repairTd1ChecksumsOnly(shaped).join("\n");
  }

  if (shaped.length === 2 && shaped.every(line => line.length === 44)) {
    return repairTd3ChecksumsOnly(shaped).join("\n");
  }

  return shaped.join("\n");
}

function choosePostProcessedMrz(rawText, heuristicText) {
  const raw = normalizeMrzText(rawText);
  const repaired = normalizeMrzText(heuristicText);
  if (!raw) return repaired;
  if (!repaired) return raw;
  if (raw === repaired) return raw;

  const rawTrust = calculateMrzTrust(raw);
  const repairedTrust = calculateMrzTrust(repaired);

  if (rawTrust.checksOk && rawTrust.countryOk) return raw;
  if (repairedTrust.score > rawTrust.score) return repaired;
  if (rawTrust.score >= repairedTrust.score) return raw;
  return repaired;
}

function applyMrzClassicHeuristics(text) {
  const lines = normalizeMrzText(text).split(/\n/).filter(Boolean);
  const shaped = shapeMrzLines(lines).map(line => repairFillersClassic(line));

  if (shaped.length === 3 && shaped.every(line => line.length === 30)) {
    return repairTd1ClassicByChecksums(shaped).join("\n");
  }

  if (shaped.length === 2 && shaped.every(line => line.length === 44)) {
    return repairTd3ClassicByChecksums(shaped).join("\n");
  }

  return shaped.join("\n");
}

function applyMrzGrammarHeuristics(text) {
  const lines = normalizeMrzText(text).split(/\n/).filter(Boolean);
  const shaped = shapeMrzLines(lines);

  if (shaped.length === 3 && shaped.every(line => line.length === 30)) {
    return repairTd1GrammarByChecksums(shaped).join("\n");
  }

  if (shaped.length === 2 && shaped.every(line => line.length === 44)) {
    return repairTd3GrammarByChecksums(shaped).join("\n");
  }

  return shaped.map(line => repairFillersClassic(line)).join("\n");
}

function shapeMrzLines(lines) {
  const joined = lines.join("");
  if (lines.length === 3) return lines.map(line => fitMrzLength(line, 30));
  if (lines.length === 2 && lines.some(line => line.length > 36)) return lines.map(line => fitMrzLength(line, 44));
  if (joined.length >= 90 && joined.length < 132) return splitFixed(joined, 30, 3);
  if (joined.length >= 88) return splitFixed(joined, 44, 2);
  return lines;
}

function splitFixed(text, size, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(fitMrzLength(text.slice(i * size, (i + 1) * size), size));
  return out;
}

function fitMrzLength(line, size) {
  if (line.length === size) return line;
  if (line.length < size) return line.padEnd(size, "<");
  return line.slice(0, size);
}

function repairFillers(line) {
  return String(line || "")
    .replace(/[KLCI](?=[<KLCI]{3,})/g, "<")
    .replace(/(?<=[<KLCI]{3})[KLCI]/g, "<")
    .replace(/[KLCI]{4,}$/g, match => "<".repeat(match.length));
}

function repairFillersClassic(line) {
  return String(line || "")
    .replace(/[KLCI](?=[<KLCI]{2,})/g, "<")
    .replace(/(?<=[<KLCI]{2})[KLCI]/g, "<")
    .replace(/[KLCI]{4,}$/g, match => "<".repeat(match.length));
}

function repairTd1ClassicByChecksums(lines) {
  let [line1, line2, line3] = lines;
  line1 = repairCountryCodeInLine(line1, 2);
  line2 = repairCountryCodeInLine(line2, 15);
  line1 = repairSegmentByChecksum(line1, 5, 14, 14, "alnum");
  line2 = repairSegmentByChecksum(line2, 0, 6, 6, "numeric");
  line2 = repairSegmentByChecksum(line2, 8, 14, 14, "numeric");
  line2 = repairCompositeTd1(line1, line2);
  line3 = repairNameLineClassic(line3, 30);
  return [line1, line2, line3];
}

function repairTd1ChecksumsOnly(lines) {
  let [line1, line2, line3] = lines;
  line1 = repairSegmentByChecksum(line1, 5, 14, 14, "alnum");
  line2 = repairSegmentByChecksum(line2, 0, 6, 6, "numeric");
  line2 = repairSegmentByChecksum(line2, 8, 14, 14, "numeric");
  line2 = repairCompositeTd1(line1, line2);
  return [line1, line2, line3];
}

function repairTd3ClassicByChecksums(lines) {
  let [line1, line2] = lines;
  line1 = repairCountryCodeInLine(line1, 2);
  line2 = repairCountryCodeInLine(line2, 10);
  line2 = repairCountryCodeInLine(line2, 28);
  line2 = repairSegmentByChecksum(line2, 0, 9, 9, "alnum");
  line2 = repairSegmentByChecksum(line2, 13, 19, 19, "numeric");
  line2 = repairSegmentByChecksum(line2, 21, 27, 27, "numeric");
  line2 = repairCompositeTd3(line2);
  line1 = repairNameLineClassic(line1, 44);
  return [line1, line2];
}

function repairTd3ChecksumsOnly(lines) {
  let [line1, line2] = lines;
  line2 = repairSegmentByChecksum(line2, 0, 9, 9, "alnum");
  line2 = repairSegmentByChecksum(line2, 13, 19, 19, "numeric");
  line2 = repairSegmentByChecksum(line2, 21, 27, 27, "numeric");
  line2 = repairCompositeTd3(line2);
  return [line1, line2];
}

function repairTd1GrammarByChecksums(lines) {
  let [line1, line2, line3] = lines;
  line1 = repairTd1Line1Grammar(line1);
  line2 = repairTd1Line2Grammar(line2);
  line1 = repairSegmentByChecksum(line1, 5, 14, 14, "alnum");
  line2 = repairSegmentByChecksum(line2, 0, 6, 6, "numeric");
  line2 = repairSegmentByChecksum(line2, 8, 14, 14, "numeric");
  line2 = repairCompositeTd1(line1, line2);
  line3 = repairNameLine(line3, 30);
  return [line1, line2, line3];
}

function repairTd3GrammarByChecksums(lines) {
  let [line1, line2] = lines;
  line2 = repairTd3Line2Grammar(line2);
  line2 = repairSegmentByChecksum(line2, 0, 9, 9, "alnum");
  line2 = repairSegmentByChecksum(line2, 13, 19, 19, "numeric");
  line2 = repairSegmentByChecksum(line2, 21, 27, 27, "numeric");
  line2 = repairCompositeTd3(line2);
  line1 = repairNameLine(line1, 44);
  return [line1, line2];
}

function repairTd1Line1Grammar(line) {
  let chars = fitMrzLength(line, 30).split("");
  chars = repairAlphaRange(chars, 2, 5);
  chars = repairCountryCodeRange(chars, 2);
  chars = repairCheckDigitPosition(chars, 14);
  chars = repairFillerSuffix(chars, 15, 30);
  return chars.join("");
}

function repairTd1Line2Grammar(line) {
  let chars = fitMrzLength(line, 30).split("");
  chars = repairNumericRange(chars, 0, 6);
  chars = repairCheckDigitPosition(chars, 6);
  chars = repairSexPosition(chars, 7);
  chars = repairNumericRange(chars, 8, 14);
  chars = repairCheckDigitPosition(chars, 14);
  chars = repairAlphaRange(chars, 15, 18);
  chars = repairCountryCodeRange(chars, 15);
  chars = repairFillerSuffix(chars, 18, 29);
  chars = repairCheckDigitPosition(chars, 29);
  return chars.join("");
}

function repairTd3Line2Grammar(line) {
  let chars = fitMrzLength(line, 44).split("");
  chars = repairCheckDigitPosition(chars, 9);
  chars = repairAlphaRange(chars, 10, 13);
  chars = repairCountryCodeRange(chars, 10);
  chars = repairNumericRange(chars, 13, 19);
  chars = repairCheckDigitPosition(chars, 19);
  chars = repairSexPosition(chars, 20);
  chars = repairNumericRange(chars, 21, 27);
  chars = repairCheckDigitPosition(chars, 27);
  chars = repairAlphaRange(chars, 28, 31);
  chars = repairCountryCodeRange(chars, 28);
  chars = repairCheckDigitPosition(chars, 43);
  return chars.join("");
}

function repairNumericRange(chars, start, end) {
  const out = [...chars];
  const maps = { O: "0", Q: "0", D: "0", I: "1", L: "1", T: "1", Z: "2", S: "5", B: "8", G: "6" };
  for (let i = start; i < end && i < out.length; i++) {
    if (maps[out[i]]) out[i] = maps[out[i]];
  }
  return out;
}

function repairAlphaRange(chars, start, end) {
  const out = [...chars];
  const maps = { "0": "O", "1": "I", "5": "S", "8": "B" };
  for (let i = start; i < end && i < out.length; i++) {
    if (maps[out[i]]) out[i] = maps[out[i]];
  }
  return out;
}

function repairCountryCodeRange(chars, start) {
  const out = [...chars];
  const repaired = nearestCountryCode(out.slice(start, start + 3).join("")).padEnd(3, "<").slice(0, 3);
  for (let i = 0; i < 3; i++) out[start + i] = repaired[i];
  return out;
}

function repairCountryCodeInLine(line, start) {
  const chars = line.split("");
  return repairCountryCodeRange(chars, start).join("");
}

function nearestCountryCode(code) {
  const normalized = String(code || "").replace(/</g, "").split("").map(char => ({ "0": "O", "1": "I", "5": "S", "8": "B" }[char] || char)).join("");
  if (ICAO_COUNTRY_CODES.has(normalized)) return normalized;

  let best = normalized;
  let bestCost = Infinity;
  for (const candidate of ICAO_COUNTRY_CODES) {
    const cost = countryCodeDistance(normalized, candidate);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return bestCost <= 1.2 ? best : normalized;
}

function countryCodeDistance(input, candidate) {
  let cost = 0;
  for (let i = 0; i < 3; i++) {
    if (input[i] === candidate[i]) continue;
    cost += obviousAlphaConfusions(input[i])?.includes(candidate[i]) ? 0.6 : 1;
  }
  return cost;
}

function isLikelyCountryCode(code) {
  const value = String(code || "").replace(/</g, "");
  return ICAO_COUNTRY_CODES.has(value) || nearestCountryCode(value) !== value;
}

function repairCheckDigitPosition(chars, index) {
  const out = [...chars];
  if (out[index] === "O" || out[index] === "Q" || out[index] === "D") out[index] = "0";
  if (out[index] === "I" || out[index] === "L" || out[index] === "T") out[index] = "1";
  if (out[index] === "Z") out[index] = "2";
  if (out[index] === "S") out[index] = "5";
  if (out[index] === "B") out[index] = "8";
  return out;
}

function repairSexPosition(chars, index) {
  const out = [...chars];
  if (out[index] !== "M" && out[index] !== "F" && out[index] !== "<") out[index] = "<";
  return out;
}

function repairFillerRange(chars, start, end) {
  const out = [...chars];
  for (let i = start; i < end && i < out.length; i++) {
    if (/[KLCI]/.test(out[i])) out[i] = "<";
  }
  return out;
}

function repairFillerSuffix(chars, start, end) {
  const out = [...chars];
  let suffixStart = Math.min(end, out.length);
  while (suffixStart > start && /[<KLCI]/.test(out[suffixStart - 1])) suffixStart--;
  if (Math.min(end, out.length) - suffixStart >= 3) {
    return repairFillerRange(out, suffixStart, end);
  }
  return out;
}

function repairNameLine(line, size) {
  const chars = fitMrzLength(line, size).split("");
  return repairNameSeparators(chars).join("");
}

function repairNameLineClassic(line, size) {
  const chars = fitMrzLength(line, size).split("");
  for (let i = 1; i < chars.length - 1; i++) {
    if (chars[i] === "K" && /[A-Z]/.test(chars[i - 1]) && /[A-Z]/.test(chars[i + 1])) {
      chars[i] = "<";
    }
  }
  return repairFillersClassic(chars.join(""));
}

function repairNameSeparators(chars) {
  const out = [...chars];
  for (let i = 0; i < out.length; i++) {
    if (!/[KLCI]/.test(out[i])) continue;
    const left = out[i - 1] || "";
    const right = out[i + 1] || "";
    const nearFiller = left === "<" || right === "<";
    const fillerTail = out.slice(i).every(char => /[<KLCI]/.test(char));
    if (nearFiller || fillerTail) out[i] = "<";
  }
  return out;
}

function repairSegmentByChecksum(line, start, end, checkIndex, type) {
  if (validMrzCheck(line.slice(start, end), line[checkIndex])) return line;

  return solveSegmentByChecksum(line, start, end, checkIndex, type);
}

function solveSegmentByChecksum(line, start, end, checkIndex, type) {
  const options = [];
  for (let i = start; i < end; i++) {
    const replacements = candidateReplacements(line[i], type).filter(value => value !== line[i]);
    if (replacements.length) options.push({ index: i, replacements });
  }

  const oneChange = tryChecksumOptions(line, start, end, checkIndex, options, 1);
  if (oneChange) return oneChange;

  const twoChanges = tryChecksumOptions(line, start, end, checkIndex, options, 2);
  return twoChanges || line;
}

function tryChecksumOptions(line, start, end, checkIndex, options, depth) {
  function visit(offset, remaining, chars) {
    if (remaining === 0) {
      const attempt = chars.join("");
      return validMrzCheck(attempt.slice(start, end), attempt[checkIndex]) ? attempt : null;
    }

    for (let i = offset; i <= options.length - remaining; i++) {
      const option = options[i];
      for (const replacement of option.replacements) {
        const next = [...chars];
        next[option.index] = replacement;
        const result = visit(i + 1, remaining - 1, next);
        if (result) return result;
      }
    }
    return null;
  }

  return visit(0, depth, line.split(""));
}

function candidateReplacements(char, type) {
  if (type === "numeric") return obviousNumericConfusions(char);
  return [...new Set([...obviousNumericConfusions(char), ...obviousAlphaConfusions(char), ...obviousFillerConfusions(char)])];
}

function obviousNumericConfusions(char) {
  const map = {
    O: ["0"], Q: ["0"], D: ["0"],
    I: ["1"], L: ["1"], T: ["1"],
    Z: ["2"], S: ["5"], B: ["8"], G: ["6"],
    "0": ["O"], "1": ["I"], "2": ["Z"], "5": ["S"], "6": ["G"], "8": ["B"]
  };
  return map[char] || [];
}

function obviousAlphaConfusions(char) {
  const map = {
    "0": ["O"], O: ["0"],
    "1": ["I"], I: ["1"],
    "2": ["Z"], Z: ["2"],
    "5": ["S"], S: ["5"],
    "6": ["G"], G: ["6"],
    "8": ["B"], B: ["8"],
    R: ["O"], N: ["R"], T: ["I"]
  };
  return map[char] || [];
}

function obviousFillerConfusions(char) {
  return /[KLCI]/.test(char) ? ["<"] : [];
}

function repairCompositeTd1(line1, line2) {
  const value = line1.slice(5, 30) + line2.slice(0, 7) + line2.slice(8, 15) + line2.slice(18, 29);
  if (validMrzCheck(value, line2[29])) return line2;
  const chars = line2.split("");
  chars[29] = String(mrzCheckDigit(value));
  return chars.join("");
}

function repairCompositeTd3(line2) {
  const value = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43);
  if (validMrzCheck(value, line2[43])) return line2;
  const chars = line2.split("");
  chars[43] = String(mrzCheckDigit(value));
  return chars.join("");
}

function validTd1Lines(lines) {
  const [line1, line2] = lines;
  return (
    validTd1DocumentCheck(line1) &&
    validMrzCheck(line2.slice(0, 6), line2[6]) &&
    validMrzCheck(line2.slice(8, 14), line2[14]) &&
    validMrzCheck(line1.slice(5, 30) + line2.slice(0, 7) + line2.slice(8, 15) + line2.slice(18, 29), line2[29])
  );
}

function validTd1DocumentCheck(line1) {
  const number = line1.slice(5, 14);
  const digit = line1[14];
  const optional = line1.slice(15, 30);
  if (validMrzCheck(number, digit) || validMrzCheck(number + optional, digit)) return true;
  if (digit !== "<") return false;

  const fillerStart = optional.indexOf("<");
  if (fillerStart <= 0) return false;

  const extension = optional.slice(0, fillerStart - 1);
  const extensionDigit = optional.charAt(fillerStart - 1);
  return validMrzCheck(`${number}<${extension}`, extensionDigit) || validMrzCheck(`${number}${extension}`, extensionDigit);
}

function validTd3Lines(lines) {
  const [, line2] = lines;
  return (
    validMrzCheck(line2.slice(0, 9), line2[9]) &&
    validMrzCheck(line2.slice(13, 19), line2[19]) &&
    validMrzCheck(line2.slice(21, 27), line2[27]) &&
    validMrzCheck(line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43), line2[43])
  );
}

function validMrzCheck(value, digit) {
  return String(mrzCheckDigit(value)) === String(digit || "");
}

function mrzCheckDigit(value) {
  const weights = [7, 3, 1];
  return String(value || "").split("").reduce((total, char, index) => {
    return total + mrzCharValue(char) * weights[index % 3];
  }, 0) % 10;
}

function mrzCharValue(char) {
  if (char === "<") return 0;
  if (/[0-9]/.test(char)) return Number(char);
  if (/[A-Z]/.test(char)) return char.charCodeAt(0) - 55;
  return 0;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function diffHtml(expected, actual) {
  const dp = Array.from({ length: expected.length + 1 }, () => new Array(actual.length + 1).fill(0));
  for (let i = 0; i <= expected.length; i++) dp[i][0] = i;
  for (let j = 0; j <= actual.length; j++) dp[0][j] = j;

  for (let i = 1; i <= expected.length; i++) {
    for (let j = 1; j <= actual.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1)
      );
    }
  }

  const out = [];
  let i = expected.length;
  let j = actual.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1)) {
      if (expected[i - 1] === actual[j - 1]) {
        out.push(`<span class="ok">${escapeHtml(actual[j - 1])}</span>`);
      } else {
        out.push(`<span class="bad">${escapeHtml(expected[i - 1])}</span><span class="add">${escapeHtml(actual[j - 1])}</span>`);
      }
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      out.push(`<span class="bad">${escapeHtml(expected[i - 1])}</span>`);
      i--;
    } else {
      out.push(`<span class="add">${escapeHtml(actual[j - 1])}</span>`);
      j--;
    }
  }
  return out.reverse().join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPercent(value) {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatSignedPercent(value) {
  const rounded = Math.round(value * 1000) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatNumber(value) {
  return String(Math.round(value * 10) / 10);
}

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}
