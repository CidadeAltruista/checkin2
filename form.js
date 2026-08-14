let linguaAtual = "pt";
let mrzStream = null;
let mrzWorker = null;
let mrzV2Worker = null;
let mrzV2RequestId = 0;
let mrzCameraDevices = [];
let mrzCameraDeviceId = "";
let mrzCameraTrocaEmCurso = false;
let mrzLeituraDinamicaAtiva = false;
let mrzLeituraDinamicaId = 0;
let mrzLeituraDinamicaLog = null;
let mrzLeituraDinamicaAcaoAtual = "";
let mrzLeituraDinamicaTentativas = 0;
let mrzImagemOriginal = null;
let mrzImagemPreviewUrl = "";
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
const MRZ_SHOW_DEBUG_LOG = true;

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
    "btn-leitura-dinamica": mrzLeituraDinamicaAtiva
      ? (t.pararLeituraDinamica || "Parar leitura")
      : (t.leituraDinamica || "Leitura dinamica"),
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
  if (close) {
    close.setAttribute("aria-label", t.fechar || "Sair");
    close.textContent = t.fechar || "Sair";
  }

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
  const result = document.getElementById("mrz-result");
  const actions = modal?.querySelector(".mrz-actions");
  const instructions = modal?.querySelector(".mrz-instructions");

  if (!modal) return;
  document.getElementById("mrz-form-alert")?.setAttribute("hidden", "");
  document.querySelector(".mrz-log-images")?.remove();
  mrzLeituraDinamicaLog = null;
  if (actions) actions.hidden = false;
  if (instructions) instructions.hidden = false;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  atualizarEstadoMrz("");
  atualizarProgressoMrz(0);
  mostrarProgressoMrz(false);
  esconderRecorteManualMrz();
  if (result) {
    result.hidden = true;
    result.textContent = "";
  }
}

function fecharLeitorDocumento() {
  const modal = document.getElementById("mrz-modal");

  pararLeituraDinamicaDocumento();
  pararCameraDocumento(true);
  limparImagemManualMrz();
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
}

function pararCameraDocumento(limparDispositivos = false) {
  const camera = document.getElementById("mrz-camera");
  const video = document.getElementById("mrz-video");

  if (mrzStream) {
    mrzStream.getTracks().forEach(track => track.stop());
    mrzStream = null;
  }

  if (video) video.srcObject = null;
  if (camera) camera.hidden = true;
  mrzCameraDeviceId = "";

  if (limparDispositivos) mrzCameraDevices = [];
  atualizarBotaoTrocarCamera();
}

function selecionarFotoDocumento() {
  document.getElementById("mrz-file-input")?.click();
}

function esconderInstrucoesMrz() {
  const instructions = document.querySelector("#mrz-modal .mrz-instructions");
  if (instructions) instructions.hidden = true;
}

function mostrarInstrucoesMrz() {
  const instructions = document.querySelector("#mrz-modal .mrz-instructions");
  if (instructions) instructions.hidden = false;
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
    focarCameraDocumento();
  } catch (error) {
    console.warn("Erro ao abrir camera:", error);
    mostrarErroMrz();
  }
}

