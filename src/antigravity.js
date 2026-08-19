/**
 * Pure functions and core engine for embedded Google Antigravity API integration.
 */

import crypto from 'node:crypto';

export const CONFIG = {
  CLIENT_ID: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
  CLIENT_SECRET: "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",
  TOKEN_ENDPOINT: "https://oauth2.googleapis.com/token",
  BASE_URL: "https://daily-cloudcode-pa.googleapis.com",
  USER_AGENT: "antigravity/hub/2.2.1 darwin/arm64",
  LOAD_CODE_ASSIST_PATH: "/v1internal:loadCodeAssist",
  ONBOARD_USER_PATH: "/v1internal:onboardUser",
  FETCH_MODELS_PATH: "/v1internal:fetchAvailableModels",
  GENERATE_CONTENT_PATH: "/v1internal:generateContent"
};

const tokenCache = new Map();

/**
 * Exchange Google refresh_token for a fresh access_token.
 * @param {string} refreshToken
 * @returns {Promise<{accessToken: string, expiresIn: number}>}
 */
export async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new Error("Missing ANTIGRAVITY_REFRESH_TOKEN. Please set it in .env or auths/antigravity.json");
  }

  const params = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,
    client_secret: CONFIG.CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const res = await fetch(CONFIG.TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600
  };
}

/**
 * Fetch Google Cloud Code project ID using the access token.
 * Automatically onboards new users to the free tier if no project ID is provisioned.
 * @param {string} accessToken
 * @returns {Promise<string>}
 */
export async function fetchProjectId(accessToken) {
  const res = await fetch(`${CONFIG.BASE_URL}${CONFIG.LOAD_CODE_ASSIST_PATH}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": CONFIG.USER_AGENT
    },
    body: JSON.stringify({
      metadata: { ideType: "ANTIGRAVITY" }
    })
  });

  if (!res.ok) {
    return "";
  }

  const data = await res.json();
  let projectId = (
    data.cloudaicompanionProject ||
    data.projectId ||
    data.project?.id ||
    ""
  );

  if (!projectId) {
    let tierId = "free-tier";
    if (Array.isArray(data.allowedTiers)) {
      for (const tier of data.allowedTiers) {
        if (tier?.isDefault && tier?.id) {
          tierId = tier.id;
          break;
        }
      }
    } else if (data.currentTier?.id) {
      tierId = data.currentTier.id;
    }

    try {
      const onboardRes = await fetch(`${CONFIG.BASE_URL}${CONFIG.ONBOARD_USER_PATH}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": CONFIG.USER_AGENT
        },
        body: JSON.stringify({
          tier_id: tierId,
          metadata: {
            ide_type: "ANTIGRAVITY",
            ide_name: "antigravity",
            ide_version: "2.2.1"
          }
        })
      });

      if (onboardRes.ok) {
        const onboardData = await onboardRes.json();
        projectId = (
          onboardData.response?.cloudaicompanionProject?.id ||
          (typeof onboardData.response?.cloudaicompanionProject === "string" ? onboardData.response.cloudaicompanionProject : "") ||
          onboardData.response?.projectId ||
          ""
        );
      }
    } catch {
      // Fallback silently if onboarding fails
    }
  }

  return projectId;
}

/**
 * Get valid accessToken and projectId (cached in memory).
 * @param {string} refreshToken
 * @returns {Promise<{accessToken: string, projectId: string}>}
 */
export async function getValidAuth(refreshToken) {
  const cached = tokenCache.get(refreshToken);
  const now = Date.now();

  if (cached && cached.expiresAt > now + 300000) { // 5 minutes skew buffer
    return { accessToken: cached.accessToken, projectId: cached.projectId };
  }

  const { accessToken, expiresIn } = await refreshAccessToken(refreshToken);
  const projectId = await fetchProjectId(accessToken);

  tokenCache.set(refreshToken, {
    accessToken,
    projectId,
    expiresAt: now + expiresIn * 1000
  });

  return { accessToken, projectId };
}

/**
 * Dynamically fetch available models from Google Cloud Code API.
 * @param {string} accessToken
 * @returns {Promise<Array<{id: string}>>}
 */
