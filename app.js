const CONFIG_KEY = "azure-podcast-demo-config-v1";
const MAX_SOURCE_CONTENT_LENGTH = 12000;
const MAX_SSML_RESPONSE_TOKENS = 1700;
const MAX_LOG_ENTRIES = 30;
const LOG_TEXT_PREVIEW_LENGTH = 2500;

const configForm = document.getElementById("config-form");
const podcastForm = document.getElementById("podcast-form");
const statusBox = document.getElementById("status");
const ssmlOutput = document.getElementById("ssml-output");
const audioPlayer = document.getElementById("audio-player");
const generateButton = document.getElementById("generate-btn");
const clearLogsButton = document.getElementById("clear-logs-btn");
const logList = document.getElementById("log-list");

let currentAudioUrl;

const fields = {
  openaiEndpoint: document.getElementById("openai-endpoint"),
  openaiKey: document.getElementById("openai-key"),
  openaiDeployment: document.getElementById("openai-deployment"),
  openaiVersion: document.getElementById("openai-version"),
  speechKey: document.getElementById("speech-key"),
  speechRegion: document.getElementById("speech-region"),
  speechEndpoint: document.getElementById("speech-endpoint"),
  voice1: document.getElementById("voice-1"),
  voice2: document.getElementById("voice-2"),
  proxyTemplate: document.getElementById("proxy-template"),
  sourceUrl: document.getElementById("source-url"),
};

// ── Overlay panels ─────────────────────────────────────────────────────────

const backdrop = document.getElementById("overlay-backdrop");
const overlayConfig = document.getElementById("overlay-config");
const overlayLogs = document.getElementById("overlay-logs");
const btnConfig = document.getElementById("btn-config");
const btnLogs = document.getElementById("btn-logs");
const closeConfig = document.getElementById("close-config");
const closeLogs = document.getElementById("close-logs");

function openOverlay(panel, triggerBtn) {
  closeAllOverlays();
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");
  if (triggerBtn) triggerBtn.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

function closeAllOverlays() {
  [overlayConfig, overlayLogs].forEach((p) => {
    p.classList.remove("open");
    p.setAttribute("aria-hidden", "true");
  });
  [btnConfig, btnLogs].forEach((b) => b.setAttribute("aria-expanded", "false"));
  backdrop.classList.remove("open");
  backdrop.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

btnConfig.addEventListener("click", () => {
  if (overlayConfig.classList.contains("open")) {
    closeAllOverlays();
  } else {
    openOverlay(overlayConfig, btnConfig);
  }
});

btnLogs.addEventListener("click", () => {
  if (overlayLogs.classList.contains("open")) {
    closeAllOverlays();
  } else {
    openOverlay(overlayLogs, btnLogs);
  }
});

closeConfig.addEventListener("click", closeAllOverlays);
closeLogs.addEventListener("click", closeAllOverlays);
backdrop.addEventListener("click", closeAllOverlays);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAllOverlays();
});

// ── Status ─────────────────────────────────────────────────────────────────

function setStatus(message) {
  statusBox.textContent = message;
}

// ── Log helpers ────────────────────────────────────────────────────────────

function clearInitialLogPlaceholder() {
  const onlyPlaceholder =
    logList.children.length === 1 &&
    logList.firstElementChild?.classList.contains("hint");
  if (onlyPlaceholder) {
    logList.innerHTML = "";
  }
}

function trimLogText(value) {
  if (typeof value !== "string") {
    return value;
  }
  if (value.length <= LOG_TEXT_PREVIEW_LENGTH) {
    return value;
  }
  return `${value.slice(0, LOG_TEXT_PREVIEW_LENGTH)}… [gekürzt]`;
}

function toLogString(payload) {
  if (payload === undefined) {
    return "";
  }
  if (typeof payload === "string") {
    return trimLogText(payload);
  }
  return trimLogText(JSON.stringify(payload, null, 2));
}

function toHeaderLogObject(headers) {
  const headerEntries = Array.from(headers.entries());
  if (headerEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    headerEntries.map(([name, value]) => [name, trimLogText(value)])
  );
}

function renderNoLogsPlaceholder() {
  const placeholder = document.createElement("p");
  placeholder.className = "hint";
  placeholder.textContent = "Noch keine Logs vorhanden.";
  return placeholder;
}

