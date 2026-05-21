const fs = require('fs');
let content = fs.readFileSync('script.js', 'utf8');

const helper = `
async function authenticatedFetch(url, options = {}) {
    if (!supabaseClient) return fetch(url, options); // fallback
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    
    const headers = new Headers(options.headers || {});
    if (token) {
        headers.set('Authorization', 'Bearer ' + token);
    }
    
    return fetch(url, { ...options, headers });
}
`;

content = content.replace('// --- Dashboard Functionality ---', '// --- Dashboard Functionality ---\n' + helper);

content = content.replace(/fetch\('\/api\/agents'/g, "authenticatedFetch('/api/agents'");
content = content.replace(/fetch\('\/api\/users'/g, "authenticatedFetch('/api/users'");
content = content.replace(/fetch\('\/api\/leads'/g, "authenticatedFetch('/api/leads'");
content = content.replace(/fetch\('\/api\/tools\/expand-prompt'/g, "authenticatedFetch('/api/tools/expand-prompt'");
content = content.replace(/fetch\(\`\/api\/agents\/\$\{id\}\`/g, "authenticatedFetch(`/api/agents/${id}`");
content = content.replace(/fetch\(\`\/api\/agents\/\$\{id\}\/toggle\`/g, "authenticatedFetch(`/api/agents/${id}/toggle`");
content = content.replace(/fetch\(\`\/api\/leads\/\$\{chatId\}\/message\`/g, "authenticatedFetch(`/api/leads/${chatId}/message`");

fs.writeFileSync('script.js', content);
