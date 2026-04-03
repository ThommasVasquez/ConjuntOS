import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = 'edge';

export async function GET() {
  try {
    const ctx = getRequestContext();
    const env = (ctx?.env || {}) as Record<string, unknown>;
    
    const dbUrl = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL || "NOT_FOUND";
    const edgeUrl = env.DATABASE_URL || env.NEXT_PUBLIC_DATABASE_URL || "NOT_FOUND";
    
    return NextResponse.json({
      success: true,
      runtime: "edge",
      env_process: {
        has_db_url: !!process.env.DATABASE_URL,
        db_url_masked: dbUrl !== "NOT_FOUND" ? `${dbUrl.substring(0, 15)}...` : "NONE"
      },
      env_cloudflare: {
        has_db_url: !!env.DATABASE_URL,
        db_url_masked: edgeUrl !== "NOT_FOUND" ? `${String(edgeUrl).substring(0, 15)}...` : "NONE"
      }
    });
  } catch (error: unknown) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
