import fs from 'fs';

async function testHF() {
    const env = fs.readFileSync('.dev.vars', 'utf8');
    const keyMatch = env.match(/HF_API_KEY=(.+)/);
    if (!keyMatch) return console.log('No key found');
    const key = keyMatch[1].trim();

    const endpoint = 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-Coder-32B-Instruct/v1/chat/completions';
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({
            model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
            messages: [{ role: 'user', content: 'Say hello!' }],
            temperature: 0.1,
            max_tokens: 1500
        })
    });

    if (!response.ok) {
        const txt = await response.text();
        console.error('FAILED!', response.status, txt);
    } else {
        const data = await response.json();
        console.log('SUCCESS!', data.choices[0].message.content);
    }
}
testHF();
