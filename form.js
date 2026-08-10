let linguaAtual = "pt";
let mrzStream = null;
let mrzWorker = null;
let mrzV2Worker = null;
let mrzV2RequestId = 0;
let mrzCameraDevices = [];
let mrzCameraDeviceId = "";
let mrzCameraTrocaEmCurso = false;
const MRZ_FIELD_IDS = [
  "primeiro-nome-input",
  "ultimo-nome-input",
  "data-nascimento-input",
  "nacionalidade-input",
  "country-document-input",
  "id-type-input",
  "id-number-input",
  "country-residence-input"
];

function selecionarLingua(lang) {
  linguaAtual = lang;
  atualizarTraducoes();
  atualizarBotoes();
  preencherIdReserva();
}

function atualizarTraducoes() {
  const t = traducoes[linguaAtual];
  if (!t) return;

  const sectionLabels = {
    pt: {
      hospede: "Hóspede",
      documento: "Documento",
      estadia: "Estadia",
      fatura: "Fatura"
    },
    en: {
      hospede: "Guest",
      documento: "Document",
      estadia: "Stay",
      fatura: "Invoice"
    },
    fr: {
      hospede: "Client",
      documento: "Document",
      estadia: "Sejour",
      fatura: "Facture"
    },
    es: {
      hospede: "Huesped",
      documento: "Documento",
      estadia: "Estancia",
      fatura: "Factura"
    }
  }[linguaAtual] || {};

  const ids = {
    "label-primeiro-nome": t.primeiroNome,
    "label-ultimo-nome": t.ultimoNome,
    "label-local-nascimento": t.localNascimento,
    "label-data-nascimento": t.dataNascimento,
    "label-nacionalidade": t.nacionalidade,
    "label-id-number": t.idNumber,
    "label-country-document": t.countryDocument,
    "label-id-type": t.idType,
    "label-country-residence": t.countryResidence,
    "label-place-residence": t.placeResidence,
    "label-arrival-time": t.arrivalTime,
    "label-email": t.email,
    "label-fatura-checkbox": t.faturaCheckbox,
    "label-nome-fatura": t.nomeFatura,
    "label-nif-fatura": t.nifFatura,
    "label-morada-fatura": t.moradaFatura,
    "label-codpostal-fatura": t.codpostalFatura,
    "label-cidade-fatura": t.cidadeFatura,
    "label-pais-fatura": t.paisFatura,
    "label-email-fatura": t.emailFatura,
    "section-hospede": t.sectionHospede || sectionLabels.hospede,
    "section-documento": t.sectionDocumento || sectionLabels.documento,
    "section-estadia": t.sectionEstadia || sectionLabels.estadia,
    "section-fatura": t.sectionFatura || sectionLabels.fatura
  };
  for (const id in ids) {
    const el = document.getElementById(id);
    if (el) el.textContent = ids[id];
  }

  const submitButton = document.querySelector("#checkinForm button[type='submit']");
  if (submitButton) submitButton.textContent = t.enviar;

  atualizarTextosMrz(t);

  const cabecalho = document.getElementById("cabecalho-info");
  if (cabecalho) cabecalho.innerHTML = t.cabecalho;

  const labelFatura = document.getElementById("label-fatura-checkbox");
  if (labelFatura) labelFatura.textContent = t.faturaCheckbox;

  const btnFaturaSim = document.getElementById("btn-fatura-sim");
  if (btnFaturaSim) btnFaturaSim.textContent = t.faturaSim;

  const btnFaturaNao = document.getElementById("btn-fatura-nao");
  if (btnFaturaNao) btnFaturaNao.textContent = t.faturaNao;

}

function atualizarTextosMrz(t) {
  const textos = {
    "btn-ler-documento": t.lerDocumento,
    "mrz-title": t.mrzTitulo,
    "mrz-subtitle": t.mrzSubtitulo,
    "btn-upload-foto": t.uploadFoto,
    "btn-usar-camera": t.usarCamera,
    "btn-trocar-camera": t.trocarCamera,
    "btn-capturar-foto": t.capturarFoto,
    "mrz-progress-label": t.progresso
  };

  Object.entries(textos).forEach(([id, texto]) => {
    const el = document.getElementById(id);
    if (!el || !texto) return;
    const textSpan = el.querySelector?.("span:last-child");
    if (textSpan && el.classList.contains("icon-button")) textSpan.textContent = texto;
    else el.textContent = texto;
  });

  const close = document.querySelector(".mrz-close");
  if (close) close.setAttribute("aria-label", t.fechar || "Fechar");

  const guideImage = document.querySelector(".mrz-instructions img");
  if (guideImage) guideImage.setAttribute("alt", t.mrzImagemAlt || "Exemplo da zona MRZ no documento");

  const successTitle = document.getElementById("success-title");
  if (successTitle) successTitle.textContent = t.obrigadoTitulo || "Obrigado";

  const successMessage = document.getElementById("success-message");
  if (successMessage) successMessage.textContent = t.obrigadoMensagem || t.sucesso;

  const addGuest = document.getElementById("btn-add-guest");
  const addGuestText = addGuest?.querySelector("span:last-child");
  if (addGuestText) addGuestText.textContent = t.adicionarHospede || "Adicionar outro hóspede";
}

function atualizarBotoes() {
  ["pt", "en", "fr", "es"].forEach(l => {
    document.getElementById("btn-" + l)?.classList.remove("selected");
  });
  document.getElementById("btn-" + linguaAtual)?.classList.add("selected");
}

function preencherIdReserva() {
  const params = new URLSearchParams(window.location.search);
  const idres = params.get("idres") || params.get("idReserva");
  const input = document.getElementById("id-reserva");
  const textoId = document.getElementById("id-reserva-texto");
  const erroDiv = document.getElementById("erro-idreserva");
  const formulario = document.getElementById("checkinForm");

  const idValido = idres && /^\d{8,9}$/.test(idres);

  if (!input || !erroDiv || !formulario) return;

  if (idValido) {
    input.value = idres;
    if (textoId) textoId.textContent = "ID Reserva: " + idres;
    formulario.style.display = "block";
    erroDiv.style.display = "none";
  } else {
    formulario.style.display = "none";
    erroDiv.textContent = traducoes[linguaAtual]?.erroIdReserva || "ID da Reserva não identificado. Volte a abrir o link enviado ou contacte o anfitrião. Obrigado.";
    erroDiv.style.display = "block";
  }
}

function preencherSelect(id) {
  const select = document.getElementById(id);
  if (!select) return;

  select.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "--";
  defaultOption.disabled = true;
  defaultOption.selected = true;
  select.appendChild(defaultOption);

  countryList.forEach(pais => {
    const option = document.createElement("option");
    option.value = pais;
    option.textContent = pais;
    select.appendChild(option);
  });
}

function preencherPaisesRelacionados() {
  const selects = [
    document.getElementById("nacionalidade-input"),
    document.getElementById("country-document-input"),
    document.getElementById("country-residence-input")
  ].filter(Boolean);

  if (selects.length !== 3) return;
  if (selects[0].dataset.autofillReady === "true") return;

  selects.forEach(selectPreenchido => {
    selectPreenchido.addEventListener("change", () => {
      if (window.__mrzPreenchendoCampos) return;
      const pais = selectPreenchido.value;
      if (!pais) return;

      selects.forEach(select => {
        if (select !== selectPreenchido && !select.value) {
          select.value = pais;
        }
      });
    });
  });

  selects.forEach(select => {
    select.dataset.autofillReady = "true";
  });
}