function focarCameraDocumento() {
  const camera = document.getElementById("mrz-camera");
  if (!camera || camera.hidden) return;

  window.requestAnimationFrame(() => {
    camera.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function focarTopoLeitorDocumento() {
  const dialog = document.querySelector("#mrz-modal .mrz-dialog");
  const rolar = () => {
    if (dialog) dialog.scrollTop = 0;
    window.scrollTo(0, 0);
  };

  rolar();
  window.requestAnimationFrame(rolar);
  window.setTimeout(rolar, 60);

  if (dialog) {
    return;
  }

  document.getElementById("mrz-modal")?.scrollIntoView({ block: "start" });
}

function obterConstraintsCameraDocumento(deviceId = "") {
  const baseConstraints = {
    width: { ideal: 2560 },
    height: { ideal: 1440 },
    aspectRatio: { ideal: 4 / 3 },
    facingMode: { ideal: "environment" },
    frameRate: { ideal: 30, min: 15 }
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
  if (capabilities.exposureMode?.includes("continuous")) {
    advanced.push({ exposureMode: "continuous" });
  }
  if (capabilities.whiteBalanceMode?.includes("continuous")) {
    advanced.push({ whiteBalanceMode: "continuous" });
  }
  if (!advanced.length) return;

  for (const constraint of advanced) {
    try {
      await track.applyConstraints({ advanced: [constraint] });
    } catch (error) {
      console.info("Ajuste de camera nao suportado:", constraint, error);
    }
  }
}

async function trocarCameraDocumento() {
  const video = document.getElementById("mrz-video");

  if (mrzCameraTrocaEmCurso || !navigator.mediaDevices?.getUserMedia || !video) return;
  const retomarLeituraDinamica = mrzLeituraDinamicaAtiva;
  if (retomarLeituraDinamica) {
    mrzLeituraDinamicaAtiva = false;
    mrzLeituraDinamicaId++;
    atualizarBotaoLeituraDinamica();
    adicionarLogDinamicoMrz("Trocar camera", "A pausar leitura dinamica durante a troca de camera.");
  }

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
    focarCameraDocumento();
    if (retomarLeituraDinamica) {
      adicionarLogDinamicoMrz("Trocar camera", "Camera trocada. A retomar leitura dinamica.");
      window.setTimeout(() => {
        iniciarLeituraDinamicaDocumento({ preservarLog: true, preservarTentativas: true, esperaInicialMs: 3000 });
      }, 0);
    }
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

function atualizarBotaoLeituraDinamica() {
  const button = document.getElementById("btn-leitura-dinamica");
  if (!button) return;
  const t = traducoes[linguaAtual] || traducoes.pt;
  const label = mrzLeituraDinamicaAtiva
    ? (t.pararLeituraDinamica || "Parar leitura")
    : (t.leituraDinamica || "Leitura dinamica");
  const text = button.querySelector("span:last-child");
  if (text) text.textContent = label;
  else button.textContent = label;
  button.classList.toggle("selected", mrzLeituraDinamicaAtiva);
}

async function alternarLeituraDinamicaDocumento() {
  if (mrzLeituraDinamicaAtiva) {
    pararLeituraDinamicaDocumento("Leitura dinamica parada.");
    return;
  }

  await iniciarLeituraDinamicaDocumento();
}

async function iniciarLeituraDinamicaDocumento(opcoes = {}) {
  const video = document.getElementById("mrz-video");
  const {
    preservarLog = false,
    preservarTentativas = false,
    esperaInicialMs = 3000
  } = opcoes;

  if (!preservarLog || !mrzLeituraDinamicaLog) {
    mrzLeituraDinamicaLog = criarLogDinamicoMrz();
  }
  if (!preservarTentativas) mrzLeituraDinamicaTentativas = 0;
  adicionarLogDinamicoMrz("Modo", preservarLog ? "Leitura dinamica retomada." : "Leitura dinamica iniciada pelo botao dedicado.");

  if (!window.MrzStage3Reader?.read) {
    adicionarLogDinamicoMrz("Erro", "Leitor MRZ etapa 3 nao carregado.");
    mostrarErroMrz();
    return;
  }

  if (!mrzStream) {
    adicionarLogDinamicoMrz("Camera", "A abrir camera antes de iniciar leitura dinamica.");
    await iniciarCameraDocumento();
  } else {
    adicionarLogDinamicoMrz("Camera", "Camera ja estava aberta.");
  }

  await aguardarVideoProntoMrz(video);

  if (!mrzStream || !video || !video.videoWidth) {
    adicionarLogDinamicoMrz("Erro", "Camera indisponivel ou sem frames de video.");
    mostrarErroMrz();
    return;
  }

  mrzLeituraDinamicaAtiva = true;
  const runId = ++mrzLeituraDinamicaId;
  atualizarBotaoLeituraDinamica();
  esconderInstrucoesMrz();
  mostrarProgressoMrz(true);
  atualizarProgressoMrz(0);
  adicionarLogDinamicoMrz("Espera", `Camera aberta. A aguardar ${Math.round(esperaInicialMs / 1000)} segundos para foco/exposicao estabilizarem.`);
  atualizarEstadoMrz(`Leitura dinamica: a estabilizar camera por ${Math.round(esperaInicialMs / 1000)} segundos...`);
  await atrasoMrz(esperaInicialMs);
  if (!mrzLeituraDinamicaAtiva || runId !== mrzLeituraDinamicaId) return;
  adicionarLogDinamicoMrz("Arranque", "A iniciar tentativas continuas. So para com sucesso ou botao Parar leitura.");
  await executarLeituraDinamicaDocumento(runId);
}

function pararLeituraDinamicaDocumento(mensagem = "") {
  if (!mrzLeituraDinamicaAtiva && !mensagem) return;
  mrzLeituraDinamicaAtiva = false;
  mrzLeituraDinamicaId++;
  atualizarBotaoLeituraDinamica();
  if (mensagem) adicionarLogDinamicoMrz("Parado", mensagem);
  if (mensagem) atualizarEstadoMrz(mensagem);
}

async function executarLeituraDinamicaDocumento(runId) {
  const video = document.getElementById("mrz-video");

  while (mrzLeituraDinamicaAtiva && runId === mrzLeituraDinamicaId) {
    const tentativa = ++mrzLeituraDinamicaTentativas;

    try {
      if (!video || !video.videoWidth || !mrzStream) throw new Error("Camera indisponivel.");
      if (tentativa === 6) {
        adicionarLogDinamicoMrz("Sugestao", "#6: se a leitura continuar dificil, experimente trocar de camera.");
        atualizarEstadoMrz("Leitura dinamica: tentativa 6. Se continuar dificil, experimente Trocar camera.");
      } else {
        atualizarEstadoMrz(`Leitura dinamica: tentativa ${tentativa}...`);
      }
      if (tentativa > 10) {
        encerrarLeituraDinamicaPorLimite();
        return;
      }
      adicionarLogDinamicoMrz("Tentativa", `#${tentativa}: a aguardar frames recentes do preview.`);
      await aguardarFramesVideoMrz(video, tentativa === 1 ? 5 : 2);

      const viewport = calcularViewportVideoCover(video);
      adicionarLogDinamicoMrz("Captura", `#${tentativa}: a capturar 3 frames e escolher o mais nitido.`);
      const captura = await capturarFrameMaisNitidoDocumento(video, 3);
      const imagem = await canvasToBlobMrz(captura.canvas, "image/png");
      imagem.name = `leitura-dinamica-${tentativa}.png`;
      adicionarLogDinamicoMrz("Captura", `#${tentativa}: frame ${captura.index + 1}/${captura.total}, score nitidez=${captura.score}.`);
      adicionarLogDinamicoMrz("Deteccao", `#${tentativa}: a tentar identificar zona MRZ/ROI.`);
      adicionarLogDinamicoMrz("OCR", `#${tentativa}: a ler OCR com pipeline rapido.`);

      const resultado = await window.MrzStage3Reader.read(imagem, {
        lang: "ocrb",
        langPath: "./tessdata",
        timeoutMs: 9000,
        roiLang: "ocrb",
        roiLangPath: "./tessdata",
        roiTimeoutMs: 3500,
        pipelineIds: ["ocrb-manual-shadow-local-soft"],
        debugImages: false,
        onStatus: mensagem => {
          if (mensagem) adicionarLogDinamicoMrz("Etapa 3", `#${tentativa}: ${mensagem}`);
        },
        onProgress: percentagem => atualizarProgressoMrz(Math.min(95, Math.max(5, percentagem || 0)))
      });

      if (resultado.ok && resultado.formData) {
        adicionarLogDinamicoMrz("Sucesso", `#${tentativa}: MRZ valida encontrada. A preencher campos.`);
        pararCameraDocumento();
        mostrarImagemDinamicaFinalMrz(captura.canvas);
        adicionarLogDinamicoMrz("Etapa 3 completa", `#${tentativa}: a confirmar o mesmo frame com ensemble completo e imagens de debug.`);
        let resultadoFinal;
        try {
          resultadoFinal = await window.MrzStage3Reader.read(imagem, {
            lang: "ocrb",
            langPath: "./tessdata",
            timeoutMs: 25000,
            roiLang: "ocrb",
            roiLangPath: "./tessdata",
            roiTimeoutMs: 8000,
            debugImages: true,
            onStatus: mensagem => {
              if (mensagem) adicionarLogDinamicoMrz("Etapa 3 completa", `#${tentativa}: ${mensagem}`);
            },
            onProgress: atualizarProgressoMrz
          });
        } catch (error) {
          resultadoFinal = {
            ok: false,
            formData: null,
            results: [],
            debugImages: [],
            error: error?.message || String(error)
          };
          adicionarLogDinamicoMrz("Etapa 3 completa", `#${tentativa}: erro na confirmacao completa: ${resultadoFinal.error}`);
        }
        const resultadoRobusto = resultadoFinal.ok && resultadoFinal.formData ? resultadoFinal : resultado;
        adicionarLogDinamicoMrz(
          resultadoFinal.ok ? "Confirmado" : "Fallback",
          resultadoFinal.ok
            ? `#${tentativa}: ensemble completo confirmou a leitura.`
            : `#${tentativa}: ensemble completo nao confirmou; a usar leitura rapida ja validada.`
        );
        const log = criarLogMrz(imagem);
        if (mrzLeituraDinamicaLog?.length) {
          log.push("[Historico dinamico]");
          log.push(...mrzLeituraDinamicaLog.slice(1));
        }
        adicionarLogMrz(log, "Modo", "Leitura dinamica no preview da camera.");
        adicionarLogMrz(log, "Camera captura", "melhor de 3 frames por tentativa");
        adicionarLogMrz(log, "Camera nitidez", `Tentativa ${tentativa}; escolhido frame ${captura.index + 1}/${captura.total}; score=${captura.score}.`);
        adicionarLogMrz(log, "Pipeline dinamico", "ocrb-manual-shadow-local-soft");
        adicionarDebugEntradaMrz(log, imagem, {
          origem: "camera dinamica",
          debugCamera: {
            metodo: "leitura dinamica",
            melhorFrameUrl: captura.canvas.toDataURL("image/png"),
            viewport,
            framesCapturados: captura.total,
            melhorFrame: captura.index + 1,
            nitidez: captura.score,
            videoSize: {
              width: video.videoWidth,
              height: video.videoHeight,
              clientWidth: video.clientWidth,
              clientHeight: video.clientHeight
            }
          }
        });
        if (resultado.results?.length) {
          adicionarLogMrz(log, "Resultado dinamico", resultado.results.map(item => `${item.pipelineName}: ${item.trust?.label || item.error || "sem estado"}`).join(" | "));
        }
        if (resultadoFinal.results?.length) {
          adicionarLogMrz(log, "Resultado etapa 3 completa", resultadoFinal.results.map(item => `${item.pipelineName}: ${item.trust?.label || item.error || "sem estado"}`).join(" | "));
        }
        adicionarDebugResultadoEtapa3Mrz(log, resultadoFinal);
        mrzLeituraDinamicaAtiva = false;
        mrzLeituraDinamicaId++;
        atualizarBotaoLeituraDinamica();
        finalizarLeituraMrz(resultadoRobusto.text || resultadoRobusto.rawText || "", resultadoRobusto.formData, log);
        return;
      }

      adicionarLogDinamicoMrz("Falhou", `#${tentativa}: sem MRZ valida. Continua para a proxima tentativa.`);
      if (tentativa >= 10) {
        encerrarLeituraDinamicaPorLimite();
        return;
      }
      atualizarProgressoMrz(0);
      await atrasoMrz(200);
    } catch (error) {
      console.info("Leitura dinamica sem resultado:", error);
      adicionarLogDinamicoMrz("Falhou", `#${tentativa}: ${error?.message || String(error)}. Continua.`);
      if (tentativa >= 10) {
        encerrarLeituraDinamicaPorLimite();
        return;
      }
      atualizarProgressoMrz(0);
      await atrasoMrz(200);
    }
  }
}

function encerrarLeituraDinamicaPorLimite() {
  adicionarLogDinamicoMrz("Limite", "10 tentativas sem leitura valida. A fechar camera.");
  mrzLeituraDinamicaAtiva = false;
  mrzLeituraDinamicaId++;
  atualizarBotaoLeituraDinamica();
  pararCameraDocumento();
  mostrarProgressoMrz(false);
  atualizarEstadoMrz("Nao foi possivel ler automaticamente. Faca upload de uma foto ou preencha manualmente.");
}

function mostrarImagemDinamicaFinalMrz(canvas) {
  if (!MRZ_SHOW_DEBUG_LOG || !canvas) return;
  document.querySelector(".mrz-log-images")?.remove();
  const log = mrzLeituraDinamicaLog || criarLogDinamicoMrz();
  adicionarImagemLogMrz(log, "Frame recortado usado na etapa 3 completa", canvas.toDataURL("image/png"));
  mostrarImagensLogMrz(log);
}

async function capturarFotoDocumento() {
  pararLeituraDinamicaDocumento();
  const video = document.getElementById("mrz-video");
  const captureButton = document.getElementById("btn-capturar-foto");

  if (!video || !video.videoWidth || !video.clientWidth || !video.clientHeight) {
    mostrarErroMrz();
    return;
  }

  try {
    if (captureButton) captureButton.disabled = true;
    atualizarEstadoMrz("A estabilizar imagem da camera...");
    await aguardarFramesVideoMrz(video, 3);

    const viewport = calcularViewportVideoCover(video);
    const videoSnapshotCanvas = criarCanvasFrameVideoMrz(video);
    const videoSize = {
      width: video.videoWidth,
      height: video.videoHeight,
      clientWidth: video.clientWidth,
      clientHeight: video.clientHeight
    };
    atualizarEstadoMrz("A escolher o frame mais nitido...");
    const captura = await capturarFrameMaisNitidoDocumento(video, 7);
    const imagem = await canvasToBlobMrz(captura.canvas, "image/png");
    imagem.name = "captura-camera-melhor-frame.png";
    const debugCamera = {
      metodo: "melhor de varios frames",
      frameVideoUrl: videoSnapshotCanvas.toDataURL("image/jpeg", 0.9),
      melhorFrameUrl: captura.canvas.toDataURL("image/png"),
      viewport,
      videoSize,
      framesCapturados: captura.total,
      melhorFrame: captura.index + 1,
      nitidez: captura.score
    };

    pararCameraDocumento();
    esconderInstrucoesMrz();
    await processarImagemCameraDocumento(imagem, debugCamera);
  } catch (error) {
    console.warn("Erro ao capturar foto:", error);
    mostrarFalhaLeituraMrz();
  } finally {
    if (captureButton) captureButton.disabled = false;
  }
}

function canvasToBlobMrz(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Nao foi possivel criar a imagem.")), type, quality);
  });
}

function aguardarFramesVideoMrz(video, quantidade = 2) {
  return new Promise(resolve => {
    let restantes = Math.max(1, quantidade);
    const proximo = () => {
      restantes--;
      if (restantes <= 0) {
        resolve();
        return;
      }
      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(proximo);
      } else {
        requestAnimationFrame(proximo);
      }
    };

    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(proximo);
    } else {
      requestAnimationFrame(proximo);
    }
  });
}

function aguardarVideoProntoMrz(video, timeoutMs = 2500) {
  if (!video || video.videoWidth) return Promise.resolve();

  return new Promise(resolve => {
    const startedAt = Date.now();
    const verificar = () => {
      if (video.videoWidth || Date.now() - startedAt >= timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(verificar);
    };
    verificar();
  });
}

function atrasoMrz(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function capturarFrameMaisNitidoDocumento(video, total = 7) {
  let melhor = null;

  for (let index = 0; index < total; index++) {
    await aguardarFramesVideoMrz(video, index === 0 ? 1 : 2);
    const canvas = criarCanvasFrameVideoMrz(video, calcularViewportVideoCover(video));
    const score = calcularNitidezCanvasMrz(canvas);

    if (!melhor || score > melhor.score) {
      melhor = { canvas, score, index, total };
    }
  }

  return melhor;
}

function criarCanvasFrameVideoMrz(video, viewport = null) {
  const origem = viewport || {
    x: 0,
    y: 0,
    width: video.videoWidth,
    height: video.videoHeight
  };
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = origem.width;
  canvas.height = origem.height;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    video,
    origem.x,
    origem.y,
    origem.width,
    origem.height,
    0,
    0,
    origem.width,
    origem.height
  );

  return canvas;
}

function calcularNitidezCanvasMrz(canvas) {
  const maxWidth = 640;
  const scale = Math.min(1, maxWidth / canvas.width);
  const sampleCanvas = document.createElement("canvas");
  const sampleWidth = Math.max(1, Math.round(canvas.width * scale));
  const sampleHeight = Math.max(1, Math.round(canvas.height * scale));
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = "high";
  sampleCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);

  const data = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let total = 0;
  let count = 0;

  for (let y = 1; y < sampleHeight - 1; y += 2) {
    for (let x = 1; x < sampleWidth - 1; x += 2) {
      const i = (y * sampleWidth + x) * 4;
      const esquerda = cinzentoPixelMrz(data, i - 4);
      const direita = cinzentoPixelMrz(data, i + 4);
      const cima = cinzentoPixelMrz(data, i - sampleWidth * 4);
      const baixo = cinzentoPixelMrz(data, i + sampleWidth * 4);
      const gx = direita - esquerda;
      const gy = baixo - cima;
      total += gx * gx + gy * gy;
      count++;
    }
  }

  return count ? Math.round(total / count) : 0;
}

function cinzentoPixelMrz(data, index) {
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function calcularViewportVideoCover(video) {
  const videoRatio = video.videoWidth / video.videoHeight;
  const boxRatio = video.clientWidth / video.clientHeight;

  if (videoRatio > boxRatio) {
    const width = Math.round(video.videoHeight * boxRatio);
    return {
      x: Math.round((video.videoWidth - width) / 2),
      y: 0,
      width,
      height: video.videoHeight
    };
  }

  const height = Math.round(video.videoWidth / boxRatio);
  return {
    x: 0,
    y: Math.round((video.videoHeight - height) / 2),
    width: video.videoWidth,
    height
  };
}

function calcularCropGuiaMrz(width, height) {
  return {
    x: Math.round(width * 0.06),
    y: Math.round(height * 0.50),
    width: Math.round(width * 0.88),
    height: Math.round(height * 0.44)
  };
}

function atualizarEstadoMrz(mensagem) {
  const status = document.getElementById("mrz-status");
  if (!status) return;
  status.textContent = mensagem || "";
  status.hidden = !mensagem;
  status.classList.toggle("is-info", Boolean(mensagem));
  status.classList.remove("is-error");
}

function mostrarErroMrz() {
  const status = document.getElementById("mrz-status");
  if (!status) return;
  const t = traducoes[linguaAtual] || traducoes.pt;
  status.innerHTML = t.leituraFalhouHtml || escaparHtmlLocal(t.leituraFalhou || "").replace(/\n/g, "<br>");
  status.hidden = false;
  status.classList.remove("is-info");
  status.classList.add("is-error");
}

function escaparHtmlLocal(valor) {
  return String(valor == null ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function mostrarFalhaLeituraMrz(opcoes = {}) {
  const { mostrarRecorte = false } = opcoes;
  atualizarProgressoMrz(100);
  mostrarInstrucoesMrz();
  if (mostrarRecorte) mostrarRecorteManualMrz();
  mostrarErroMrz();
}

function atualizarProgressoMrz(percentagem) {
  const valor = Math.max(0, Math.min(100, Math.round(percentagem)));
  const bar = document.getElementById("mrz-progress-bar");
  const percent = document.getElementById("mrz-progress-percent");
  if (bar) bar.style.width = `${valor}%`;
  if (percent) percent.textContent = `${valor}%`;
}

function mostrarProgressoMrz(mostrar = true) {
  const progress = document.querySelector("#mrz-modal .mrz-progress");
  if (progress) progress.hidden = !mostrar;
}

function mostrarRecorteManualMrz() {
  if (!mrzImagemOriginal) return;

  const panel = document.getElementById("mrz-manual-crop");
  const image = document.getElementById("mrz-crop-image");
  if (!panel || !image) return;

  if (mrzImagemPreviewUrl) URL.revokeObjectURL(mrzImagemPreviewUrl);
  mrzImagemPreviewUrl = URL.createObjectURL(mrzImagemOriginal);
  image.src = mrzImagemPreviewUrl;
  panel.hidden = false;
  atualizarCaixaRecorteMrz();
}

function esconderRecorteManualMrz() {
  const panel = document.getElementById("mrz-manual-crop");
  if (panel) panel.hidden = true;
}

function limparImagemManualMrz() {
  esconderRecorteManualMrz();
  mrzImagemOriginal = null;
  if (mrzImagemPreviewUrl) {
    URL.revokeObjectURL(mrzImagemPreviewUrl);
    mrzImagemPreviewUrl = "";
  }
  const image = document.getElementById("mrz-crop-image");
  if (image) image.removeAttribute("src");
}

function obterValoresRecorteMrz() {
  const x = Number(document.getElementById("mrz-crop-x")?.value || 4);
  const y = Number(document.getElementById("mrz-crop-y")?.value || 60);
  const w = Number(document.getElementById("mrz-crop-w")?.value || 92);
  const h = Number(document.getElementById("mrz-crop-h")?.value || 24);
  const left = Math.max(0, Math.min(95, x));
  const top = Math.max(0, Math.min(95, y));
  return {
    x: left,
    y: top,
    w: Math.max(5, Math.min(100 - left, w)),
    h: Math.max(5, Math.min(100 - top, h))
  };
}

function atualizarCaixaRecorteMrz() {
  const box = document.getElementById("mrz-crop-box");
  if (!box) return;

  const crop = obterValoresRecorteMrz();
  box.style.left = `${crop.x}%`;
  box.style.top = `${crop.y}%`;
  box.style.width = `${crop.w}%`;
  box.style.height = `${crop.h}%`;
}

async function processarRecorteManualMrz() {
  if (!mrzImagemOriginal) return;

  try {
    const blob = await criarBlobRecorteManualMrz();
    esconderRecorteManualMrz();
    await processarImagemDocumento(blob, { guardarOriginal: false, imagemJaRecortada: true });
  } catch (error) {
    console.warn("Erro ao recortar MRZ manualmente:", error);
    mostrarFalhaLeituraMrz();
  }
}

async function processarImagemGaleriaDocumento(imagem) {
  esconderInstrucoesMrz();
  focarTopoLeitorDocumento();
  return processarImagemDocumento(imagem, {
    guardarOriginal: true,
    imagemOriginalLog: imagem,
    imagemLeituraLog: imagem,
    origem: "galeria"
  });
}

async function processarImagemCameraDocumento(imagem, debugCamera = {}) {
  esconderInstrucoesMrz();
  focarTopoLeitorDocumento();
  return processarImagemDocumento(imagem, {
    guardarOriginal: true,
    imagemOriginalLog: imagem,
    imagemLeituraLog: imagem,
    origem: "camera",
    debugCamera
  });
}

async function criarBlobCropAutomaticoMrz(imagem) {
  const crop = await detectarZonaMrz(imagem);
  if (!crop) return null;
  return prepararImagemMrz(imagem, {
    nome: "recorte automatico MRZ",
    ...crop,
    maxWidth: 2200,
    threshold: null,
    contrast: 1.25,
    sharpen: 0.35
  }).then(tentativa => tentativa.blob);
}

function criarBlobRecorteManualMrz() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(mrzImagemOriginal);

    img.onload = () => {
      const crop = obterValoresRecorteMrz();
      const cropX = Math.floor(img.naturalWidth * crop.x / 100);
      const cropY = Math.floor(img.naturalHeight * crop.y / 100);
      const cropW = Math.floor(img.naturalWidth * crop.w / 100);
      const cropH = Math.floor(img.naturalHeight * crop.h / 100);
      const canvas = document.createElement("canvas");
      const escala = Math.min(3, Math.max(1, 2200 / cropW));
      const ctx = canvas.getContext("2d");

      canvas.width = Math.round(cropW * escala);
      canvas.height = Math.round(cropH * escala);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error("Nao foi possivel criar o recorte MRZ."));
      }, "image/jpeg", 0.95);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nao foi possivel carregar a imagem original."));
    };

    img.src = url;
  });
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

