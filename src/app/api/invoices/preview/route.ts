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
        let contentType = 'application/pdf';
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

            const ext = path.extname(decodedPath).toLowerCase();
            if (ext === '.html') contentType = 'text/html';
            else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
            else if (ext === '.png') contentType = 'image/png';
            else if (ext === '.gif') contentType = 'image/gif';
        } else {
            // Remote fetch for Supabase or Pennylane URL
            const response = await fetch(url);
            if (!response.ok) {
                return new NextResponse(`Failed to fetch file: ${response.status} ${response.statusText}`, { status: response.status });
            }
            
            // Get content-type dynamically from response headers
            const remoteContentType = response.headers.get('content-type');
            if (remoteContentType) {
                contentType = remoteContentType;
            } else {
                // Fallback by extension in URL
                const cleanUrl = url.split('?')[0];
                const ext = path.extname(cleanUrl).toLowerCase();
                if (ext === '.html') contentType = 'text/html';
                else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
                else if (ext === '.png') contentType = 'image/png';
            }
            
            arrayBuffer = await response.arrayBuffer();
        }

        const isHtml = contentType.startsWith('text/html');
        const isImage = contentType.startsWith('image/');
        const contentDisposition = isHtml || isImage ? 'inline' : 'inline; filename="facture.pdf"';

        return new NextResponse(arrayBuffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': contentDisposition,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600'
            },
        });
    } catch (error) {
        console.error('File Proxy Error:', error);
        return new NextResponse('Internal Server Error fetching file', { status: 500 });
    }
}
