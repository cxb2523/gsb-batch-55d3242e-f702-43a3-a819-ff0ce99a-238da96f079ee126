import { NextRequest, NextResponse } from "next/server";
import { getWebhookConfig, videoRepository } from "@/lib/webhook/runtime";
import { handleReportStatus } from "@/lib/webhook/service";

export async function POST(req: NextRequest) {
    const result = await handleReportStatus(
        req,
        videoRepository,
        getWebhookConfig(),
    );
    return NextResponse.json(result.body, { status: result.status });
}