function appendServiceLog({
  service,
  direction,
  url,
  method,
  status,
  request,
  response,
  error,
}) {
  clearInitialLogPlaceholder();

  const details = document.createElement("details");
  details.className = "log-entry";

  const summary = document.createElement("summary");
  const statusPart = status ? ` · HTTP ${status}` : "";
  const errorPart = error ? " · Fehler" : "";
  summary.textContent = `${new Date().toLocaleTimeString()} · ${service} · ${direction}${statusPart}${errorPart}`;
  details.append(summary);

  const meta = document.createElement("div");
  meta.className = "log-meta";
  meta.textContent = `${method} ${url}`;
  details.append(meta);

  if (request !== undefined) {
    const reqTitle = document.createElement("strong");
    reqTitle.textContent = "Request";
    details.append(reqTitle);

    const reqBody = document.createElement("pre");
    reqBody.textContent = toLogString(request);
    details.append(reqBody);
  }

  if (response !== undefined) {
    const resTitle = document.createElement("strong");
    resTitle.textContent = "Response";
    details.append(resTitle);

    const resBody = document.createElement("pre");
    resBody.textContent = toLogString(response);
    details.append(resBody);
  }

  if (error) {
    const errTitle = document.createElement("strong");
    errTitle.textContent = "Error";
    details.append(errTitle);

    const errBody = document.createElement("pre");
    errBody.textContent = error;
    details.append(errBody);
  }

  logList.prepend(details);
  while (logList.children.length > MAX_LOG_ENTRIES) {
    logList.removeChild(logList.lastElementChild);
  }
}

// ── Config helpers ─────────────────────────────────────────────────────────

function sanitizeEndpoint(value) {
  return value.trim().replace(/\/+$/, "");
}

function loadConfig() {
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
    for (const [key, input] of Object.entries(fields)) {
      if (key === "sourceUrl") {
        continue;
      }
      if (typeof config[key] === "string") {
        input.value = config[key];
      }
    }
  } catch (error) {
    console.error("Fehler beim Laden der Konfiguration aus localStorage.", error);
    setStatus("Gespeicherte Konfiguration konnte nicht geladen werden.");
  }
}