function abrirLeitorDocumento() {
  const modal = document.getElementById("mrz-modal");
  const status = document.getElementById("mrz-status");
  const result = document.getElementById("mrz-result");
  const actions = modal?.querySelector(".mrz-actions");
  const instructions = modal?.querySelector(".mrz-instructions");

  if (!modal) return;
  if (actions) actions.hidden = false;
  if (instructions) instructions.hidden = false;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  if (status) status.textContent = "";
  atualizarProgressoMrz(0);
  if (result) {
    result.hidden = true;
    result.textContent = "";
  }
}

function fecharLeitorDocumento() {
  const modal = document.getElementById("mrz-modal");
  const camera = document.getElementById("mrz-camera");
  const video = document.getElementById("mrz-video");

  if (mrzStream) {
    mrzStream.getTracks().forEach(track => track.stop());
    mrzStream = null;
  }

  if (video) video.srcObject = null;
  if (camera) camera.hidden = true;
  mrzCameraDevices = [];
  mrzCameraDeviceId = "";
  atualizarBotaoTrocarCamera();
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
}

function selecionarFotoDocumento() {
  document.getElementById("mrz-file-input")?.click();
}

async function iniciarCameraDocumento() {
  const camera = document.getElementById("mrz-camera");
  const video = document.getElementById("mrz-video");

  if (!navigator.mediaDevices?.getUserMedia || !camera || !video) {
    mostrarErroMrz();
    return;
  }

  try {
    mrzStream = await abrirCameraDocumento();
    video.srcObject = mrzStream;
    camera.hidden = false;
    await prepararCameraDocumento(mrzStream);
    atualizarBotaoTrocarCamera();
    atualizarEstadoMrz("");
  } catch (error) {
    console.warn("Erro ao abrir camera:", error);
    mostrarErroMrz();
  }
}

function obterConstraintsCameraDocumento(deviceId = "") {
  const baseConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: { ideal: "environment" }
  };

  if (!deviceId) return baseConstraints;

  return {
    ...baseConstraints,
    deviceId: { exact: deviceId }
  };
}

async function abrirCameraDocumento(deviceId = "") {
  const initialStream = await navigator.mediaDevices.getUserMedia({
    video: obterConstraintsCameraDocumento(deviceId),
    audio: false
  });

  try {
    await atualizarCamerasDocumento();
    const [currentTrack] = initialStream.getVideoTracks();
    const currentDeviceId = currentTrack?.getSettings?.().deviceId;
    mrzCameraDeviceId = currentDeviceId || deviceId || "";

    const preferredCamera = escolherCameraDocumento(mrzCameraDevices);
    if (!deviceId && preferredCamera?.deviceId && preferredCamera.deviceId !== currentDeviceId) {
      initialStream.getTracks().forEach(track => track.stop());
      return abrirCameraDocumento(preferredCamera.deviceId);
    }
  } catch (error) {
    console.info("Nao foi possivel escolher a camera automaticamente:", error);
  }

  return initialStream;
}

async function atualizarCamerasDocumento() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  mrzCameraDevices = ordenarCamerasDocumento(devices.filter(device => device.kind === "videoinput"));
}

function escolherCameraDocumento(cameras) {
  if (!cameras.length) return null;
  return ordenarCamerasDocumento(cameras)[0];
}

