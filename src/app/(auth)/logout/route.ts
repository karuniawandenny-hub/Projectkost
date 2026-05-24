import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { publicUrl } from "@/lib/url";

export async function POST(req: Request) {
  await destroySession();
  return NextResponse.redirect(publicUrl(req, "/"), { status: 303 });
}

export async function GET(req: Request) {
  await destroySession();
  return NextResponse.redirect(publicUrl(req, "/"));
}
