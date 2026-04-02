import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const url = searchParams.get('url');

        if (!url) {
            return new NextResponse('URL parameter is required', { status: 400 });
        }

        const response = await fetch(url);

        if (!response.ok) {
            return new NextResponse(`Failed to fetch PDF: ${response.status} ${response.statusText}`, { status: response.status });
        }

        const arrayBuffer = await response.arrayBuffer();

        // Determine content type based on URL
        const isHtml = url.toLowerCase().includes('.html');
        const contentType = isHtml ? 'text/html' : 'application/pdf';
        const contentDisposition = isHtml ? 'inline' : 'inline; filename="facture.pdf"';

        // Force inline display instead of download, while proxying the content
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
