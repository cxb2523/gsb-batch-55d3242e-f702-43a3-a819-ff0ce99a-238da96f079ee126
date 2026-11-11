import { NextRequest, NextResponse } from "next/server";
import { getWebhookConfig, videoRepository } from "@/lib/webhook/runtime";
import { handleClaimNext } from "@/lib/webhook/service";

export async function GET(req: NextRequest) {
    const result = await handleClaimNext(
        req,
        videoRepository,
        getWebhookConfig(),
    );
    return NextResponse.json(result.body, { status: result.status });
}