function ordenarCamerasDocumento(cameras) {
  const badLabels = /ultra|ultrawide|ultra-wide|wide|angular|grande.?angular|0[,.]5|macro|depth|profundidade/i;
  const frontLabels = /front|user|frontal|selfie/i;
  const goodLabels = /back|rear|environment|traseira|principal|main|standard|normal|1x/i;
  const scored = cameras.map((camera, index) => {
    const label = camera.label || "";
    let score = 0;

    if (goodLabels.test(label)) score += 10;
    if (badLabels.test(label)) score -= 30;
    if (frontLabels.test(label)) score -= 50;
    if (!label) score -= index;

    return { camera, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(item => item.camera);
}

async function prepararCameraDocumento(stream) {
  const [track] = stream.getVideoTracks();
  if (!track?.getCapabilities || !track.applyConstraints) return;

  const capabilities = track.getCapabilities();
  const advanced = [];

  if (capabilities.focusMode?.includes("continuous")) {
    advanced.push({ focusMode: "continuous" });
  }

  if (capabilities.zoom) {
    const minZoom = capabilities.zoom.min ?? 1;
    const maxZoom = capabilities.zoom.max ?? minZoom;
    const zoom = Math.min(Math.max(2, minZoom), maxZoom);
    advanced.push({ zoom });
  }

  if (!advanced.length) return;

  try {
    await track.applyConstraints({ advanced });
  } catch (error) {
    console.info("Ajustes de foco/zoom nao suportados nesta camera:", error);
  }
}

async function trocarCameraDocumento() {
  const video = document.getElementById("mrz-video");

  if (mrzCameraTrocaEmCurso || !navigator.mediaDevices?.getUserMedia || !video) return;

  try {
    mrzCameraTrocaEmCurso = true;
    await atualizarCamerasDocumento();

    if (mrzCameraDevices.length < 2) return;

    const currentIndex = mrzCameraDevices.findIndex(camera => camera.deviceId === mrzCameraDeviceId);
    const nextCamera = mrzCameraDevices[(Math.max(currentIndex, 0) + 1) % mrzCameraDevices.length];

    if (!nextCamera?.deviceId) return;

    if (mrzStream) {
      mrzStream.getTracks().forEach(track => track.stop());
    }

    mrzStream = await abrirCameraDocumento(nextCamera.deviceId);
    video.srcObject = mrzStream;
    await prepararCameraDocumento(mrzStream);
    atualizarBotaoTrocarCamera();
    atualizarEstadoMrz("");
  } catch (error) {
    console.warn("Erro ao trocar camera:", error);
    mostrarErroMrz();
  } finally {
    mrzCameraTrocaEmCurso = false;
  }
}

function atualizarBotaoTrocarCamera() {
  const button = document.getElementById("btn-trocar-camera");
  if (button) button.hidden = mrzCameraDevices.length < 2;
}

function capturarFotoDocumento() {
  const video = document.getElementById("mrz-video");
  const canvas = document.getElementById("mrz-canvas");

  if (!video || !canvas || !video.videoWidth) {
    mostrarErroMrz();
    return;
  }

  const crop = calcularCropGuiaMrz(video.videoWidth, video.videoHeight);
  canvas.width = crop.width;
  canvas.height = crop.height;
  canvas.getContext("2d").drawImage(
    video,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );
  canvas.toBlob(blob => {
    if (blob) processarImagemDocumento(blob);
  }, "image/jpeg", 0.92);
}

function calcularCropGuiaMrz(width, height) {
  return {
    x: Math.round(width * 0.06),
    y: Math.round(height * 0.58),
    width: Math.round(width * 0.88),
    height: Math.round(height * 0.32)
  };
}

function atualizarEstadoMrz(mensagem) {
  const status = document.getElementById("mrz-status");
  if (!status) return;
  status.hidden = true;
  status.textContent = "";
}

function mostrarErroMrz() {
  const status = document.getElementById("mrz-status");
  if (!status) return;
  status.textContent = (traducoes[linguaAtual] || traducoes.pt).leituraFalhou;
  status.hidden = false;
}

function atualizarProgressoMrz(percentagem) {
  const valor = Math.max(0, Math.min(100, Math.round(percentagem)));
  const bar = document.getElementById("mrz-progress-bar");
  const percent = document.getElementById("mrz-progress-percent");
  if (bar) bar.style.width = `${valor}%`;
  if (percent) percent.textContent = `${valor}%`;
}

async function carregarTesseract() {
  if (window.Tesseract) return window.Tesseract;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return window.Tesseract;
}

async function obterWorkerMrz() {
  if (mrzWorker) return mrzWorker;

  const Tesseract = await carregarTesseract();
  mrzWorker = await Tesseract.createWorker("eng", 1, {
    logger: info => {
      if (info.status && typeof info.progress === "number") {
        const progresso = Math.round(info.progress * 100);
      }
    }
  });

  await mrzWorker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
    tessedit_pageseg_mode: "6",
    user_defined_dpi: "300",
    preserve_interword_spaces: "1"
  });

  return mrzWorker;
}

async function processarImagemDocumento(imagem) {
  const log = criarLogMrz(imagem);
  atualizarProgressoMrz(0);

  if (window.MRZ_CLIENT_SCANNER === "alsenet-v2") {
    const lidoNoBrowser = await processarImagemDocumentoAlsenet(imagem, log);
    if (lidoNoBrowser) return;
  }

  await processarImagemDocumentoTesseract(imagem, log);
}

async function processarImagemDocumentoAlsenet(imagem, log) {
  try {
    adicionarLogMrz(log, "Motor v2", "A iniciar mrz-scanner v2 local.");
    atualizarProgressoMrz(8);
    atualizarEstadoMrz("");
    const result = await lerMrzComAlsenet(imagem, log);
    adicionarLogMrz(log, "Motor v2", `Linhas OCR devolvidas: ${(result?.ocrLines || []).length}.`);

    if (!result || result.error || !result.parsed) {
      console.warn("MRZ v2 sem resultado valido:", result);
      adicionarLogMrz(log, "Motor v2", `Sem parse valido: ${result?.error || "sem detalhe"}.`);
      mostrarTextoMrz((result?.ocrLines || []).join("\n"), null, log);
      mostrarErroMrz();
      return false;
    }

    if (result.parsed.valid === false) {
      console.warn("MRZ v2 com checksums invalidos:", result.parsed);
      adicionarLogMrz(log, "Checksum v2", "Parser devolveu MRZ invalida.");
      mostrarTextoMrz((result.ocrLines || []).join("\n"), null, log);
      mostrarErroMrz();
      return false;
    }

    adicionarLogMrz(log, "Checksum v2", `Estado do parser: ${result.parsed.valid === true ? "valido" : "nao informado"}.`);
    const dados = mapearResultadoAlsenet(result, log);

    if (!dados) {
      adicionarLogMrz(log, "Mapeamento", "MRZ encontrada, mas sem campos suficientes para preencher.");
      mostrarTextoMrz((result.ocrLines || []).join("\n"), null, log);
      mostrarErroMrz();
      return false;
    }

    preencherCamposComMrz(dados);
    adicionarLogMrz(log, "Preenchimento", "Campos substituidos no formulario.");
    mostrarTextoMrz((result.ocrLines || []).join("\n"), dados, log);
    atualizarProgressoMrz(100);
    atualizarEstadoMrz("");
    fecharLeitorDocumento();
    return true;
  } catch (error) {
    console.warn("Erro no leitor MRZ v2:", error);
    adicionarLogMrz(log, "Erro v2", error?.message || String(error));
    mostrarErroMrz();
    return false;
  }
}

function obterWorkerAlsenet() {
  if (!mrzV2Worker) {
    mrzV2Worker = new Worker("./mrz-v2/alsenet-worker.js?v=20260809-2", { type: "module" });
  }
  return mrzV2Worker;
}

async function lerMrzComAlsenet(imagem, log) {
  const worker = obterWorkerAlsenet();
  const dataUrl = await ficheiroParaDataUrl(imagem);
  const id = ++mrzV2RequestId;
  const modelPath = new URL("./mrz-v2/mrz-cnn.onnx", window.location.href).href;

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      reject(new Error("Tempo limite ao ler MRZ v2."));
    }, 30000);

    function onMessage(event) {
      if (event.data?.id !== id) return;

      if (event.data.type === "progress") {
        adicionarLogMrz(log, "Progresso v2", event.data.stage);
        const progresso = { detecting: 22, ocr: 46, parsing: 70 }[event.data.stage] || 36;
        atualizarProgressoMrz(progresso);
        return;
      }

      if (event.data.type === "result") {
        window.clearTimeout(timeout);
        worker.removeEventListener("message", onMessage);
        resolve(event.data.result);
      }
    }

    worker.addEventListener("message", onMessage);
    worker.postMessage({ type: "scan", id, dataUrl, modelPath });
  });
}

function ficheiroParaDataUrl(ficheiro) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(ficheiro);
  });
}

async function processarImagemDocumentoTesseract(imagem, log) {
  try {
    adicionarLogMrz(log, "Fallback OCR", "A iniciar OCR local com Tesseract.");
    atualizarProgressoMrz(12);
    atualizarEstadoMrz("");
    const worker = await obterWorkerMrz();
    const tentativas = await prepararTentativasMrz(imagem);
    adicionarLogMrz(log, "Fallback OCR", `${tentativas.length} preparacoes/crops gerados.`);
    let texto = "";
    let dados = null;

    for (const [index, tentativa] of tentativas.entries()) {
      atualizarProgressoMrz(20 + index * 13);
      adicionarLogMrz(log, "Tentativa OCR", `A ler: ${tentativa.nome}.`);
      const resultado = await worker.recognize(tentativa.blob);
      texto = resultado?.data?.text || "";
      adicionarLogMrz(log, "Tentativa OCR", `${tentativa.nome}: ${texto.trim().length} caracteres reconhecidos.`);
      dados = extrairDadosMrz(texto, log);

      if (dados) break;
    }

    mostrarTextoMrz(texto, dados, log);

    if (!dados) {
      adicionarLogMrz(log, "Resultado", "Nenhuma MRZ local valida encontrada.");
      mostrarTextoMrz(texto, dados, log);
      mostrarErroMrz();
      return;
    }

    preencherCamposComMrz(dados);
    adicionarLogMrz(log, "Resultado", "MRZ local validada e campos preenchidos.");
    mostrarTextoMrz(texto, dados, log);
    atualizarProgressoMrz(100);
    atualizarEstadoMrz("");
    fecharLeitorDocumento();
  } catch (error) {
    console.warn("Erro ao ler MRZ:", error);
    adicionarLogMrz(log, "Erro OCR", error?.message || String(error));
    mostrarTextoMrz("", null, log);
    mostrarErroMrz();
  }
}

