// LylyFit - Netlify Function: Payment Approve
// Pi Network API: POST /v2/payments/{paymentId}/approve
// Called by onReadyForServerApproval callback

const PI_API_URL = 'https://api.minepi.com/v2';

exports.handler = async function(event, context) {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight OPTIONS
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
        const { paymentId } = body;

        if (!paymentId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'paymentId is required' })
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

        console.log(`Approving payment: ${paymentId}`);

        const response = await fetch(`${PI_API_URL}/payments/${paymentId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${PI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Pi API approval error:', data);
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ error: 'Payment approval failed', details: data })
            };
        }

        console.log('Payment approved successfully:', data.identifier);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                paymentId: data.identifier,
                status: data.status,
                message: 'Payment approved'
            })
        };

    } catch (error) {
        console.error('Approve function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Internal server error' })
        };
    }
};
