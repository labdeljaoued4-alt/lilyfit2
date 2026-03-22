// LylyFit - Netlify Function: Payment Cancel
// Pi Network API: POST /v2/payments/{paymentId}/cancel
// Called when user cancels payment or on error

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

        console.log(`Cancelling payment: ${paymentId}`);

        const response = await fetch(`${PI_API_URL}/payments/${paymentId}/cancel`, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${PI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Pi API may return 200 or 204 on cancel
        let data = {};
        const text = await response.text();
        if (text) {
            try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
        }

        if (!response.ok && response.status !== 204) {
            console.error('Pi API cancel error:', data);
            // Don't fail the user experience on cancel errors
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: false,
                    paymentId,
                    message: 'Payment cancel attempted',
                    details: data
                })
            };
        }

        console.log('Payment cancelled:', paymentId);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                paymentId,
                message: 'Payment cancelled'
            })
        };

    } catch (error) {
        console.error('Cancel function error:', error);
        return {
            statusCode: 200,  // Always 200 for cancel - don't break UX
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};