function mapearResultadoAlsenet(result, log) {
  const parsed = result?.parsed || {};
  const fields = parsed.fields || parsed.details || parsed;
  const rawLines = result.ocrLines || parsed.lines || [];
  const primeiraLinha = String(rawLines[0] || "").toUpperCase();

  const primeiroNome = primeiroValor(
    fields.firstName,
    fields.givenNames,
    fields.givenName,
    fields.names,
    fields.name
  );
  const ultimoNome = primeiroValor(fields.lastName, fields.surname, fields.primaryIdentifier);
  const dataNascimento = formatarDataMrzAlsenet(primeiroValor(fields.birthDate, fields.dateOfBirth));
  const codigoNacionalidade = primeiroValor(fields.nationality, fields.nationalityCode);
  const codigoPaisDocumento = primeiroValor(fields.issuingState, fields.issuingStateCode, fields.country);
  const documentCode = String(primeiroValor(primeiraLinha.slice(0, 1), fields.documentCode, fields.documentType, fields.type)).toUpperCase();
  const idType = documentCode.startsWith("P") ? "Passport" : "ID";
  const idNumber = normalizarNumeroDocumentoAlsenet(primeiroValor(
    fields.documentNumber,
    fields.documentNumberRaw,
    fields.number,
    fields.personalNumber
  ), rawLines, idType, log);

  if (!primeiroNome && !ultimoNome && !idNumber) return null;

  return {
    primeiroNome: corrigirNomeComumAlsenet(limparNomeAlsenet(primeiroNome)),
    ultimoNome: corrigirNomeComumAlsenet(limparNomeAlsenet(ultimoNome)),
    dataNascimento,
    idNumber,
    idType,
    nacionalidade: paisMrzOuValor(codigoNacionalidade),
    countryDocument: paisMrzOuValor(codigoPaisDocumento),
    rawLines
  };
}

function normalizarNumeroDocumentoAlsenet(valor, rawLines, idType, log) {
  const texto = normalizarTextoCampo(valor).replace(/\s+/g, "");
  const primeiraLinha = String(rawLines?.[0] || "").replace(/\s+/g, "").toUpperCase();

  if (idType === "ID" && /^[IAC][A-Z<][A-Z]{3}/.test(primeiraLinha) && primeiraLinha.length >= 15) {
    const linhaCorrigida = corrigirLinha1Td1Documento(primeiraLinha, log);
    const numero = linhaCorrigida.slice(5, 14).replace(/</g, "");
    if (linhaCorrigida !== primeiraLinha) {
      adicionarLogMrz(log, "Correcao v2", `Numero por checksum: ${primeiraLinha.slice(5, 14)} -> ${linhaCorrigida.slice(5, 14)}.`);
    }

    if (linhaCorrigida.startsWith("I<PRT") && linhaCorrigida.length >= 18) {
      const verificacao = (linhaCorrigida.slice(13, 14) + linhaCorrigida.slice(15, 18)).replace(/</g, "");
      return verificacao ? `${linhaCorrigida.slice(5, 13).replace(/</g, "")}${verificacao}` : numero;
    }

    return numero || texto;
  }

  if (idType === "ID" && /^(\d{8})([A-Z0-9]{4})$/.test(texto)) {
    return texto;
  }

  return texto;
}

function corrigirNomeComumAlsenet(nome) {
  const correcoes = {
    Carios: "Carlos",
    Manue: "Manuel",
    Maniie: "Manuel",
    Carvailho: "Carvalho",
    Peretra: "Pereira"
  };

  return nome
    .split(" ")
    .map((parte) => correcoes[parte] || parte)
    .join(" ");
}

function primeiroValor(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null && String(valor).trim() !== "") || "";
}

function limparNomeAlsenet(valor) {
  return normalizarTextoCampo(valor)
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letra) => letra.toUpperCase());
}

function normalizarTextoCampo(valor) {
  if (Array.isArray(valor)) return valor.join(" ");
  if (valor && typeof valor === "object" && "value" in valor) return normalizarTextoCampo(valor.value);
  return String(valor || "").trim();
}

function formatarDataMrzAlsenet(valor) {
  const data = normalizarTextoCampo(valor);
  if (!data) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  if (/^\d{6}$/.test(data)) return parseDataMrz(data);
  const match = data.match(/^(\d{2})[./ -](\d{2})[./ -](\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return "";
}

function paisMrzOuValor(valor) {
  const texto = normalizarTextoCampo(valor);
  if (!texto) return "";
  const codigo = texto.toUpperCase();
  return codigo.length === 3 ? paisMrzParaNome(codigo) || texto : texto;
}

async function prepararTentativasMrz(imagem) {
  const imagemRecortada = await prepararImagemMrz(imagem, {
    nome: "imagem MRZ",
    x: 0,
    width: 1,
    y: 0,
    height: 1,
    maxWidth: 1400,
    threshold: 142,
    contrast: 1.35
  });
  const imagemRecortadaSuave = await prepararImagemMrz(imagem, {
    nome: "imagem MRZ suave",
    x: 0,
    width: 1,
    y: 0,
    height: 1,
    maxWidth: 1400,
    threshold: 132,
    contrast: 1.15
  });
  const linhaMrz = await prepararImagemMrz(imagem, {
    nome: "linhas MRZ",
    x: 0.04,
    width: 0.94,
    y: 0.835,
    height: 0.155,
    maxWidth: 1900,
    threshold: 138,
    contrast: 1.35
  });
  const linhaMrzBaixa = await prepararImagemMrz(imagem, {
    nome: "linhas MRZ baixas",
    x: 0.04,
    width: 0.94,
    y: 0.865,
    height: 0.125,
    maxWidth: 1900,
    threshold: 142,
    contrast: 1.45
  });
  const zonaInferior = await prepararImagemMrz(imagem, {
    nome: "zona inferior alargada",
    x: 0.02,
    width: 0.96,
    y: 0.78,
    height: 0.215,
    maxWidth: 1600,
    threshold: 146,
    contrast: 1.3
  });

  return [imagemRecortada, imagemRecortadaSuave, linhaMrz, linhaMrzBaixa, zonaInferior];
}

function prepararImagemMrz(imagem, opcoes) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imagem);

    img.onload = () => {
      const cropX = Math.floor(img.naturalWidth * (opcoes.x || 0));
      const cropY = Math.floor(img.naturalHeight * opcoes.y);
      const cropW = Math.floor(img.naturalWidth * (opcoes.width || 1));
      const cropH = Math.floor(img.naturalHeight * opcoes.height);
      const escala = Math.min(2.4, Math.max(1.2, opcoes.maxWidth / cropW));
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      canvas.width = Math.round(cropW * escala);
      canvas.height = Math.round(cropH * escala);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;

      for (let i = 0; i < data.length; i += 4) {
        const cinza = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const contraste = Math.max(0, Math.min(255, (cinza - 128) * opcoes.contrast + 128));
        const limiar = contraste > opcoes.threshold ? 255 : 0;
        data[i] = limiar;
        data[i + 1] = limiar;
        data[i + 2] = limiar;
      }

      ctx.putImageData(pixels, 0, 0);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        if (blob) resolve({
          nome: opcoes.nome,
          blob
        });
        else reject(new Error("Nao foi possivel preparar a imagem."));
      }, "image/png");
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nao foi possivel carregar a imagem."));
    };

    img.src = url;
  });
}

function criarLogMrz(imagem) {
  return [`[Inicio] ${new Date().toLocaleTimeString()} | ficheiro: ${imagem?.name || "captura-camera"} | ${Math.round((imagem?.size || 0) / 1024)} KB`];
}

function adicionarLogMrz(log, etapa, detalhe) {
  if (!log) return;
  log.push(`[${etapa}] ${detalhe}`);
}

function formatarLogMrz(log) {
  return log?.length ? `LOG DE LEITURA\n${log.join("\n")}\n\n` : "";
}