async function processarImagemDocumento(imagem, opcoes = {}) {
  if (!window.MrzStage3Reader?.read) {
    const log = criarLogMrz(imagem);
    adicionarLogMrz(log, "Erro etapa 3", "Leitor MRZ etapa 3 nao carregado.");
    mostrarTextoMrz("", null, log);
    mostrarFalhaLeituraMrz();
    return false;
  }

  return processarImagemDocumentoEtapa3(imagem, opcoes);

  const { guardarOriginal = true, imagemJaRecortada = false } = opcoes;
  const log = criarLogMrz(imagem);
  document.querySelector(".mrz-log-images")?.remove();
  if (guardarOriginal) {
    mrzImagemOriginal = opcoes.imagemOriginalLog || imagem;
    esconderRecorteManualMrz();
  }
  mostrarProgressoMrz(true);
  atualizarEstadoMrz((traducoes[linguaAtual] || traducoes.pt).leituraEmCurso || "");
  atualizarProgressoMrz(0);
  await adicionarImagensLogMrz(log, opcoes.imagemOriginalLog || imagem, opcoes.imagemLeituraLog || imagem);

  if (window.MRZ_CLIENT_SCANNER === "alsenet-v2") {
    const lidoNoBrowser = await processarImagemDocumentoAlsenet(imagem, log);
    if (lidoNoBrowser) return true;
  }

  return processarImagemDocumentoTesseract(imagem, log, { imagemJaRecortada });
}

