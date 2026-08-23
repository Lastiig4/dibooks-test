import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScannableNode = {
  nodeId: string;
  text: string;
};

type ModerationResult = {
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
};

type AutoFlag = {
  node_id: string;
  category: string;
  severity: "low" | "medium" | "high";
  reason: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  harassment: "Intimidatie / belediging",
  "harassment/threatening": "Bedreigende intimidatie",
  hate: "Haatdragende inhoud",
  "hate/threatening": "Bedreigende haat",
  illicit: "Illegale of gevaarlijke instructies",
  "illicit/violent": "Gewelddadige illegale instructies",
  "self-harm": "Zelfbeschadiging",
  "self-harm/intent": "Intentie tot zelfbeschadiging",
  "self-harm/instructions": "Instructies voor zelfbeschadiging",
  sexual: "Seksuele inhoud",
  "sexual/minors": "Seksuele inhoud met minderjarigen",
  violence: "Geweld",
  "violence/graphic": "Grafisch geweld",
};

function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getNodeType(node: any) {
  return String(node?.data?.type ?? node?.type ?? "").toLowerCase();
}

function extractNodeText(node: any): ScannableNode | null {
  const nodeId = String(node?.id ?? "").trim();
  if (!nodeId) return null;

  const data = node?.data ?? {};
  const content = node?.content ?? {};
  const type = getNodeType(node);

  // Utility-nodes bevatten nauwelijks lezerscontent en veroorzaken anders
  // onnodige ruis in de scan.
  if (type === "function" || type === "condition" || type === "scratchpad") {
    return null;
  }

  const choices = Array.isArray(data.choices ?? content.choices ?? node?.choices)
    ? (data.choices ?? content.choices ?? node?.choices)
        .map((choice: any) => String(choice?.label ?? ""))
        .filter(Boolean)
        .join(" | ")
    : "";

  const parts = [
    data.label,
    node?.title,
    node?.label,
    data.text,
    data.textHtml,
    content.text,
    content.textHtml,
    node?.text,
    node?.textHtml,
    data.specialSubtype,
    content.specialSubtype,
    choices,
  ];

  const text = stripHtml(parts.filter(Boolean).join("\n"));
  if (text.length < 3) return null;

  // Voorkomt extreem grote individuele payloads. Voor node-moderatie is
  // het begin + midden/einde ruim voldoende voor een eerste menselijke vlag.
  const clipped =
    text.length <= 24000
      ? text
      : `${text.slice(0, 16000)}\n[…]\n${text.slice(-8000)}`;

  return {
    nodeId,
    text: clipped,
  };
}

function severityForScore(score: number, category: string): "low" | "medium" | "high" {
  if (
    category === "sexual/minors" ||
    category === "self-harm/instructions" ||
    category === "hate/threatening" ||
    category === "illicit/violent"
  ) {
    return score >= 0.5 ? "high" : "medium";
  }

  if (score >= 0.8) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function flagsFromResult(nodeId: string, result: ModerationResult): AutoFlag[] {
  const categories = result?.categories ?? {};
  const scores = result?.category_scores ?? {};

  return Object.entries(categories)
    .filter(([, flagged]) => flagged === true)
    .map(([category]) => {
      const score = Number(scores[category] ?? 0);
      const percentage = Math.max(0, Math.min(100, Math.round(score * 100)));
      const label = CATEGORY_LABELS[category] ?? category;

      return {
        node_id: nodeId,
        category: label,
        severity: severityForScore(score, category),
        reason:
          `Automatische moderatiescan markeerde deze node voor menselijke controle: ${label}` +
          (Number.isFinite(score) ? ` (${percentage}% modelsignaal).` : "."),
      };
    });
}

async function callOpenAIModeration(apiKey: string, inputs: string[]) {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: inputs,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `OpenAI Moderation API gaf ${response.status}${message ? `: ${message.slice(0, 500)}` : ""}`,
    );
  }

  const payload = await response.json();
  return Array.isArray(payload?.results) ? (payload.results as ModerationResult[]) : [];
}

