import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const url = searchParams.get('url');

        if (!url) {
            return new NextResponse('URL parameter is required', { status: 400 });
        }

        let arrayBuffer: ArrayBuffer;
        const isHtml = url.toLowerCase().includes('.html');
        const isLocal = url.startsWith('/') || url.startsWith('invoices/') || !url.startsWith('http');

        if (isLocal) {
            // Local file read from public directory
            const cleanPath = url.startsWith('/') ? url.substring(1) : url;
            const decodedPath = decodeURIComponent(cleanPath);
            const absolutePath = path.join(process.cwd(), 'public', decodedPath);

            if (!fs.existsSync(absolutePath)) {
                console.error(`Local file not found at path: ${absolutePath}`);
                return new NextResponse(`File not found: ${decodedPath}`, { status: 404 });
            }

            const fileBuffer = fs.readFileSync(absolutePath);
            arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
        } else {
            // Remote fetch for Supabase URL
            const response = await fetch(url);
            if (!response.ok) {
                return new NextResponse(`Failed to fetch PDF: ${response.status} ${response.statusText}`, { status: response.status });
            }
            arrayBuffer = await response.arrayBuffer();
        }

        const contentType = isHtml ? 'text/html' : 'application/pdf';
        const contentDisposition = isHtml ? 'inline' : 'inline; filename="facture.pdf"';

        return new NextResponse(arrayBuffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': contentDisposition,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600'
            },
        });
    } catch (error) {
        console.error('PDF Proxy Error:', error);
        return new NextResponse('Internal Server Error fetching PDF', { status: 500 });
    }
}
