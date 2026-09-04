import fs from 'fs';

async function testGroqPlanner() {
    const env = fs.readFileSync('.dev.vars', 'utf8');
    const keyMatch = env.match(/GROQ_API_KEY=(.+)/);
    if (!keyMatch) return console.log('No key found');
    const key = keyMatch[1].trim();

    const body = {
        models: ['llama3-70b-8192'],
        messages: [{ role: 'user', content: 'Say hello' }],
        temperature: 0.1,
        max_completion_tokens: 1500,
        response_format: { type: 'json_object' }
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({
            ...body,
            model: 'llama3-70b-8192',
            models: undefined
        })
    });

    if (!response.ok) {
        const txt = await response.text();
        console.error('FAILED!', response.status, txt);
    } else {
        console.log('SUCCESS!');
    }
}
testGroqPlanner();
