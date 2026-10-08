import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[Facturation Webhook Received]", body);

    // Structure prête pour automatisation Zapier / Make
    // body peut contenir un nouveau devis signé, un paiement Stripe / SumUp ou une séance Doctolib
    return NextResponse.json({
      received: true,
      timestamp: new Date().toISOString(),
      action: body.action || "sync_record",
      status: "processed",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Invalid payload", details: error.message },
      { status: 400 }
    );
  }
}
