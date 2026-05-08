const CONFIG_KEY = "azure-podcast-demo-config-v1";

const configForm = document.getElementById("config-form");
const podcastForm = document.getElementById("podcast-form");
const statusBox = document.getElementById("status");
const ssmlOutput = document.getElementById("ssml-output");
const audioPlayer = document.getElementById("audio-player");
const generateButton = document.getElementById("generate-btn");

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

function setStatus(message) {
  statusBox.textContent = message;
}

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
  } catch {
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
    "- Verwende ein <speak>-Root Element und nur SSML ohne zusätzlichen Text.",
    "- Inhalt muss die wichtigsten Punkte aus der Quelle verständlich zusammenfassen.",
  ].join("\n");

  const body = {
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Quelle (bereinigter Text):\n${content.slice(0, 12000)}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 1700,
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.openaiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure OpenAI Fehler (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const rawContent = result?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") {
    throw new Error("Azure OpenAI hat kein SSML zurückgegeben.");
  }

  const ssmlMatch = rawContent.match(/<speak[\s\S]*<\/speak>/i);
  return ssmlMatch ? ssmlMatch[0] : rawContent.trim();
}

async function synthesizeAudio(ssml, config) {
  const speechEndpoint =
    config.speechEndpoint ||
    `https://${config.speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const response = await fetch(speechEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "Ocp-Apim-Subscription-Key": config.speechKey,
    },
    body: ssml,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure Speech Fehler (${response.status}): ${errorText}`);
  }

  return await response.blob();
}

function releaseAudioUrl() {
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = undefined;
  }
}

configForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveConfig(readConfig());
  setStatus("Konfiguration lokal gespeichert.");
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
    const ssml = await generateSsmlWithAzureOpenAI(websiteText, config);
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