async function processarImagemDocumentoEtapa3(imagem, opcoes = {}) {
  const { guardarOriginal = true } = opcoes;
  const log = criarLogMrz(imagem);
  document.querySelector(".mrz-log-images")?.remove();

  adicionarDebugEntradaMrz(log, imagem, opcoes);

  if (guardarOriginal) {
    mrzImagemOriginal = opcoes.imagemOriginalLog || imagem;
    esconderRecorteManualMrz();
  }

  mostrarProgressoMrz(true);
  atualizarEstadoMrz((traducoes[linguaAtual] || traducoes.pt).leituraEmCurso || "");
  atualizarProgressoMrz(0);
  await adicionarImagensLogMrz(log, opcoes.imagemOriginalLog || imagem, opcoes.imagemLeituraLog || imagem);

  try {
    adicionarLogMrz(log, "Motor etapa 3", "A iniciar deteccao Duas fases: morfologia + OCR-B.");
    adicionarLogMrz(log, "Motor etapa 3", "A leitura usa apenas o ensemble seletivo por confianca dos quatro pipelines OCR-B/MRZ.");
    const resultado = await window.MrzStage3Reader.read(imagem, {
      lang: "ocrb",
      langPath: "./tessdata",
      timeoutMs: 25000,
      roiLang: "ocrb",
      roiLangPath: "./tessdata",
      roiTimeoutMs: 8000,
      onStatus: mensagem => {
        if (mensagem) adicionarLogMrz(log, "Etapa 3", mensagem);
      },
      onProgress: atualizarProgressoMrz
    });

    if (resultado.roi && resultado.imageSize) {
      adicionarLogMrz(log, "ROI etapa 3", `x=${Math.round((resultado.roi.x / resultado.imageSize.width) * 1000) / 10}%, y=${Math.round((resultado.roi.y / resultado.imageSize.height) * 1000) / 10}%, w=${Math.round((resultado.roi.w / resultado.imageSize.width) * 1000) / 10}%, h=${Math.round((resultado.roi.h / resultado.imageSize.height) * 1000) / 10}%.`);
    }
    if (resultado.warning) adicionarLogMrz(log, "ROI etapa 3", resultado.warning);
    adicionarLogMrz(log, "Ensemble", resultado.ok ? "MRZ validada pelo metodo etapa 3." : "Sem MRZ valida no metodo etapa 3.");
    if (resultado.results?.length) {
      adicionarLogMrz(log, "Pipelines", resultado.results.map(item => `${item.pipelineName}: ${item.trust?.label || item.error || "sem estado"}`).join(" | "));
    }
    adicionarDebugResultadoEtapa3Mrz(log, resultado);

    mostrarTextoMrz(resultado.text || resultado.rawText || "", resultado.formData, log);

    if (!resultado.ok || !resultado.formData) {
      if (!opcoes.silenciosoAoFalhar) mostrarFalhaLeituraMrz();
      return false;
    }

    finalizarLeituraMrz(resultado.text, resultado.formData, log);
    return true;
  } catch (error) {
    console.warn("Erro no leitor MRZ etapa 3:", error);
    adicionarLogMrz(log, "Erro etapa 3", error?.message || String(error));
    mostrarTextoMrz("", null, log);
    if (!opcoes.silenciosoAoFalhar) mostrarFalhaLeituraMrz();
    return false;
  }
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
      const dadosPorLinhas = tentarMapearLinhasAlsenet(result, log);
      if (dadosPorLinhas) {
        finalizarLeituraMrz((result?.ocrLines || []).join("\n"), dadosPorLinhas, log);
        return true;
      }
      mostrarTextoMrz((result?.ocrLines || []).join("\n"), null, log);
      mostrarFalhaLeituraMrz({ mostrarRecorte: false });
      return false;
    }

    if (result.parsed.valid === false) {
      console.warn("MRZ v2 com checksums invalidos:", result.parsed);
      adicionarLogMrz(log, "Checksum v2", "Parser devolveu MRZ invalida.");
      const dadosPorLinhas = tentarMapearLinhasAlsenet(result, log);
      if (dadosPorLinhas) {
        finalizarLeituraMrz((result.ocrLines || []).join("\n"), dadosPorLinhas, log);
        return true;
      }
      mostrarTextoMrz((result.ocrLines || []).join("\n"), null, log);
      mostrarFalhaLeituraMrz({ mostrarRecorte: false });
      return false;
    }

    adicionarLogMrz(log, "Checksum v2", `Estado do parser: ${result.parsed.valid === true ? "valido" : "nao informado"}.`);
    const dados = mapearResultadoAlsenet(result, log);

    if (!dados) {
      adicionarLogMrz(log, "Mapeamento", "MRZ encontrada, mas sem campos suficientes para preencher.");
      const dadosPorLinhas = tentarMapearLinhasAlsenet(result, log);
      if (dadosPorLinhas) {
        finalizarLeituraMrz((result.ocrLines || []).join("\n"), dadosPorLinhas, log);
        return true;
      }
      mostrarTextoMrz((result.ocrLines || []).join("\n"), null, log);
      mostrarFalhaLeituraMrz({ mostrarRecorte: false });
      return false;
    }

    finalizarLeituraMrz((result.ocrLines || []).join("\n"), dados, log);
    return true;
  } catch (error) {
    console.warn("Erro no leitor MRZ v2:", error);
    adicionarLogMrz(log, "Erro v2", error?.message || String(error));
    mostrarTextoMrz("", null, log);
    mostrarFalhaLeituraMrz({ mostrarRecorte: false });
    return false;
  }
}