async function moderateNodes(apiKey: string, nodes: ScannableNode[]) {
  const allResults: Array<{ node: ScannableNode; result: ModerationResult }> = [];
  const batchSize = 24;

  for (let index = 0; index < nodes.length; index += batchSize) {
    const batch = nodes.slice(index, index + batchSize);

    try {
      const results = await callOpenAIModeration(
        apiKey,
        batch.map((node) => node.text),
      );

      if (results.length !== batch.length) {
        throw new Error("Batch-resultaat had een onverwacht aantal moderatie-items.");
      }

      batch.forEach((node, batchIndex) => {
        allResults.push({
          node,
          result: results[batchIndex] ?? {},
        });
      });
    } catch (batchError) {
      // Compatibiliteitsfallback: als een provider/model een batch-array niet
      // accepteert, scannen we deze kleine batch per node.
      for (const node of batch) {
        const results = await callOpenAIModeration(apiKey, [node.text]);
        allResults.push({
          node,
          result: results[0] ?? {},
        });
      }
    }
  }

  return allResults;
}

function createAuthedSupabase(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase serverconfiguratie ontbreekt.");
  }

  return createClient(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return NextResponse.json(
      { message: "Login vereist voor moderatiescan." },
      { status: 401 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        message:
          "OPENAI_API_KEY ontbreekt op de server. Stel deze in via Vercel Environment Variables en lokaal in .env.local.",
      },
      { status: 503 },
    );
  }

  let submissionId = "";

  try {
    const body = await request.json();
    submissionId = String(body?.submissionId ?? "").trim();
  } catch {
    return NextResponse.json({ message: "Ongeldige request." }, { status: 400 });
  }

  if (!submissionId) {
    return NextResponse.json({ message: "submissionId ontbreekt." }, { status: 400 });
  }

  try {
    const supabase = createAuthedSupabase(accessToken);

    const { data: submission, error: submissionError } = await supabase
      .from("moderation_submissions")
      .select("id,status,snapshot")
      .eq("id", submissionId)
      .maybeSingle();

    if (submissionError) throw submissionError;
    if (!submission) {
      return NextResponse.json(
        { message: "Reviewinzending niet gevonden of geen toegang." },
        { status: 404 },
      );
    }

    if (submission.status !== "pending") {
      return NextResponse.json(
        { message: "Alleen een inzending in afwachting kan opnieuw worden gescand." },
        { status: 409 },
      );
    }

    const rawNodes = Array.isArray(submission.snapshot?.projectData?.nodes)
      ? submission.snapshot.projectData.nodes
      : [];

    const scannableNodes = rawNodes
      .map(extractNodeText)
      .filter((node: ScannableNode | null): node is ScannableNode => !!node);

    if (scannableNodes.length === 0) {
      const { error: saveEmptyError } = await supabase.rpc(
        "replace_auto_moderation_flags",
        {
          input_submission_id: submissionId,
          input_flags: [],
        },
      );
      if (saveEmptyError) throw saveEmptyError;

      return NextResponse.json({
        ok: true,
        flagCount: 0,
        scannedNodeCount: 0,
      });
    }

    const scanResults = await moderateNodes(apiKey, scannableNodes);
    const flags = scanResults.flatMap(({ node, result }) =>
      flagsFromResult(node.nodeId, result),
    );

    const { data: savedFlagCount, error: saveError } = await supabase.rpc(
      "replace_auto_moderation_flags",
      {
        input_submission_id: submissionId,
        input_flags: flags,
      },
    );

    if (saveError) throw saveError;

    return NextResponse.json({
      ok: true,
      flagCount: Number(savedFlagCount ?? flags.length),
      scannedNodeCount: scannableNodes.length,
    });
  } catch (error: any) {
    console.error("Automatische DiBooks moderatiescan mislukt.", error);

    return NextResponse.json(
      {
        message:
          error?.message ??
          "Automatische moderatiescan kon niet worden afgerond.",
      },
      { status: 500 },
    );
  }
}