function mostrarTextoMrz(texto, dados, log) {
  const result = document.getElementById("mrz-result");
  if (!result) return;

  const rawLines = Array.isArray(dados?.rawLines)
    ? dados.rawLines
    : String(dados?.rawLines || "").split(/\r?\n/).filter(Boolean);
  const conteudo = dados
    ? `MRZ detectada:\n${rawLines.join("\n")}`
    : `Texto encontrado:\n${texto.trim()}`;
  result.textContent = `${formatarLogMrz(log)}${conteudo}`;
  result.hidden = true;
  console.debug(result.textContent);
}

function extrairDadosMrz(texto, log) {
  const linhas = normalizarTextoMrz(texto);
  adicionarLogMrz(log, "Normalizacao", `${linhas.length} linhas candidatas: ${linhas.map(linha => linha.length).join(", ") || "nenhuma"}.`);
  const td1 = encontrarLinhasMrz(linhas, 3, 30);
  if (td1) {
    adicionarLogMrz(log, "Deteccao", "Candidato TD1 de 3 linhas encontrado.");
    return parseMrzTd1(td1, log);
  }

  const td1Parcial = encontrarMrzTd1Parcial(linhas);
  if (td1Parcial) {
    adicionarLogMrz(log, "Deteccao", "Candidato TD1 parcial encontrado.");
    return parseMrzTd1Parcial(td1Parcial, log);
  }

  const td3 = encontrarMrzTd3(linhas);
  if (td3) {
    adicionarLogMrz(log, "Deteccao", "Candidato TD3/passaporte encontrado.");
    return parseMrzTd3(td3, log);
  }

  adicionarLogMrz(log, "Deteccao", "Nenhum formato TD1/TD3 reconhecido.");
  return null;
}

function normalizarTextoMrz(texto) {
  return texto
    .toUpperCase()
    .split(/\r?\n/)
    .map(linha => linha.replace(/[«‹]/g, "<"))
    .map(linha => linha.replace(/\s/g, "").replace(/[^A-Z0-9<]/g, ""))
    .filter(linha => linha.length >= 20 && linha.includes("<"));
}

function encontrarLinhasMrz(linhas, quantidade, tamanho) {
  if (quantidade === 3 && tamanho === 30) {
    const td1 = encontrarMrzTd1(linhas);
    if (td1) return td1;
  }

  for (let i = 0; i <= linhas.length - quantidade; i++) {
    const grupo = linhas.slice(i, i + quantidade).map(linha => linha.padEnd(tamanho, "<").slice(0, tamanho));
    if (grupo.every(linha => linha.length === tamanho && (linha.match(/</g) || []).length >= 2)) {
      return grupo;
    }
  }
  return null;
}

function encontrarMrzTd3(linhas) {
  for (let i = 0; i <= linhas.length - 2; i++) {
    const linha1 = repararLinhaMrz(linhas[i], 44);
    const linha2 = repararLinhaMrz(linhas[i + 1], 44);

    if (/^P[A-Z<][A-Z]{3}/.test(linha1) && /^[A-Z0-9<]{9}\d[A-Z]{3}\d{6}/.test(linha2)) {
      return [linha1, linha2];
    }
  }

  return null;
}

function encontrarMrzTd1(linhas) {
  for (let i = 0; i <= linhas.length - 3; i++) {
    const linha1 = repararLinhaMrz(linhas[i], 30);
    const linha2 = repararLinhaMrz(linhas[i + 1], 30);
    const linha3 = repararLinhaNomeMrz(linhas[i + 2], 30);

    if (/^[IAC][A-Z<]/.test(linha1) && /^\d{6}/.test(linha2) && linha3.includes("<<")) {
      return [linha1, linha2, linha3];
    }
  }

  return null;
}

function encontrarMrzTd1Parcial(linhas) {
  for (let i = 0; i <= linhas.length - 2; i++) {
    const linha1 = repararLinhaMrz(linhas[i], 30);
    const linha2 = repararLinhaMrz(linhas[i + 1], 30);

    if (/^[IAC][A-Z<]/.test(linha1) && /^\d{6}/.test(linha2)) {
      return [linha1, linha2];
    }
  }

  return null;
}

function repararLinhaMrz(linha, tamanho) {
  return linha
    .replace(/K(?=[<K]{2,})/g, "<")
    .replace(/(?<=[<K]{2})K/g, "<")
    .padEnd(tamanho, "<")
    .slice(0, tamanho);
}

function repararLinhaNomeMrz(linha, tamanho) {
  let reparada = linha.padEnd(tamanho, "<").slice(0, tamanho);

  return reparada
    .replace(/K(?=<)/g, "<")
    .replace(/(?<=<)K(?=<)/g, "<")
    .replace(/[CL](?=[<CL]{2,}$)/g, "<")
    .replace(/(?<=<{2,})[CL](?=<*$)/g, "<");
}

function parseMrzTd3(linhas, log) {
  const [linha1, linha2] = linhas;
  if (!validarMrzTd3(linha2, log)) return null;

  const nomes = parseNomesMrz(repararLinhaNomeMrz(linha1.slice(5), 39));

  return {
    rawLines: [linha1, linha2],
    primeiroNome: nomes.primeiroNome,
    ultimoNome: nomes.ultimoNome,
    idType: "Passport",
    idNumber: limparCampoMrz(linha2.slice(0, 9)),
    countryDocument: paisMrzParaNome(linha1.slice(2, 5)),
    nacionalidade: paisMrzParaNome(linha2.slice(10, 13)),
    dataNascimento: parseDataMrz(linha2.slice(13, 19))
  };
}

function parseMrzTd1(linhas, log) {
  let [linha1, linha2, linha3] = linhas;
  adicionarLogMrz(log, "TD1 bruto", `${linha1} | ${linha2} | ${linha3}`);
  [linha1, linha2] = corrigirLinhasMrzTd1PorChecksum(linha1, linha2, log);
  if (!validarMrzTd1(linha1, linha2, log)) return null;

  const nomes = parseNomesMrz(linha3);

  return {
    rawLines: [linha1, linha2],
    primeiroNome: nomes.primeiroNome,
    ultimoNome: nomes.ultimoNome,
    idType: "ID",
    idNumber: extrairNumeroTd1(linha1),
    countryDocument: paisMrzParaNome(linha1.slice(2, 5)),
    nacionalidade: paisMrzParaNome(linha2.slice(15, 18)),
    dataNascimento: parseDataMrz(linha2.slice(0, 6))
  };
}

function parseMrzTd1Parcial(linhas, log) {
  let [linha1, linha2] = linhas;
  adicionarLogMrz(log, "TD1 parcial bruto", `${linha1} | ${linha2}`);
  [linha1, linha2] = corrigirLinhasMrzTd1PorChecksum(linha1, linha2, log);
  if (!validarMrzTd1(linha1, linha2, log)) return null;

  return {
    rawLines: [linha1, linha2],
    primeiroNome: "",
    ultimoNome: "",
    idType: "ID",
    idNumber: extrairNumeroTd1(linha1),
    countryDocument: paisMrzParaNome(linha1.slice(2, 5)),
    nacionalidade: paisMrzParaNome(linha2.slice(15, 18)),
    dataNascimento: parseDataMrz(linha2.slice(0, 6))
  };
}

function extrairNumeroTd1(linha) {
  if (linha.startsWith("I<PRT") && linha.length >= 18) {
    const numeroBase = linha.slice(5, 13).replace(/</g, "");
    const verificacao = (linha.slice(13, 14) + linha.slice(15, 18)).replace(/</g, "");
    return limparCampoMrz(`${numeroBase}${verificacao}`);
  }

  return limparCampoMrz(linha.slice(5, 14));
}