function tentarMapearLinhasAlsenet(result, log) {
  const linhas = normalizarLinhasOcrAlsenet(result?.ocrLines || []);
  const texto = linhas.join("\n");
  if (!texto.trim()) return null;

  adicionarLogMrz(log, "Fallback v2", `Linhas normalizadas: ${linhas.map(linha => linha.length).join(", ")}.`);
  adicionarLogMrz(log, "Fallback v2", linhas.join(" | "));
  adicionarLogMrz(log, "Fallback v2", "A validar linhas OCR com parser local.");
  const dados = extrairDadosMrz(texto, log);
  if (dados) adicionarLogMrz(log, "Fallback v2", "Linhas OCR aceites pelo parser local.");
  return dados;
}

function normalizarLinhasOcrAlsenet(ocrLines) {
  return (ocrLines || [])
    .map((linha) => {
      if (typeof linha === "string") return linha;
      if (Array.isArray(linha)) return linha.join("");
      if (linha && typeof linha === "object") {
        return linha.text || linha.line || linha.value || linha.raw || JSON.stringify(linha);
      }
      return String(linha || "");
    })
    .map(limparLinhaMrz)
    .flatMap(dividirLinhaMrzColada)
    .filter(Boolean);
}

function limparLinhaMrz(linha) {
  return String(linha)
    .toUpperCase()
    .replace(/[Â«â€¹]/g, "<")
    .replace(/[«‹]/g, "<")
    .replace(/\s/g, "")
    .replace(/[^A-Z0-9<]/g, "");
}

function dividirLinhaMrzColada(linha) {
  if (linha.length <= 31) return [linha];

  const partes = [];
  for (let i = 0; i < linha.length; i += 30) {
    const parte = linha.slice(i, i + 30);
    if (parte.length >= 20 && parte.includes("<")) partes.push(parte);
  }
  return partes.length ? partes : [linha];
}