export async function fetchAvailableModels(accessToken) {
  try {
    const res = await fetch(`${CONFIG.BASE_URL}${CONFIG.FETCH_MODELS_PATH}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": CONFIG.USER_AGENT
      },
      body: JSON.stringify({})
    });

    if (!res.ok) return [];
    const data = await res.json();
    const modelSet = new Set();

    if (data.defaultAgentModelId) modelSet.add(data.defaultAgentModelId);
    if (Array.isArray(data.agentModelSorts)) {
      for (const sortItem of data.agentModelSorts) {
        for (const group of sortItem.groups || []) {
          for (const m of group.modelIds || []) {
            modelSet.add(m);
          }
        }
      }
    }
    if (Array.isArray(data.commandModelIds)) {
      for (const m of data.commandModelIds) modelSet.add(m);
    }
    if (Array.isArray(data.models)) {
      for (const m of data.models) {
        if (typeof m === "string") modelSet.add(m);
        else if (m.id) modelSet.add(m.id);
        else if (m.name) modelSet.add(m.name);
      }
    }

    return Array.from(modelSet).map((id) => ({ id }));
  } catch {
    return [];
  }
}

/**
 * Pure function: Convert OpenAI Chat Completion request object to Antigravity Gemini format.
 * @param {object} body
 * @param {string} projectId
 * @returns {object}
 */
export function openAIToAntigravity(body, projectId = "") {
  const modelInput = body.model || "gemini-3.5-flash-low";
  let model = modelInput;
  let thinkingLevel;

  const match = String(modelInput).match(/^(.+?)\s*\((low|medium|high|xhigh|max|minimal|none|auto|\d+)\)$/i);
  if (match) {
    model = `${match[1].trim()}-${match[2].toLowerCase()}`;
    thinkingLevel = match[2].toLowerCase();
  }

  const contents = [];
  let systemInstruction;

  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (msg.role === "system") {
        const sysText = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        systemInstruction = { parts: [{ text: sysText }] };
        continue;
      }

      const role = msg.role === "assistant" ? "model" : "user";
      const parts = [];

      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === "text") {
            parts.push({ text: item.text });
          } else if (item.type === "image_url" && item.image_url?.url) {
            const url = item.image_url.url;
            if (url.startsWith("data:")) {
              const [header, base64Data] = url.split(",");
              const mimeType = header.match(/data:(.*?);/)?.[1] || "image/jpeg";
              parts.push({ inlineData: { mimeType, data: base64Data } });
            }
          }
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }
  }

  const generationConfig = {};
  if (typeof body.temperature === "number") generationConfig.temperature = body.temperature;
  if (typeof body.top_p === "number") generationConfig.topP = body.top_p;
  if (typeof body.max_tokens === "number") generationConfig.maxOutputTokens = body.max_tokens;

  const effort = body.reasoning_effort ? String(body.reasoning_effort).toLowerCase() : thinkingLevel;
  if (effort) {
    const isBudget = /^\d+$/.test(effort);
    generationConfig.thinkingConfig = {
      thinkingBudget: effort === "auto" ? -1 : (isBudget ? Number(effort) : undefined),
      thinkingLevel: (!isBudget && effort !== "auto") ? effort : undefined,
      includeThoughts: effort !== "none"
    };
  }

  const requestId = `agent-${crypto.randomUUID()}`;
  const sessionId = `-${Math.floor(Math.random() * 9e15)}`;

  return {
    project: projectId,
    model: model,
    request: {
      contents,
      sessionId,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {})
    },
    userAgent: "antigravity",
    requestType: "agent",
    requestId
  };
}

/**
 * Pure function: Transform full Antigravity response to completion result object.
 * @param {object} rawData
 * @param {string} model
 * @returns {{content: string, usage: object, model: string}}
 */
export function antigravityToOpenAIJSON(rawData, model) {
  const resp = rawData?.response || rawData;
  const candidate = resp?.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  let textContent = "";

  for (const part of parts) {
    if (typeof part.text === "string") {
      textContent += part.text;
    }
  }

  return {
    content: textContent,
    usage: {
      prompt_tokens: resp?.usageMetadata?.promptTokenCount || 0,
      completion_tokens: resp?.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: resp?.usageMetadata?.totalTokenCount || 0
    },
    model: model
  };
}
