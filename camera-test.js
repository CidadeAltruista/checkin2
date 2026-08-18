/* camera-test.js — página de teste:
 *  warp do documento (OpenCV.js) + 4 rotações (0/90/180/270) + leitura MRZ (MrzStage3Reader).
 *  Fica isolado da página de câmara atual. Não altera o fluxo de produção.
 */
(function () {
  "use strict";

  let cvReady = false;
  let stream = null;
  let scanAtivo = false;
  let tentativa = 0;
  let testarStop = false;
  let passos = [];
  const MAX_TENTATIVAS = 5;
  const ANGULOS = [0, 90, 180, 270];

  const $ = id => document.getElementById(id);
  const videoEl = () => $("mrz-video");
  const statusEl = () => $("mrz-status");
  const barEl = () => $("mrz-progress-bar");
  const percentEl = () => $("mrz-progress-percent");
  const progressBox = () => document.querySelector(".scan-progress");
  const laserEl = () => document.querySelector(".mrz-video-wrap .scan-laser");

  /* ---- OpenCV readiness ---- */
  function onOpenCvReady() {
    if (cv && cv.Mat) {
      cvReady = true;
      console.log("[camera-test] OpenCV.js pronto.");
    } else {
      setTimeout(onOpenCvReady, 100);
    }
  }
  window.onOpenCvReady = onOpenCvReady;

  /* ---- UI helpers ---- */
  function setStatus(msg) {
    const el = statusEl();
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }
  function setProgress(p) {
    const v = Math.max(0, Math.min(100, Math.round(Number(p) || 0)));
    if (barEl()) barEl().style.width = v + "%";
    if (percentEl()) percentEl().textContent = v + "%";
  }
  function mostrarProgresso(mostrar) {
    if (progressBox()) progressBox().hidden = !mostrar;
  }
  function mostrarLaser(mostrar) {
    if (laserEl()) laserEl().hidden = !mostrar;
  }
  function mostrarCaptura(canvas) {
    const img = $("mrz-captured");
    if (img && canvas) {
      img.src = canvas.toDataURL("image/png");
      img.hidden = false;
    }
  }
  function atraso(ms) { return new Promise(r => setTimeout(r, ms)); }

  function limparPassos() { passos = []; }
  function logPasso(msg) {
    passos.push(msg);
    console.log("[camera-test] " + msg);
  }

  /* ---- Câmara ---- */
  async function abrirCamera() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    videoEl().srcObject = stream;
    await videoEl().play().catch(() => {});
  }

  function fecharCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    const v = videoEl();
    if (v) { v.srcObject = null; v.hidden = true; }
  }

  async function reabrirCamera() {
    const img = $("mrz-captured");
    if (img) img.hidden = true;
    const v = videoEl();
    if (v) v.hidden = false;
    await abrirCamera();
  }

  function limparMemoria() {
    const img = $("mrz-captured");
    if (img) { img.removeAttribute("src"); img.hidden = true; }
    limparPassos();
  }

  function fecharScan() {
    testarStop = true;
    scanAtivo = false;
    fecharCamera();
    limparMemoria();
    $("mrz-camera").hidden = true;
    $("scan-instructions").hidden = false;
    $("scan-message").hidden = true;
    setStatus(""); mostrarProgresso(false); mostrarLaser(false);
  }
  window.fecharScan = fecharScan;

  async function trocarCamera() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
    if (cams.length < 2) return;
    const atual = stream?.getVideoTracks?.()?.[0]?.getSettings?.()?.deviceId;
    const idx = cams.findIndex(c => c.deviceId === atual);
    const next = cams[(idx + 1) % cams.length];
    stream?.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId } }, audio: false });
    videoEl().srcObject = stream;
    await videoEl().play().catch(() => {});
  }
  window.trocarCamera = trocarCamera;

  function escolherFoto() { $("mrz-file-input").click(); }

  async function iniciarScan() {
    $("scan-instructions").hidden = true;
    $("scan-message").hidden = true;
    $("mrz-camera").hidden = false;
    mostrarLaser(true);
    try {
      await abrirCamera();
    } catch (e) {
      setStatus("Não foi possível aceder à câmera. Usa o upload.");
      return;
    }
    testarStop = false;
    scanAtivo = true;
    tentativa = 0;
    setStatus("A estabilizar câmera...");
    await atraso(3000);
    if (scanAtivo && !testarStop) executarTentativa();
  }
  window.iniciarScan = iniciarScan;

  /* ---- captura de frame ---- */
  function capturarFrameVideo() {
    const v = videoEl();
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0);
    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  }

  /* ---- OpenCV: quadrilátero + warp ---- */
  function detectarQuadrilatero(canvas) {
    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    console.log(`[camera-test] Contornos detetados: ${contours.size()}`);

    const areaTotal = canvas.width * canvas.height;
    let melhor = null;
    let melhorArea = -1;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < areaTotal * 0.30) { cnt.delete(); continue; }
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4 && area > melhorArea) {
        melhorArea = area;
        const pts = [];
        for (let p = 0; p < 4; p++) {
          pts.push({ x: approx.data32S[p * 2], y: approx.data32S[p * 2 + 1] });
        }
        melhor = ordenarCantos(pts);
      }
      approx.delete();
      cnt.delete();
    }

    src.delete(); gray.delete(); blurred.delete(); edges.delete();
    contours.delete(); hierarchy.delete();
    return melhor;
  }

  function ordenarCantos(pts) {
    const sorted = pts.slice();
    sorted.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = sorted.slice(2).sort((a, b) => a.x - b.x);
    return [top[0], top[1], bottom[1], bottom[0]]; // TL, TR, BR, BL
  }

  /* Proporção do documento a partir do quadrilátero detetado (evita distorção retrato/paisagem) */
  function aspectoQuadrilatero(cantos) {
    const d = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const w = Math.max(d(cantos[0], cantos[1]), d(cantos[2], cantos[3])); // topo / base
    const h = Math.max(d(cantos[0], cantos[3]), d(cantos[1], cantos[2])); // esq / dir
    const ratio = w / Math.max(1, h);
    return Math.min(3.0, Math.max(0.5, ratio)); // limita a valores plausíveis
  }

  function warpCanvas(canvas, cantos, aspect) {
    const w = Math.round(Math.min(1600, canvas.width));
    const h = Math.round(w / aspect);
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2,
      [cantos[0].x, cantos[0].y, cantos[1].x, cantos[1].y, cantos[2].x, cantos[2].y, cantos[3].x, cantos[3].y]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2,
      [0, 0, w - 1, 0, w - 1, h - 1, 0, h - 1]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const src = cv.imread(canvas);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(w, h));
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    cv.imshow(out, dst);
    src.delete(); dst.delete(); M.delete(); srcTri.delete(); dstTri.delete();
    return out;
  }

  function rotacionarCanvas(canvas, graus) {
    const w = canvas.width, h = canvas.height;
    const trocar = (graus % 180 !== 0);
    const cw = trocar ? h : w, ch = trocar ? w : h;
    const out = document.createElement("canvas");
    out.width = cw; out.height = ch;
    const ctx = out.getContext("2d");
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(graus * Math.PI / 180);
    ctx.drawImage(canvas, -w / 2, -h / 2);
    return out;
  }

  /* ---- Replicação local de criarCanvasRoiMrz (ROI em pixéis) ---- */
  function criarCanvasRoiMrzLocal(canvas, roi) {
    if (!canvas || !roi) return null;
    const x = Math.max(0, Math.round(roi.x || 0));
    const y = Math.max(0, Math.round(roi.y || 0));
    const width = Math.min(canvas.width - x, Math.max(1, Math.round(roi.w || roi.width || canvas.width)));
    const height = Math.min(canvas.height - y, Math.max(1, Math.round(roi.h || roi.height || canvas.height)));
    const out = document.createElement("canvas");
    const ctx = out.getContext("2d");
    out.width = width;
    out.height = height;
    ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
    return out;
  }

  /* ---- Prepara a imagem base (warp ou original) ---- */
  function prepararBase(canvas) {
    let base = canvas;
    let warpOk = false;
    let aspect = 0;
    let foundCandidate = false;
    if (cvReady) {
      setStatus("A detetar limites do documento...");
      try {
        const cantos = detectarQuadrilatero(canvas);
        if (cantos) {
          aspect = aspectoQuadrilatero(cantos);
          setStatus("Documento encontrado. A endireitar (warp)...");
          base = warpCanvas(canvas, cantos, aspect);
          warpOk = true;
          foundCandidate = true;
          logPasso(`Quadrilátero detetado (aspect=${aspect.toFixed(2)}); aplicado warp.`);
        } else {
          logPasso("Sem quadrilátero confiante nesta frame.");
        }
      } catch (e) {
        console.warn("[camera-test] Warp falhou; fallback para original:", e);
        logPasso("Warp falhou; a usar imagem original.");
      }
    }
    return { base, warpOk, aspect, foundCandidate };
  }

  /* ---- Testa as 4 rotações até encontrar ROI ---- */
  async function testarRotacoes(base, warpOk, origem) {
    let testadas = 0;
    for (const graus of ANGULOS) {
      if (testarStop) return { found: false };
      testadas++;
      const rot = rotacionarCanvas(base, graus);
      const blob = await canvasToBlob(rot);
      blob.name = `${origem}-rota-${graus}.png`;
      console.log(`[camera-test] A testar rotação ${graus}° (${origem})...`);
      let deteccao = null;
      try {
        deteccao = await window.MrzStage3Reader.detectRoi(blob, {
          lang: "ocrb", langPath: "./tessdata",
          roiLang: "ocrb", roiLangPath: "./tessdata",
          roiTimeoutMs: 2000
        });
      } catch (e) {
        console.warn(`[camera-test] detectRoi rotação ${graus}° falhou:`, e);
        deteccao = { found: false };
      }
      if (deteccao && deteccao.found && deteccao.roi) {
        console.log(`[camera-test] >>> ROI encontrada na rotação ${graus}° (warp=${warpOk}, testadas ${testadas}/4)`);
        return { found: true, graus, canvas: rot, deteccao, warpOk, testadas };
      }
    }
    console.log(`[camera-test] ${origem}: sem ROI após ${testadas} rotações.`);
    return { found: false };
  }


  /* ---- Descodificação (Fase 3) ---- */
  function formatarCampos(campos) {
    if (!campos || typeof campos !== "object") return "(sem campos)";
    const linhas = [];
    for (const [k, v] of Object.entries(campos)) {
      if (v && String(v).trim()) linhas.push(`${k}: ${v}`);
    }
    return linhas.length ? linhas.join("\n") : "(sem campos)";
  }

  async function processarLeitura(rot, deteccao, graus, warpOk) {
    scanAtivo = false;
    testarStop = true;
    mostrarLaser(false);
    mostrarCaptura(rot);
    logPasso(`ROI encontrada na rotação ${graus}°.`);
    setStatus("A descodificar...");
    mostrarProgresso(true);
    setProgress(0);

    const roiCanvas = criarCanvasRoiMrzLocal(rot, deteccao.roi);
    if (!roiCanvas) {
      logPasso("Falha ao recortar ROI.");
      setStatus("Falha ao recortar ROI.");
      mostrarProgresso(false);
      return;
    }

    const blob = await canvasToBlob(roiCanvas);
    blob.name = `roi-rot-${graus}.png`;
    try {
      const resultado = await window.MrzStage3Reader.read(blob, {
        lang: "ocrb", langPath: "./tessdata",
        roiLang: "ocrb", roiLangPath: "./tessdata",
        roiTimeoutMs: 8000, timeoutMs: 25000,
        onProgress: p => setProgress((Number(p) || 0) <= 1 ? (Number(p) || 0) * 100 : Number(p) || 0)
      });
      const ok = Boolean(resultado?.ok);
      logPasso(`Leitura Fase 3: ${ok ? "sucesso" : "falhou"}.`);
      console.log(`[camera-test] Resultado (rotação ${graus}°, warp=${warpOk}):`, resultado);
      mostrarProgresso(false);
      if (ok) {
        setStatus("Passos:\n- " + passos.join("\n- ") + "\n\nCampos extraídos:\n" + formatarCampos(resultado.formData || resultado.dados));
      } else {
        setStatus(`Não foi possível ler (rotação ${graus}°).`);
      }
    } catch (e) {
      logPasso("Erro na descodificação.");
      console.warn("[camera-test] read falhou:", e);
      setStatus("Erro na descodificação.");
    }
    mostrarProgresso(false);
  }

  /* ---- Loop de tentativas (câmara) ---- */
  async function executarTentativa() {
    if (!scanAtivo || testarStop) return;

    // se o OpenCV ainda não está pronto, espera (não queima tentativas)
    if (!cvReady) {
      setStatus("A aguardar OpenCV...");
      await atraso(300);
      if (scanAtivo && !testarStop) {
        setTimeout(executarTentativa, 100);
      }
      return;
    }

    tentativa++;
    setStatus(`Tentativa ${tentativa}: a procurar documento...`);
    mostrarProgresso(false);
    mostrarLaser(true);

    let canvas;
    try {
      canvas = capturarFrameVideo();
    } catch (e) {
      console.warn("[camera-test] Sem frame da câmara:", e);
      setStatus("Sem frame da câmara.");
      return;
    }

    const { base, warpOk, foundCandidate } = prepararBase(canvas);

    // há quadrilátero → fecha a câmara e mostra a imagem endireitada
    if (foundCandidate) {
      fecharCamera();
      mostrarLaser(false);
      mostrarCaptura(base);
      setStatus(`Tentativa ${tentativa}: candidato detetado. A testar rotações...`);
    } else {
      // sem quadrilátero → fallback: testa a imagem original, mantém a câmara aberta
      setStatus(`Tentativa ${tentativa}: sem quadrilátero (fallback). A testar rotações...`);
    }
    mostrarProgresso(false);

    const res = await testarRotacoes(base, warpOk, "camera");
    if (testarStop) return;

    if (res.found) {
      await processarLeitura(res.canvas, res.deteccao, res.graus, res.warpOk);
      return;
    }

    logPasso(`Tentativa ${tentativa}: sem MRZ nas 4 rotações.`);
    setStatus(`Tentativa ${tentativa}: sem resultado. A voltar à câmara...`);

    // se a câmara tinha sido fechada (candidato), reabre
    if (foundCandidate) {
      await reabrirCamera();
      await atraso(1000); // estabilização curta após reabrir
    } else {
      await atraso(400);
    }

    if (scanAtivo && !testarStop) {
      if (tentativa < MAX_TENTATIVAS) {
        executarTentativa();
      } else {
        setStatus("Documento não encontrado.");
        mostrarLaser(false);
      }
    }
  }

  /* ---- Upload de foto ---- */
  $("mrz-file-input").addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      limparPassos();
      testarStop = false;
      scanAtivo = false;
      $("scan-instructions").hidden = true;
      $("mrz-camera").hidden = false;
      mostrarLaser(false);
      setStatus("A processar imagem...");

      const { base, warpOk } = prepararBase(canvas);
      mostrarCaptura(base);
      setStatus("A testar rotações...");
      const res = await testarRotacoes(base, warpOk, "upload");
      if (testarStop) return;

      if (res.found) {
        await processarLeitura(res.canvas, res.deteccao, res.graus, res.warpOk);
      } else {
        logPasso("Upload: sem MRZ nas 4 rotações.");
        setStatus("Sem zona detetada nas 4 rotações.");
        mostrarLaser(false);
      }
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  });
})();