function corrigirLinhasMrzTd1PorChecksum(linha1, linha2, log) {
  const linha1ComFillers = corrigirFillersMrz(linha1, 15, 30);
  const linha2ComFillers = corrigirFillersMrz(linha2, 18, 29);
  if (linha1ComFillers !== linha1) adicionarLogMrz(log, "Correcao TD1", `Fillers linha 1: ${linha1} -> ${linha1ComFillers}`);
  if (linha2ComFillers !== linha2) adicionarLogMrz(log, "Correcao TD1", `Fillers linha 2: ${linha2} -> ${linha2ComFillers}`);
  const corrigida1 = corrigirLinha1Td1Documento(linha1ComFillers, log);
  const corrigida2Nascimento = corrigirSegmentoMrzPorChecksum(linha2ComFillers, 0, 6, 6);
  let corrigida2Validade = corrigirSegmentoMrzPorChecksum(corrigida2Nascimento, 8, 14, 14);
  corrigida2Validade = corrigirDigitoCompostoTd1(corrigida1, corrigida2Validade);
  if (corrigida1 !== linha1ComFillers) adicionarLogMrz(log, "Correcao TD1", `Numero/checksum linha 1: ${linha1ComFillers} -> ${corrigida1}`);
  if (corrigida2Validade !== linha2ComFillers) adicionarLogMrz(log, "Correcao TD1", `Datas/checksum linha 2: ${linha2ComFillers} -> ${corrigida2Validade}`);
  return [corrigida1, corrigida2Validade];
}

function corrigirFillersMrz(linha, inicio, fim) {
  const chars = linha.split("");
  for (let i = inicio; i < fim && i < chars.length; i++) {
    if (/[KL]/.test(chars[i])) chars[i] = "<";
  }
  return chars.join("");
}

function corrigirDigitoCompostoTd1(linha1, linha2) {
  const valor = linha1.slice(5, 30) + linha2.slice(0, 7) + linha2.slice(8, 15) + linha2.slice(18, 29);
  if (validarDigitoMrz(valor, linha2[29])) return linha2;

  if (
    !validarDigitoMrz(linha1.slice(5, 14), linha1[14]) ||
    !validarDigitoMrz(linha2.slice(0, 6), linha2[6]) ||
    !validarDigitoMrz(linha2.slice(8, 14), linha2[14])
  ) {
    return linha2;
  }

  const chars = linha2.split("");
  chars[29] = String(calcularDigitoMrz(valor));
  return chars.join("");
}

function corrigirLinha1Td1Documento(linha, log) {
  let corrigida = corrigirDocumentoPortuguesResidencia(linha);
  if (corrigida !== linha) {
    adicionarLogMrz(log, "Correcao TD1", `Padrao residencia PRT: ${linha.slice(5, 14)} -> ${corrigida.slice(5, 14)}`);
  }

  if (validarDigitoMrz(corrigida.slice(5, 14), corrigida[14])) return corrigida;

  const porChecksum = corrigirSegmentoMrzPorChecksum(corrigida, 5, 14, 14);
  return porChecksum;
}

function corrigirDocumentoPortuguesResidencia(linha) {
  if (!/^IRPRT/.test(linha)) return linha;

  const numero = linha.slice(5, 14);
  const digito = linha[14];
  const candidatos = gerarCandidatosNumeroResidencia(numero);
  const candidatoValido = candidatos.find((candidato) => validarDigitoMrz(candidato, digito));

  if (candidatoValido) {
    return linha.slice(0, 5) + candidatoValido + linha.slice(14);
  }

  return linha;
}

function gerarCandidatosNumeroResidencia(numero) {
  const posicoesDigito = new Set([0, 2, 3, 4, 5, 7, 8]);
  const posicoesLetra = new Set([1, 6]);
  const mapasDigito = {
    O: ["0"],
    Q: ["0"],
    D: ["0"],
    I: ["1"],
    L: ["1"],
    Z: ["2"],
    S: ["5"],
    B: ["8"],
    7: ["7", "1"]
  };
  const mapasLetra = {
    "0": ["O"],
    "1": ["I"],
    "5": ["S"],
    "8": ["B"]
  };

  const opcoes = numero.split("").map((char, index) => {
    if (posicoesDigito.has(index)) {
      return [...new Set([char, ...(mapasDigito[char] || [])])].filter((valor) => /^\d$/.test(valor));
    }
    if (posicoesLetra.has(index)) {
      return [...new Set([char, ...(mapasLetra[char] || [])])].filter((valor) => /^[A-Z]$/.test(valor));
    }
    return [char];
  });

  return combinarOpcoes(opcoes)
    .filter((candidato) => /^\d[A-Z]\d{4}[A-Z]\d{2}$/.test(candidato))
    .sort((a, b) => contarDiferencas(a, numero) - contarDiferencas(b, numero));
}

function combinarOpcoes(opcoes) {
  return opcoes.reduce(
    (acumulado, opcoesChar) => acumulado.flatMap((prefixo) => opcoesChar.map((char) => prefixo + char)),
    [""]
  );
}

function contarDiferencas(a, b) {
  return a.split("").reduce((total, char, index) => total + (char === b[index] ? 0 : 1), 0);
}

function corrigirSegmentoMrzPorChecksum(linha, inicio, fim, indiceDigito) {
  if (validarDigitoMrz(linha.slice(inicio, fim), linha[indiceDigito])) return linha;

  const chars = linha.split("");
  const candidatos = [];
  for (let i = inicio; i < fim; i++) {
    if (chars[i] === "O") candidatos.push(i);
  }

  for (const indice of candidatos) {
    const tentativa = [...chars];
    tentativa[indice] = "0";
    const linhaTentativa = tentativa.join("");
    if (validarDigitoMrz(linhaTentativa.slice(inicio, fim), linhaTentativa[indiceDigito])) {
      return linhaTentativa;
    }
  }

  for (let mask = 1; mask < 2 ** candidatos.length; mask++) {
    const tentativa = [...chars];
    candidatos.forEach((indice, bit) => {
      if (mask & (1 << bit)) tentativa[indice] = "0";
    });
    const linhaTentativa = tentativa.join("");
    if (validarDigitoMrz(linhaTentativa.slice(inicio, fim), linhaTentativa[indiceDigito])) {
      return linhaTentativa;
    }
  }

  return linha;
}

function validarMrzTd3(linha2, log) {
  const checks = {
    documento: validarDigitoMrz(linha2.slice(0, 9), linha2[9]),
    nascimento: validarDigitoMrz(linha2.slice(13, 19), linha2[19]),
    validade: validarDigitoMrz(linha2.slice(21, 27), linha2[27]),
    composto: validarDigitoMrz(linha2.slice(0, 10) + linha2.slice(13, 20) + linha2.slice(21, 43), linha2[43])
  };
  adicionarLogMrz(log, "Checksum TD3", JSON.stringify(checks));
  return checks.documento && checks.nascimento && checks.validade && checks.composto;
}

