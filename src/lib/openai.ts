import OpenAI from 'openai';

const globalForOpenAI = globalThis as unknown as {
    openai: OpenAI | undefined;
};

export const openai =
    globalForOpenAI.openai ??
    new OpenAI({
        apiKey: process.env.OPENAI_API_KEY?.replace(/\\n/g, '').trim() || 'dummy_key_for_build',
    });

if (process.env.NODE_ENV !== 'production') globalForOpenAI.openai = openai;
