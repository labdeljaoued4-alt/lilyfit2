// LylyFit - Netlify Function: Payment Complete
// Pi Network API: POST /v2/payments/{paymentId}/complete
// Called by onReadyForServerCompletion callback

const PI_API_URL = 'https://api.minepi.com/v2';

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { paymentId, txid } = body;

        if (!paymentId || !txid) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'paymentId and txid are required' })
            };
        }

        const PI_API_KEY = process.env.PI_API_KEY;
        if (!PI_API_KEY) {
            console.error('PI_API_KEY environment variable is not set');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }

        console.log(`Completing payment: ${paymentId} with txid: ${txid}`);

        const response = await fetch(`${PI_API_URL}/payments/${paymentId}/complete`, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${PI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ txid })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Pi API completion error:', data);
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ error: 'Payment completion failed', details: data })
            };
        }

        console.log('Payment completed successfully:', data.identifier);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                paymentId: data.identifier,
                txid: txid,
                status: data.status,
                message: 'Payment completed successfully'
            })
        };

    } catch (error) {
        console.error('Complete function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Internal server error' })
        };
    }
};
