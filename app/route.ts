import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    data: {
      service: "CeloHT backend",
      apiBasePath: "/api/v1",
      healthPath: "/api/v1/health",
    },
  });
}