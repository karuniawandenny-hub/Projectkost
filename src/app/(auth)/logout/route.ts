import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST(req: Request) {
  await destroySession();
  const url = new URL("/", req.url);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(req: Request) {
  await destroySession();
  const url = new URL("/", req.url);
  return NextResponse.redirect(url);
}
