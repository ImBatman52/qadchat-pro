import { XAI_BASE_URL, ApiPath, ModelProvider } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth";

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[XAI Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const authResult = auth(req, ModelProvider.XAI);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  try {
    const response = await request(req, authResult.useServerConfig);
    return response;
  } catch (e) {
    console.error("[XAI] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

async function request(req: NextRequest, useServerConfig?: boolean) {
  const controller = new AbortController();

  // xai use base url or just remove the path
  let path = `${req.nextUrl.pathname}`.replaceAll(ApiPath.XAI, "");

  let baseUrl = useServerConfig
    ? process.env.XAI_BASE_URL || XAI_BASE_URL
    : XAI_BASE_URL;

  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  console.log("[Proxy] ", path);
  console.log("[Base Url]", baseUrl);

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    10 * 60 * 1000,
  );

  const fetchUrl = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 设置 Authorization
  if (useServerConfig) {
    const serverApiKey = process.env.XAI_API_KEY || "";
    headers["Authorization"] = `Bearer ${serverApiKey}`;
  } else {
    headers["Authorization"] = req.headers.get("Authorization") ?? "";
  }

  const fetchOptions: RequestInit = {
    headers,
    method: req.method,
    body: req.body,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  // 纯前端应用，不限制模型使用，由用户API密钥权限决定
  try {
    const res = await fetch(fetchUrl, fetchOptions);

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    // to disable nginx buffering
    newHeaders.set("X-Accel-Buffering", "no");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
