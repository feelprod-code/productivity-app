import { Pinecone } from '@pinecone-database/pinecone';

const globalForPinecone = globalThis as unknown as {
    pinecone: Pinecone | undefined;
};

export const pinecone =
    globalForPinecone.pinecone ??
    new Pinecone({
        apiKey: process.env.PINECONE_API_KEY?.replace(/\\n/g, '').trim() || 'dummy_key_for_build',
    });

if (process.env.NODE_ENV !== 'production') globalForPinecone.pinecone = pinecone;

// We define our index names here as constants to avoid typos later
export const PINECONE_MISSION_INDEX = 'cerveau-mission';
export const PINECONE_GRAVITY_INDEX = 'gravity-claw';