function finalizarLeituraMrz(texto, dados, log) {
  preencherCamposComMrz(dados);
  adicionarLogMrz(log, "Preenchimento", "Campos substituidos no formulario.");
  adicionarLogMrz(log, "Debug", "Popup mantido aberto apos sucesso para inspecao das imagens e logs.");
  mostrarTextoMrz(texto, dados, log);
  atualizarProgressoMrz(100);
  atualizarEstadoMrz("");
  esconderRecorteManualMrz();
  mostrarAvisoReverDadosMrz();
}

function mostrarAvisoReverDadosMrz() {
  const alerta = document.getElementById("mrz-form-alert");
  const texto = document.getElementById("mrz-form-alert-text");
  const t = traducoes[linguaAtual] || traducoes.pt;
  if (!alerta) return;
  if (texto) {
    texto.textContent = t.mrzAvisoReverDados || t.leituraSucesso || "";
  } else {
    alerta.textContent = t.mrzAvisoReverDados || t.leituraSucesso || "";
  }
  alerta.hidden = false;
  alerta.scrollIntoView({ behavior: "smooth", block: "center" });
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

async function processarImagemDocumentoTesseract(imagem, log, opcoes = {}) {
  try {
    adicionarLogMrz(log, "Fallback OCR", "A iniciar OCR local com Tesseract.");
    atualizarProgressoMrz(12);
    atualizarEstadoMrz("");
    const worker = await obterWorkerMrz();
    const tentativas = await prepararTentativasMrz(imagem, log, opcoes);
    adicionarLogMrz(log, "Fallback OCR", `${tentativas.length} preparacoes/crops gerados.`);
    let texto = "";
    let dados = null;

    for (const [index, tentativa] of tentativas.entries()) {
      atualizarProgressoMrz(20 + index * Math.floor(60 / Math.max(1, tentativas.length)));
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
      mostrarFalhaLeituraMrz();
      return false;
    }

    adicionarLogMrz(log, "Resultado", "MRZ local validada e campos preenchidos.");
    finalizarLeituraMrz(texto, dados, log);
    return true;
  } catch (error) {
    console.warn("Erro ao ler MRZ:", error);
    adicionarLogMrz(log, "Erro OCR", error?.message || String(error));
    mostrarTextoMrz("", null, log);
    mostrarFalhaLeituraMrz();
    return false;
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

async function prepararTentativasMrz(imagem, log, opcoes = {}) {
  if (opcoes.imagemJaRecortada) {
    adicionarLogMrz(log, "Deteccao MRZ", "Imagem ja recortada pela moldura/crop manual; sem procura adicional.");
    return prepararTentativasMrzRecortada(imagem);
  }

  const cropDetectado = await detectarZonaMrz(imagem);
  const tentativasDetectadas = [];

  if (cropDetectado) {
    adicionarLogMrz(log, "Deteccao MRZ", `Crop automatico: x=${cropDetectado.x.toFixed(3)}, y=${cropDetectado.y.toFixed(3)}, w=${cropDetectado.width.toFixed(3)}, h=${cropDetectado.height.toFixed(3)}.`);
    tentativasDetectadas.push(await prepararImagemMrz(imagem, {
      nome: "MRZ detetada automaticamente",
      ...cropDetectado,
      maxWidth: 2200,
      threshold: 132,
      contrast: 1.45
    }));
    tentativasDetectadas.push(await prepararImagemMrz(imagem, {
      nome: "MRZ detetada suave",
      ...cropDetectado,
      maxWidth: 2200,
      threshold: 122,
      contrast: 1.2
    }));
    tentativasDetectadas.push(await prepararImagemMrz(imagem, {
      nome: "MRZ detetada cinzento",
      ...cropDetectado,
      maxWidth: 2200,
      threshold: null,
      contrast: 1.65,
      sharpen: 0.75
    }));
  } else {
    adicionarLogMrz(log, "Deteccao MRZ", "Nenhum crop automatico encontrado.");
  }

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
  const zonaMrzCartao = await prepararImagemMrz(imagem, {
    nome: "zona MRZ cartao",
    x: 0.02,
    width: 0.96,
    y: 0.58,
    height: 0.31,
    maxWidth: 1900,
    threshold: 136,
    contrast: 1.35
  });
  const linhasMrzCartao = await prepararImagemMrz(imagem, {
    nome: "linhas MRZ cartao",
    x: 0.04,
    width: 0.94,
    y: 0.62,
    height: 0.22,
    maxWidth: 2100,
    threshold: 134,
    contrast: 1.4
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

  return [
    ...tentativasDetectadas,
    imagemRecortada,
    imagemRecortadaSuave,
    zonaMrzCartao,
    linhasMrzCartao,
    linhaMrz,
    linhaMrzBaixa,
    zonaInferior
  ];
}

async function prepararTentativasMrzRecortada(imagem) {
  const base = {
    x: 0,
    width: 1,
    y: 0,
    height: 1,
    maxWidth: 2200
  };

  return [
    await prepararImagemMrz(imagem, {
      nome: "MRZ recortada natural",
      ...base,
      threshold: null,
      contrast: 1.25,
      sharpen: 0
    }),
    await prepararImagemMrz(imagem, {
      nome: "MRZ recortada cinzento",
      ...base,
      threshold: null,
      contrast: 1.6,
      sharpen: 0.65
    }),
    await prepararImagemMrz(imagem, {
      nome: "MRZ recortada contraste",
      ...base,
      threshold: 132,
      contrast: 1.45
    }),
    await prepararImagemMrz(imagem, {
      nome: "MRZ recortada suave",
      ...base,
      threshold: 120,
      contrast: 1.2
    })
  ];
}

function detectarZonaMrz(imagem) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imagem);

    img.onload = () => {
      const width = 900;
      const height = Math.max(1, Math.round(img.naturalHeight * width / img.naturalWidth));
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const pixels = ctx.getImageData(0, 0, width, height).data;
      const rowScores = new Array(height).fill(0);
      const minY = Math.floor(height * 0.45);
      const maxY = Math.floor(height * 0.92);
      const minX = Math.floor(width * 0.02);
      const maxX = Math.floor(width * 0.98);

      for (let y = minY; y < maxY; y++) {
        let dark = 0;
        let columnsWithInk = 0;

        for (let x = minX; x < maxX; x += 2) {
          const i = (y * width + x) * 4;
          const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
          if (gray < 120) {
            dark++;
            columnsWithInk++;
          }
        }

        rowScores[y] = dark * (columnsWithInk / ((maxX - minX) / 2));
      }

      const smooth = rowScores.map((_, y) => {
        let total = 0;
        let count = 0;
        for (let dy = -3; dy <= 3; dy++) {
          const yy = y + dy;
          if (yy >= 0 && yy < height) {
            total += rowScores[yy];
            count++;
          }
        }
        return total / Math.max(1, count);
      });

      const peaks = [];
      const threshold = Math.max(...smooth.slice(minY, maxY)) * 0.28;
      let start = -1;

      for (let y = minY; y < maxY; y++) {
        if (smooth[y] > threshold && start < 0) start = y;
        if ((smooth[y] <= threshold || y === maxY - 1) && start >= 0) {
          const end = y;
          if (end - start >= 3) {
            const score = smooth.slice(start, end + 1).reduce((sum, value) => sum + value, 0);
            peaks.push({ start, end, center: (start + end) / 2, score });
          }
          start = -1;
        }
      }

      const mrz = escolherBandasMrz(peaks);
      URL.revokeObjectURL(url);

      if (!mrz) {
        resolve(null);
        return;
      }

      const y0 = Math.max(0, (mrz.start - height * 0.035) / height);
      const y1 = Math.min(1, (mrz.end + height * 0.04) / height);
      resolve({
        x: 0.03,
        width: 0.94,
        y: y0,
        height: Math.max(0.12, y1 - y0)
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

function escolherBandasMrz(peaks) {
  const candidates = peaks
    .filter(peak => peak.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .sort((a, b) => a.center - b.center);

  let best = null;
  for (let i = 0; i <= candidates.length - 3; i++) {
    const group = candidates.slice(i, i + 3);
    const gap1 = group[1].center - group[0].center;
    const gap2 = group[2].center - group[1].center;
    const regularity = Math.abs(gap1 - gap2);
    const score = group.reduce((sum, peak) => sum + peak.score, 0) - regularity * 12 + group[2].center * 0.8;

    if (!best || score > best.score) {
      best = {
        start: group[0].start,
        end: group[2].end,
        score
      };
    }
  }

  return best;
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
      const gray = new Float32Array(canvas.width * canvas.height);

      for (let i = 0; i < data.length; i += 4) {
        const cinza = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        gray[i / 4] = Math.max(0, Math.min(255, (cinza - 128) * opcoes.contrast + 128));
      }

      if (opcoes.sharpen) aplicarNitidezMrz(gray, canvas.width, canvas.height, opcoes.sharpen);

      for (let i = 0; i < data.length; i += 4) {
        const valor = gray[i / 4];
        const saida = opcoes.threshold === null ? valor : (valor > opcoes.threshold ? 255 : 0);
        data[i] = saida;
        data[i + 1] = saida;
        data[i + 2] = saida;
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

function aplicarNitidezMrz(gray, width, height, amount) {
  const original = new Float32Array(gray);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const blur = (
        original[i - width - 1] + original[i - width] + original[i - width + 1] +
        original[i - 1] + original[i] + original[i + 1] +
        original[i + width - 1] + original[i + width] + original[i + width + 1]
      ) / 9;
      gray[i] = Math.max(0, Math.min(255, original[i] + (original[i] - blur) * amount));
    }
  }
}

function criarLogMrz(imagem) {
  return [`[Inicio] ${new Date().toLocaleTimeString()} | ficheiro: ${imagem?.name || "captura-camera"} | ${Math.round((imagem?.size || 0) / 1024)} KB`];
}

function adicionarLogMrz(log, etapa, detalhe) {
  if (!log) return;
  log.push(`[${etapa}] ${detalhe}`);
}

function criarLogDinamicoMrz() {
  return [`[Inicio] ${new Date().toLocaleTimeString()} | leitura dinamica em tempo real`];
}

function adicionarLogDinamicoMrz(etapa, detalhe) {
  if (!mrzLeituraDinamicaLog) return;
  mrzLeituraDinamicaAcaoAtual = `[${etapa}] ${detalhe}`;
  mrzLeituraDinamicaLog.push(`[${new Date().toLocaleTimeString()}] [${etapa}] ${detalhe}`);
  mostrarLogDinamicoMrz();
}

function mostrarLogDinamicoMrz() {
  const result = document.getElementById("mrz-result");
  if (!result || !mrzLeituraDinamicaLog) return;
  result.textContent = `AGORA: ${mrzLeituraDinamicaAcaoAtual || "A preparar leitura dinamica..."}\n\nLOG DE LEITURA DINAMICA\n${mrzLeituraDinamicaLog.join("\n")}`;
  result.hidden = false;
  result.scrollTop = result.scrollHeight;
}

function adicionarImagemLogMrz(log, label, url, meta = "") {
  if (!MRZ_SHOW_DEBUG_LOG || !log || !url) return;
  log.push({
    type: "image",
    label: meta ? `${label} (${meta})` : label,
    url
  });
}

function adicionarDebugEntradaMrz(log, imagem, opcoes = {}) {
  if (!MRZ_SHOW_DEBUG_LOG) return;
  adicionarLogMrz(log, "Origem", opcoes.origem || "desconhecida");

  if (opcoes.debugCamera?.videoSize) {
    const { width, height, clientWidth, clientHeight } = opcoes.debugCamera.videoSize;
    adicionarLogMrz(log, "Camera", `video=${width}x${height}, elemento=${clientWidth}x${clientHeight}.`);
  }
  if (opcoes.debugCamera?.metodo) {
    adicionarLogMrz(log, "Camera captura", opcoes.debugCamera.metodo);
  }
  if (opcoes.debugCamera?.framesCapturados) {
    adicionarLogMrz(log, "Camera nitidez", `${opcoes.debugCamera.framesCapturados} frames analisados; escolhido frame ${opcoes.debugCamera.melhorFrame}; score=${opcoes.debugCamera.nitidez}.`);
  }
  if (opcoes.debugCamera?.viewport) {
    const { x, y, width, height } = opcoes.debugCamera.viewport;
    adicionarLogMrz(log, "Camera crop cover", `x=${x}, y=${y}, w=${width}, h=${height}.`);
  }
  if (opcoes.debugCamera?.frameVideoUrl) {
    adicionarImagemLogMrz(log, "Camera: frame bruto do video antes do crop", opcoes.debugCamera.frameVideoUrl);
  }
  if (opcoes.debugCamera?.melhorFrameUrl) {
    adicionarImagemLogMrz(log, "Camera: melhor frame escolhido para OCR", opcoes.debugCamera.melhorFrameUrl);
  }
}

function adicionarDebugResultadoEtapa3Mrz(log, resultado) {
  if (!MRZ_SHOW_DEBUG_LOG || !resultado?.debugImages?.length) return;

  for (const item of resultado.debugImages) {
    adicionarImagemLogMrz(log, item.label || "Debug OCR", item.url);
  }
}

function formatarLogMrz(log) {
  const linhas = (log || []).filter(item => typeof item === "string");
  return linhas.length ? `LOG DE LEITURA\n${linhas.join("\n")}\n\n` : "";
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
  if (!MRZ_SHOW_DEBUG_LOG) {
    document.querySelector(".mrz-log-images")?.remove();
    result.hidden = true;
    result.textContent = "";
    console.debug(`${formatarLogMrz(log)}${conteudo}`);
    return;
  }

  result.textContent = `${formatarLogMrz(log)}${conteudo}`;
  result.hidden = false;
  mostrarImagensLogMrz(log);
  console.debug(`${formatarLogMrz(log)}${conteudo}`);
}

function mostrarImagensLogMrz(log) {
  const result = document.getElementById("mrz-result");
  if (!result) return;
  document.querySelector(".mrz-log-images")?.remove();
  const imagens = (log || []).filter(item => item && typeof item === "object" && item.type === "image");
  if (!imagens.length) return;
  const wrapper = document.createElement("div");
  wrapper.className = "mrz-log-images";
  imagens.forEach(item => {
    const figure = document.createElement("figure");
    const img = document.createElement("img");
    const caption = document.createElement("figcaption");
    img.src = item.url;
    img.alt = item.label;
    caption.textContent = item.label;
    figure.append(img, caption);
    wrapper.appendChild(figure);
  });
  result.insertAdjacentElement("afterend", wrapper);
}

async function adicionarImagensLogMrz(log, imagemInteira, imagemLeitura) {
  if (!MRZ_SHOW_DEBUG_LOG) return;
  const t = traducoes[linguaAtual] || traducoes.pt;
  if (imagemInteira) {
    log.push({
      type: "image",
      label: t.mrzLogImagemInteira || "Imagem inteira usada como referencia",
      url: await criarPreviewImagemLogMrz(imagemInteira)
    });
  }
  if (imagemLeitura) {
    log.push({
      type: "image",
      label: t.mrzLogRecorteLeitura || "Imagem efetiva enviada para leitura OCR",
      url: await criarPreviewImagemLogMrz(imagemLeitura)
    });
  }
}

function criarPreviewImagemLogMrz(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const maxWidth = 520;
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nao foi possivel criar preview do log."));
    };
    img.src = url;
  });
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
    .map(limparLinhaMrz)
    .flatMap(dividirLinhaMrzColada)
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
    const linhas1 = gerarVariantesLinhaMrz(linhas[i], 30, repararLinhaMrz);
    const linhas2 = gerarVariantesLinhaMrz(linhas[i + 1], 30, repararLinhaMrz);
    const linhas3 = gerarVariantesLinhaMrz(linhas[i + 2], 30, repararLinhaNomeMrz);

    for (const linha1 of linhas1) {
      for (const linha2 of linhas2) {
        for (const linha3 of linhas3) {
          if (/^[IAC][A-Z<]/.test(linha1) && /^\d{6}/.test(linha2) && linha3.includes("<<")) {
            return [linha1, linha2, linha3];
          }
        }
      }
    }
  }

  return null;
}

function encontrarMrzTd1Parcial(linhas) {
  for (let i = 0; i <= linhas.length - 2; i++) {
    const linhas1 = gerarVariantesLinhaMrz(linhas[i], 30, repararLinhaMrz);
    const linhas2 = gerarVariantesLinhaMrz(linhas[i + 1], 30, repararLinhaMrz);

    for (const linha1 of linhas1) {
      for (const linha2 of linhas2) {
        if (/^[IAC][A-Z<]/.test(linha1) && /^\d{6}/.test(linha2)) {
          return [linha1, linha2];
        }
      }
    }
  }

  return null;
}

function gerarVariantesLinhaMrz(linha, tamanho, reparar) {
  const variantes = new Set([reparar(linha, tamanho)]);

  if (linha.length > tamanho) {
    for (let i = 0; i <= linha.length - tamanho; i++) {
      variantes.add(reparar(linha.slice(i, i + tamanho), tamanho));
    }
  }

  return [...variantes];
}

function repararLinhaMrz(linha, tamanho) {
  return corrigirSequenciasFillerMrz(linha)
    .padEnd(tamanho, "<")
    .slice(0, tamanho);
}

function repararLinhaNomeMrz(linha, tamanho) {
  let reparada = corrigirSequenciasFillerMrz(linha).padEnd(tamanho, "<").slice(0, tamanho);

  return reparada
    .replace(/K(?=<)/g, "<")
    .replace(/(?<=<)K(?=<)/g, "<")
    .replace(/[CL](?=[<CL]{2,}$)/g, "<")
    .replace(/(?<=<{2,})[CL](?=<*$)/g, "<");
}

function corrigirSequenciasFillerMrz(linha) {
  return String(linha || "")
    .replace(/[KLCI](?=[<KLCI]{2,})/g, "<")
    .replace(/(?<=[<KLCI]{2})[KLCI]/g, "<")
    .replace(/[KLCI]{4,}$/g, match => "<".repeat(match.length));
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
  const numeroPrincipal = limparCampoMrz(linha.slice(5, 14));
  if (linha[14] !== "<") return numeroPrincipal;

  const opcional = linha.slice(15, 30);
  const fimUtil = opcional.search(/<+$/);
  const util = fimUtil >= 0 ? opcional.slice(0, fimUtil) : opcional;
  if (util.length <= 1) return numeroPrincipal;

  return `${numeroPrincipal}${limparCampoMrz(util.slice(0, -1))}`;
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
    !validarDocumentoTd1(linha1) ||
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
  const checks = {
    documento: validarDocumentoTd1(linha1),
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

function validarDocumentoTd1(linha1) {
  const numeroDocumento = linha1.slice(5, 14);
  const digitoDocumento = linha1[14];
  const opcional1 = linha1.slice(15, 30);

  if (
    validarDigitoMrz(numeroDocumento, digitoDocumento) ||
    validarDigitoMrz(numeroDocumento + opcional1, digitoDocumento)
  ) {
    return true;
  }

  if (digitoDocumento !== "<") return false;

  const fimExtensao = opcional1.indexOf("<");
  if (fimExtensao <= 0) return false;

  const extensao = opcional1.slice(0, fimExtensao - 1);
  const digitoExtensao = opcional1.charAt(fimExtensao - 1);

  return (
    validarDigitoMrz(`${numeroDocumento}<${extensao}`, digitoExtensao) ||
    validarDigitoMrz(`${numeroDocumento}${extensao}`, digitoExtensao)
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
  return window.paisMrzNomeNaLista?.(codigo) || "";
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
  if (campoOrigem) campoOrigem.value = normalizarOrigemIdDocumento(origem);
}

function normalizarOrigemIdDocumento(origem) {
  const valor = String(origem || "").trim().toLowerCase();
  if (valor === "mrz" || valor.startsWith("mrz /") || valor.includes("leitura autom")) return "mrz";
  if (valor === "edited" || valor.includes("editado") || valor.includes("edited")) return "edited";
  if (valor === "manual" || valor.includes("manual")) return "manual";
  return "";
}

function textoOrigemIdDocumento(origem) {
  switch (normalizarOrigemIdDocumento(origem)) {
    case "mrz":
      return "MRZ / leitura automática";
    case "edited":
      return "MRZ, editado pelo hóspede";
    case "manual":
      return "Introduzido manualmente";
    default:
      return "";
  }
}

function monitorizarOrigemIdDocumento() {
  const campo = document.getElementById("id-number-input");
  const campoOrigem = document.getElementById("id-number-source");
  if (!campo || !campoOrigem) return;

  campo.addEventListener("input", () => {
    if (window.__mrzPreenchendoCampos) return;
    campoOrigem.value = normalizarOrigemIdDocumento(campoOrigem.value) === "mrz" ? "edited" : "manual";
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
  const mrzAlert = document.getElementById("mrz-form-alert");

  if (form) form.hidden = true;
  if (successScreen) successScreen.hidden = false;
  if (scanEntry) scanEntry.hidden = true;
  if (mrzAlert) mrzAlert.hidden = true;

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
    const origemIdNormalizada = normalizarOrigemIdDocumento(campoOrigemId?.value || "");
    if (campoOrigemId) campoOrigemId.value = origemIdNormalizada;
    idNumberInput.value = idNumberInput.value.trim().replace(/\s+/g, "").toUpperCase();
    data.set("idNumber", idNumberInput.value);
    data.set("idNumberSource", origemIdNormalizada);
    data.set("origemIdRaw", origemIdNormalizada);
    data.set("origemIdTexto", textoOrigemIdDocumento(origemIdNormalizada));
  }

  data.append("token", "CHECKIN2024");

  const actionUrl = "https://script.google.com/macros/s/AKfycbxvSnzBJKy-5q1ZIj-i07q7a0961mg0oB4zkQTCcRMKsj9wHdyMtfZsAQypWRXPa39m/exec";

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
    if (ficheiro) processarImagemGaleriaDocumento(ficheiro);
    event.target.value = "";
  });

  ["mrz-crop-x", "mrz-crop-y", "mrz-crop-w", "mrz-crop-h"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", atualizarCaixaRecorteMrz);
  });

  document.getElementById("mrz-modal")?.addEventListener("click", event => {
    if (event.target.id === "mrz-modal") fecharLeitorDocumento();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") fecharLeitorDocumento();
  });
}