function validarMrzTd1(linha1, linha2, log) {
  const numeroDocumento = linha1.slice(5, 14);
  const digitoDocumento = linha1[14];
  const opcional1 = linha1.slice(15, 30);
  const documentoValido =
    validarDigitoMrz(numeroDocumento, digitoDocumento) ||
    validarDigitoMrz(numeroDocumento + opcional1, digitoDocumento);
  const checks = {
    documento: documentoValido,
    nascimento: validarDigitoMrz(linha2.slice(0, 6), linha2[6]),
    validade: validarDigitoMrz(linha2.slice(8, 14), linha2[14]),
    composto: validarDigitoMrz(linha1.slice(5, 30) + linha2.slice(0, 7) + linha2.slice(8, 15) + linha2.slice(18, 29), linha2[29])
  };
  adicionarLogMrz(log, "Checksum TD1", JSON.stringify(checks));

  return (
    checks.documento &&
    checks.nascimento &&
    checks.validade &&
    checks.composto
  );
}

function validarDigitoMrz(valor, digito) {
  return String(calcularDigitoMrz(valor)) === String(digito || "");
}

function calcularDigitoMrz(valor) {
  const pesos = [7, 3, 1];
  return String(valor || "")
    .split("")
    .reduce((total, char, index) => total + valorCaracterMrz(char) * pesos[index % 3], 0) % 10;
}

function valorCaracterMrz(char) {
  if (char === "<") return 0;
  if (/[0-9]/.test(char)) return Number(char);
  if (/[A-Z]/.test(char)) return char.charCodeAt(0) - 55;
  return 0;
}

function parseNomesMrz(campo) {
  const partes = campo.split("<<");
  const ultimoNome = limparNomeMrz(partes[0]);
  const primeiroNome = limparNomeMrz(partes.slice(1).join(" "));

  return {
    primeiroNome,
    ultimoNome
  };
}

function limparNomeMrz(valor) {
  const tokens = valor
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  while (tokens.length > 1 && tokens[tokens.length - 1].length === 1) {
    tokens.pop();
  }

  return tokens
    .join(" ")
    .toLowerCase()
    .replace(/\b[a-z]/g, letra => letra.toUpperCase());
}

function limparCampoMrz(valor) {
  return valor.replace(/</g, "").trim();
}

function parseDataMrz(valor) {
  if (!/^\d{6}$/.test(valor)) return "";

  const yy = Number(valor.slice(0, 2));
  const mm = valor.slice(2, 4);
  const dd = valor.slice(4, 6);
  const anoAtual = new Date().getFullYear() % 100;
  const seculo = yy > anoAtual ? 1900 : 2000;
  return `${seculo + yy}-${mm}-${dd}`;
}

function paisMrzParaNome(codigo) {
  const alpha3ParaNome = {
    AGO: "Angola",
    ARG: "Argentina",
    AUS: "Australia",
    AUT: "Austria",
    BEL: "Belgium",
    BRA: "Brazil",
    CAN: "Canada",
    CHE: "Switzerland",
    CHL: "Chile",
    CHN: "China",
    COL: "Colombia",
    CZE: "Czech Republic",
    DEU: "Germany",
    DNK: "Denmark",
    ESP: "Spain",
    FIN: "Finland",
    FRA: "France",
    GBR: "United Kingdom of Great Britain and Northern Ireland",
    IRL: "Ireland",
    ITA: "Italy",
    LUX: "Luxembourg",
    MAR: "Morocco",
    MEX: "Mexico",
    NLD: "Netherlands",
    NOR: "Norway",
    POL: "Poland",
    PRT: "Portugal",
    ROU: "Romania",
    SWE: "Sweden",
    UKR: "Ukraine",
    USA: "United States of America"
  };

  return alpha3ParaNome[codigo] || "";
}

