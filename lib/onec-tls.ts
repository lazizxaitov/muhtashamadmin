import fs from "node:fs";
import https from "node:https";
import { URL } from "node:url";

export class OnecTlsConfigError extends Error {
  override name = "OnecTlsConfigError";
}

let cachedCaPath: string | null = null;
let cachedAgent: https.Agent | null = null;

export const getOneCHttpsAgent = () => {
  const caPath = (process.env.ONEC_CA_CERT_PATH ?? "").trim();
  if (!caPath) {
    throw new OnecTlsConfigError(
      "Missing ONEC_CA_CERT_PATH env var (path to .crt trusted CA for 1C)."
    );
  }

  if (cachedAgent && cachedCaPath === caPath) {
    return cachedAgent;
  }

  const ca = fs.readFileSync(caPath);
  cachedAgent = new https.Agent({ ca });
  cachedCaPath = caPath;
  return cachedAgent;
};

export const isOnecTlsError = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return false;
  return [
    "SELF_SIGNED_CERT_IN_CHAIN",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "CERT_HAS_EXPIRED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
  ].includes(code);
};

export const pingOnecBaseUrl = async (onecBaseUrl: string, timeoutMs = 7000) => {
  const url = new URL(onecBaseUrl);
  if (url.protocol !== "https:") {
    return;
  }

  const agent = getOneCHttpsAgent();

  await new Promise<void>((resolve, reject) => {
    const request = https.request(
      url,
      { method: "GET", agent, headers: { Connection: "close" } },
      (response) => {
        response.resume();
        resolve();
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("1C request timed out."));
    });

    request.on("error", reject);
    request.end();
  });
};