function readConfig() {
  return {
    openaiEndpoint: sanitizeEndpoint(fields.openaiEndpoint.value),
    openaiKey: fields.openaiKey.value.trim(),
    openaiDeployment: fields.openaiDeployment.value.trim(),
    openaiVersion: fields.openaiVersion.value.trim() || "2024-02-15-preview",
    speechKey: fields.speechKey.value.trim(),
    speechRegion: fields.speechRegion.value.trim(),
    speechEndpoint: sanitizeEndpoint(fields.speechEndpoint.value),
    voice1: fields.voice1.value.trim() || "de-DE-KatjaNeural",
    voice2: fields.voice2.value.trim() || "de-DE-ConradNeural",
    proxyTemplate: fields.proxyTemplate.value.trim(),
  };
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function getProxyUrl(template, url) {
  if (!template) {
    return "";
  }
  const encodedUrl = encodeURIComponent(url);
  return template.includes("{url}")
    ? template.replaceAll("{url}", encodedUrl)
    : `${template}${template.includes("?") ? "&" : "?"}url=${encodedUrl}`;
}

function normalizeContentToText(raw) {
  const looksLikeHtml = /<html|<body|<p|<h\d|<div/i.test(raw);
  const text = looksLikeHtml
    ? new DOMParser().parseFromString(raw, "text/html").body?.textContent || ""
    : raw;
  return text.replace(/\s+/g, " ").trim();
}

// ── Network calls ──────────────────────────────────────────────────────────

async function fetchWebsiteText(url, proxyTemplate) {
  try {
    const directResponse = await fetch(url, { method: "GET" });
    if (directResponse.ok) {
      return normalizeContentToText(await directResponse.text());
    }
  } catch {
    // Fallback auf Proxy
  }

  const proxyUrl = getProxyUrl(proxyTemplate, url);
  if (!proxyUrl) {
    throw new Error(
      "Direkter Zugriff fehlgeschlagen. Bitte einen CORS-Proxy in der Konfiguration hinterlegen."
    );
  }

  const proxyResponse = await fetch(proxyUrl, { method: "GET" });
  if (!proxyResponse.ok) {
    throw new Error(`Proxy-Request fehlgeschlagen (${proxyResponse.status}).`);
  }

  return normalizeContentToText(await proxyResponse.text());
}

async function generateSsmlWithAzureOpenAI(content, config) {
  const apiUrl = `${config.openaiEndpoint}/openai/deployments/${encodeURIComponent(
    config.openaiDeployment
  )}/chat/completions?api-version=${encodeURIComponent(config.openaiVersion)}`;

  const prompt = [
    "Erzeuge ausschließlich valides SSML für den Azure Speech Service.",
    "Anforderungen:",
    "- Sprache: Deutsch",
    "- Dauer: etwa 2 Minuten",
    "- Format: Podcast mit zwei Speakern, die sich abwechseln",
    `- Verwende für Speaker 1 die Stimme ${config.voice1}`,
    `- Verwende für Speaker 2 die Stimme ${config.voice2}`,
    `- Das <speak>-Root-Element muss die Attribute version="1.0", xml:lang und xmlns="http://www.w3.org/2001/10/synthesis" enthalten, z. B.: <speak version="1.0" xml:lang="de-DE" xmlns="http://www.w3.org/2001/10/synthesis">`,
    "- Schreibe nur valides SSML ohne zusätzlichen Text oder Markdown.",
    "- Inhalt muss die wichtigsten Punkte aus der Quelle verständlich zusammenfassen.",
  ].join("\n");

  const body = {
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Quelle (bereinigter Text):\n${content.slice(
          0,
          MAX_SOURCE_CONTENT_LENGTH
        )}`,
      },
    ],
    temperature: 0.4,
    max_tokens: MAX_SSML_RESPONSE_TOKENS,
  };

  const requestPayloadForLog = {
    ...body,
    messages: body.messages.map((message) =>
      message.role === "user"
        ? { ...message, content: trimLogText(message.content) }
        : message
    ),
  };

  let response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": config.openaiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    appendServiceLog({
      service: "Azure OpenAI",
      direction: "request/response",
      url: apiUrl,
      method: "POST",
      request: requestPayloadForLog,
      error: `Netzwerkfehler: ${networkError.message}`,
    });
    throw networkError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    appendServiceLog({
      service: "Azure OpenAI",
      direction: "request/response",
      url: apiUrl,
      method: "POST",
      status: response.status,
      request: requestPayloadForLog,
      response: trimLogText(errorText),
      error: `Azure OpenAI Fehler (${response.status})`,
    });
    throw new Error(`Azure OpenAI Fehler (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  appendServiceLog({
    service: "Azure OpenAI",
    direction: "request/response",
    url: apiUrl,
    method: "POST",
    status: response.status,
    request: requestPayloadForLog,
    response: result,
  });

  const aiGeneratedContent = result?.choices?.[0]?.message?.content;
  if (!aiGeneratedContent || typeof aiGeneratedContent !== "string") {
    throw new Error("Azure OpenAI hat kein SSML zurückgegeben.");
  }

  const ssmlMatch = aiGeneratedContent.match(/<speak[\s\S]*?<\/speak>/i);
  return ssmlMatch ? ssmlMatch[0] : aiGeneratedContent.trim();
}

function normalizeSsml(ssml, lang) {
  // Azure TTS requires version, xml:lang and xmlns on the <speak> root element.
  // If the AI omits any of them the service returns HTTP 400, so we inject them
  // as a post-processing safety net.
  return ssml.replace(/<speak(\b[^>]*)>/i, (_match, existingAttrs) => {
    let attrs = existingAttrs || "";
    if (!/\bversion\s*=/.test(attrs)) {
      attrs += ' version="1.0"';
    }
    if (!/\bxml:lang\s*=/.test(attrs)) {
      attrs += ` xml:lang="${lang}"`;
    }
    if (!/\bxmlns\s*=/.test(attrs)) {
      attrs += ' xmlns="http://www.w3.org/2001/10/synthesis"';
    }
    return `<speak${attrs}>`;
  });
}

/**
 * Extract the BCP-47 locale prefix from an Azure TTS voice name.
 * Azure voice names follow the pattern "<language>-<region>-<VoiceName>Neural",
 * e.g. "de-DE-KatjaNeural" → "de-DE".  Falls back to "de-DE" when the name
 * does not match the expected format.
 *
 * @param {string} voiceName
 * @returns {string}
 */
function localeFromVoiceName(voiceName) {
  const match = voiceName.match(/^([a-z]{2}-[A-Z]{2})\b/i);
  return match ? match[1] : "de-DE";
}

function buildSpeechEndpoint(endpoint, region) {
  if (!endpoint) {
    return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  }
  try {
    const url = new URL(endpoint);
    if (url.pathname === "/" || url.pathname === "") {
      return `${endpoint}/cognitiveservices/v1`;
    }
  } catch {
    // Invalid URL – use as-is and let the fetch surface the error
  }
  return endpoint;
}

async function synthesizeAudio(ssml, config) {
  const speechEndpoint = buildSpeechEndpoint(
    config.speechEndpoint,
    config.speechRegion
  );

  const requestPayloadForLog = {
    endpoint: speechEndpoint,
    configuredRegion: config.speechRegion,
    configuredCustomEndpoint: config.speechEndpoint || "(Standard aus Region)",
    requestHeaders: {
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
    },
    outputFormat: "audio-24khz-96kbitrate-mono-mp3",
    ssmlPreview: trimLogText(ssml),
  };

  let response;
  try {
    response = await fetch(speechEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "Ocp-Apim-Subscription-Key": config.speechKey,
      },
      body: ssml,
    });
  } catch (networkError) {
    appendServiceLog({
      service: "Azure Speech",
      direction: "request/response",
      url: speechEndpoint,
      method: "POST",
      request: requestPayloadForLog,
      error: `Netzwerkfehler (CORS oder Verbindungsproblem): ${networkError.message}`,
    });
    throw new Error(
      `Azure Speech Netzwerkfehler: ${networkError.message}. ` +
        `Prüfe die Endpoint-URL (${speechEndpoint}) und ob der Azure Speech Service ` +
        `CORS-Anfragen aus dem Browser erlaubt.`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    const responsePayloadForLog = {
      statusText: response.statusText || "(leer)",
      headers: toHeaderLogObject(response.headers),
      body: errorText ? trimLogText(errorText) : "[leerer Response-Body]",
    };
    const troubleshootingHints = [];
    if (response.status === 400) {
      troubleshootingHints.push(
        "HTTP 400 bei Azure Speech bedeutet meist ungültiges SSML oder einen unpassenden Speech-Endpoint."
      );
      if (!errorText) {
        troubleshootingHints.push(
          "Der Service hat keinen Response-Body geliefert; nutze deshalb die geloggten Response-Header (z. B. request IDs) für die Azure-Fehlersuche."
        );
      }
    }
    appendServiceLog({
      service: "Azure Speech",
      direction: "request/response",
      url: speechEndpoint,
      method: "POST",
      status: response.status,
      request: requestPayloadForLog,
      response: responsePayloadForLog,
      error: `Azure Speech Fehler (${response.status})`,
    });
    throw new Error(
      [
        `Azure Speech Fehler (${response.status})${response.statusText ? ` ${response.statusText}` : ""}.`,
        errorText
          ? `Antwort: ${trimLogText(errorText)}`
          : "Der Response-Body war leer. Bitte prüfe die Debug-Logs für Header und Request-Details.",
        ...troubleshootingHints,
      ].join(" ")
    );
  }

  const audioBlob = await response.blob();
  appendServiceLog({
    service: "Azure Speech",
    direction: "request/response",
    url: speechEndpoint,
    method: "POST",
    status: response.status,
    request: requestPayloadForLog,
    response: {
      type: audioBlob.type || "audio/mpeg",
      sizeBytes: audioBlob.size,
    },
  });
  return audioBlob;
}

function releaseAudioUrl() {
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = undefined;
  }
}

// ── Event listeners ────────────────────────────────────────────────────────

configForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveConfig(readConfig());
  setStatus("Konfiguration lokal gespeichert.");
  closeAllOverlays();
});