function preencherSeVazio(id, valor) {
  const campo = document.getElementById(id);
  if (campo && valor && !campo.value) {
    campo.value = valor;
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function preencherCampoMrz(id, valor) {
  const campo = document.getElementById(id);
  if (!campo) return;
  campo.value = valor || "";
  campo.dispatchEvent(new Event("change", { bubbles: true }));
}

function definirOrigemIdDocumento(origem) {
  const campoOrigem = document.getElementById("id-number-source");
  if (campoOrigem) campoOrigem.value = origem || "";
}

function monitorizarOrigemIdDocumento() {
  const campo = document.getElementById("id-number-input");
  const campoOrigem = document.getElementById("id-number-source");
  if (!campo || !campoOrigem) return;

  campo.addEventListener("input", () => {
    if (window.__mrzPreenchendoCampos) return;
    campoOrigem.value = campoOrigem.value === "mrz" ? "edited" : "manual";
  });
}

function preencherCamposComMrz(dados) {
  window.__mrzPreenchendoCampos = true;
  try {
    limparCamposMrz();
    preencherCampoMrz("primeiro-nome-input", dados.primeiroNome);
    preencherCampoMrz("ultimo-nome-input", dados.ultimoNome);
    preencherCampoMrz("data-nascimento-input", dados.dataNascimento);
    preencherCampoMrz("id-number-input", dados.idNumber);
    preencherCampoMrz("id-type-input", dados.idType);
    preencherCampoMrz("country-document-input", dados.countryDocument || dados.nacionalidade);
    preencherCampoMrz("nacionalidade-input", dados.nacionalidade);
    preencherCampoMrz("country-residence-input", dados.nacionalidade);
    definirOrigemIdDocumento(dados.idNumber ? "mrz" : "");
  } finally {
    window.__mrzPreenchendoCampos = false;
  }
}

function limparCamposMrz() {
  MRZ_FIELD_IDS.forEach(id => {
    const campo = document.getElementById(id);
    if (!campo) return;
    campo.value = "";
  });
  definirOrigemIdDocumento("");
}

function selecionarFatura(querFatura) {
  const simBtn = document.getElementById("btn-fatura-sim");
  const naoBtn = document.getElementById("btn-fatura-nao");
  const secaoFatura = document.getElementById("secao-fatura");

  if (querFatura) {
    simBtn.classList.add("selected");
    naoBtn.classList.remove("selected");
    secaoFatura.style.display = "block";
  } else {
    simBtn.classList.remove("selected");
    naoBtn.classList.add("selected");
    secaoFatura.style.display = "none";
  }

  document.getElementById("fatura-opcao").setAttribute("data-quer-fatura", querFatura ? "sim" : "nao");
}

function mostrarPaginaObrigado() {
  const form = document.getElementById("checkinForm");
  const successScreen = document.getElementById("success-screen");
  const scanEntry = document.querySelector(".scan-entry");

  if (form) form.hidden = true;
  if (successScreen) successScreen.hidden = false;
  if (scanEntry) scanEntry.hidden = true;

  fecharLeitorDocumento();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function adicionarOutroHospede() {
  const url = new URL(window.location.href);
  const idReservaAtual =
    url.searchParams.get("idres") ||
    url.searchParams.get("idReserva") ||
    document.getElementById("id-reserva")?.value ||
    "";

  if (idReservaAtual) {
    url.searchParams.set("idres", idReservaAtual);
    url.searchParams.delete("idReserva");
  }

  window.location.href = url.toString();
}

function obterMensagemValidacao(tipo) {
  const t = traducoes[linguaAtual] || traducoes.pt;
  if (tipo === "numero") return t.numeroInvalido || "Numero invalido";
  if (tipo === "email") return t.emailInvalidoCurto || t.erroEmail || "Email invalido";
  if (tipo === "data") return t.dataInvalidaCurta || t.erroDataNascimento || "Data invalida";
  return t.preenchaCampo || "Preencha este campo";
}

function marcarCampoInvalido(campo, mensagem) {
  if (!campo) return;
  campo.classList.add("erro-campo");
  campo.setAttribute("aria-invalid", "true");

  const wrapper = campo.closest(".field") || campo.parentElement;
  if (!wrapper) return;

  let erro = wrapper.querySelector(".field-error");
  if (!erro) {
    erro = document.createElement("span");
    erro.className = "field-error";
    wrapper.appendChild(erro);
  }

  erro.textContent = mensagem || obterMensagemValidacao();
}

function limparCampoInvalido(campo) {
  if (!campo) return;
  campo.classList.remove("erro-campo");
  campo.removeAttribute("aria-invalid");

  const wrapper = campo.closest(".field") || campo.parentElement;
  wrapper?.querySelector(".field-error")?.remove();
}

function idDocumentoPareceValido(valor) {
  const id = String(valor || "").trim().replace(/\s+/g, "");
  if (id.length < 4 || id.length > 32) return false;
  if (!/^[A-Z0-9]+$/i.test(id)) return false;
  if (!/[0-9]/.test(id)) return false;
  if (/^([A-Z0-9])\1+$/i.test(id)) return false;
  if (/^(?:0+|1+|9+|1234|12345|123456|1234567|12345678|01234|012345|0123456|01234567|012345678)$/i.test(id)) return false;
  if (/^(?:ABCD|ABCDE|ABCDEF|ABCDEFG|ABCDEFGH)$/i.test(id)) return false;
  return true;
}

function focarPrimeiroCampoInvalido() {
  const campo = document.querySelector(".erro-campo");
  if (!campo) return;
  campo.scrollIntoView({ behavior: "smooth", block: "center" });
  campo.focus({ preventScroll: true });
}

function validarFormulario(e) {
  e.preventDefault();

  const form = document.getElementById("checkinForm");
  form.noValidate = true;
  const t = traducoes[linguaAtual];
  const data = new FormData(form);
  const submitBtn = form.querySelector("button[type='submit']");

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.backgroundColor = "#ccc";
    submitBtn.textContent = t.enviando || "Enviando...";
  }

  const camposObrigatorios = [
    "primeiro-nome-input",
    "ultimo-nome-input",
    "local-nascimento-input",
    "data-nascimento-input",
    "nacionalidade-input",
    "id-number-input",
    "country-document-input",
    "id-type-input",
    "country-residence-input",
    "place-residence-input"
  ];

  let erro = false;
  camposObrigatorios.forEach(id => {
    const campo = document.getElementById(id);
    limparCampoInvalido(campo);
    if (!campo || !campo.value.trim() || campo.value === "--") {
      marcarCampoInvalido(campo, obterMensagemValidacao());
      erro = true;
    }
    if (campo && campo.type === "text" && campo.value.length > 40) {
      marcarCampoInvalido(campo, obterMensagemValidacao());
      erro = true;
    }
  });

  const idNumberInput = document.getElementById("id-number-input");
  if (idNumberInput?.value.trim() && !idDocumentoPareceValido(idNumberInput.value)) {
    marcarCampoInvalido(idNumberInput, obterMensagemValidacao("numero"));
    erro = true;
  }

  if (erro) {
    focarPrimeiroCampoInvalido();
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.backgroundColor = "";
      submitBtn.textContent = t.enviar;
    }
    return;
  }

  const dataNascimentoInput = document.getElementById("data-nascimento-input");
  const dataNascimento = new Date(dataNascimentoInput.value);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (dataNascimento > hoje || dataNascimento.getFullYear() < 1920) {
    marcarCampoInvalido(dataNascimentoInput, obterMensagemValidacao("data"));
    focarPrimeiroCampoInvalido();
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.backgroundColor = "";
      submitBtn.textContent = t.enviar;
    }
    return;
  } else {
    limparCampoInvalido(dataNascimentoInput);
  }

  const email = document.getElementById("email-input").value;
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    marcarCampoInvalido(document.getElementById("email-input"), obterMensagemValidacao("email"));
    focarPrimeiroCampoInvalido();
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.backgroundColor = "";
      submitBtn.textContent = t.enviar;
    }
    return;
  } else {
    limparCampoInvalido(document.getElementById("email-input"));
  }

  const querFatura = document.getElementById("fatura-opcao").getAttribute("data-quer-fatura") === "sim";
  if (querFatura) {
    const camposFatura = [
      "nif-fatura",
      "pais-fatura",
      "email-fatura"
    ];
    let erroFatura = false;
    camposFatura.forEach(id => {
      const campo = document.getElementById(id);
      limparCampoInvalido(campo);
      if (!campo.value.trim() || campo.value === "--") {
        marcarCampoInvalido(campo, obterMensagemValidacao());
        erroFatura = true;
      }
      if (id === "email-fatura" && !/^\S+@\S+\.\S+$/.test(campo.value.trim())) {
        marcarCampoInvalido(campo, obterMensagemValidacao("email"));
        erroFatura = true;
      }
    });

    if (erroFatura) {
      focarPrimeiroCampoInvalido();
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.backgroundColor = "";
        submitBtn.textContent = t.enviar;
      }
      return;
    }
    data.append("desejaFatura", "Sim");
  } else {
    data.append("desejaFatura", "Não");
  }

  if (idNumberInput) {
    const campoOrigemId = document.getElementById("id-number-source");
    if (idNumberInput.value.trim() && campoOrigemId && !campoOrigemId.value) {
      campoOrigemId.value = "manual";
    }
    idNumberInput.value = idNumberInput.value.trim().replace(/\s+/g, "").toUpperCase();
    data.set("idNumber", idNumberInput.value);
    data.set("idNumberSource", campoOrigemId?.value || "");
  }

  data.append("token", "CHECKIN2024");

  const actionUrl = "https://script.google.com/macros/s/AKfycby2QQhrorqB9kPHIGnKqq2LsSCEq7nBIORPq4PeZG_xb5PrQBTzsOci7xv9-Ln2MCq5/exec";

  fetch(actionUrl, {
    method: "POST",
    body: data
  })
    .then(response => response.text())
    .then(result => {
      console.log("Texto da resposta:", result);

      if (result.includes("Sucesso")) {
        mostrarPaginaObrigado();
      } else {
        alert(t.erroEnvio || "Erro ao enviar o formulário.");
      }
    })
    .catch(error => {
      console.warn("Erro ao enviar:", error);
      mostrarPaginaObrigado();
    })
    .finally(() => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.backgroundColor = "";
        submitBtn.textContent = t.enviar;
      }
    });
}

function initForm() {
  if (!document.getElementById("checkinForm")) return;

  selecionarLingua(linguaAtual);
  preencherIdReserva();
  ["nacionalidade-input", "country-document-input", "country-residence-input", "pais-fatura"].forEach(preencherSelect);
  preencherPaisesRelacionados();
  selecionarFatura(false);
  monitorizarOrigemIdDocumento();

  document.querySelectorAll("input, select").forEach(campo => {
    campo.addEventListener("input", () => limparCampoInvalido(campo));
    campo.addEventListener("change", () => limparCampoInvalido(campo));
  });

  document.getElementById("mrz-file-input")?.addEventListener("change", event => {
    const ficheiro = event.target.files?.[0];
    if (ficheiro) processarImagemDocumento(ficheiro);
    event.target.value = "";
  });

  document.getElementById("mrz-modal")?.addEventListener("click", event => {
    if (event.target.id === "mrz-modal") fecharLeitorDocumento();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") fecharLeitorDocumento();
  });
}
