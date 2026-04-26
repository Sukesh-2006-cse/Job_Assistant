let pipeline = null;

const initializePipeline = async () => {
    if (pipeline) return pipeline;

    // We use a dynamic import because @xenova/transformers is large and we want lazy loading
    const { pipeline: transformerPipeline } = await import('@xenova/transformers');

    pipeline = await transformerPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true
    });

    return pipeline;
};

const generateEmbedding = async (text) => {
    try {
        if (!text) return null;

        const p = await initializePipeline();

        // Clean text: trim, collapse spaces, truncate to 512 chars
        const cleanText = text
            .trim()
            .replace(/\s+/g, ' ')
            .substring(0, 512);

        const output = await p(cleanText, {
            pooling: 'mean',
            normalize: true
        });

        // Convert Float32Array to plain JavaScript Array of numbers
        return Array.from(output.data);
    } catch (err) {
        console.error('[Embedder] Generation Error:', err);
        return null;
    }
};

module.exports = {
    generateEmbedding
};