clearLogsButton.addEventListener("click", () => {
  logList.replaceChildren(renderNoLogsPlaceholder());
});

podcastForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const config = readConfig();
  const sourceUrl = fields.sourceUrl.value.trim();
  if (!sourceUrl) {
    setStatus("Bitte eine Website-URL angeben.");
    return;
  }

  if (!config.openaiEndpoint || !config.openaiKey || !config.openaiDeployment) {
    setStatus("Bitte Azure OpenAI Konfiguration vollständig ausfüllen.");
    return;
  }

  if (!config.speechKey || !config.speechRegion) {
    setStatus("Bitte Azure Speech Konfiguration vollständig ausfüllen.");
    return;
  }

  generateButton.disabled = true;
  setStatus("Lade Website-Inhalt...");
  ssmlOutput.value = "";
  releaseAudioUrl();
  audioPlayer.removeAttribute("src");
  audioPlayer.load();

  try {
    const websiteText = await fetchWebsiteText(sourceUrl, config.proxyTemplate);
    if (!websiteText) {
      throw new Error("Es konnte kein verwertbarer Website-Inhalt gelesen werden.");
    }

    setStatus("Erzeuge SSML mit Azure OpenAI...");
    const rawSsml = await generateSsmlWithAzureOpenAI(websiteText, config);
    const ssml = normalizeSsml(rawSsml, localeFromVoiceName(config.voice1));
    ssmlOutput.value = ssml;

    setStatus("Erzeuge Audio mit Azure Speech...");
    const audioBlob = await synthesizeAudio(ssml, config);
    currentAudioUrl = URL.createObjectURL(audioBlob);
    audioPlayer.src = currentAudioUrl;
    audioPlayer.load();

    setStatus("Fertig: SSML und Audio wurden erstellt.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unerwarteter Fehler.");
  } finally {
    generateButton.disabled = false;
  }
});

loadConfig();
