const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => { 
    const [k, ...v] = line.split('='); 
    if(k && v) acc[k.trim()] = v.join('=').trim().replace(/"/g, ''); 
    return acc; 
}, {}); 

fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/mensajes?select=*&order=creado_en.desc&limit=10', { 
    headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY } 
})
.then(r => r.json())
.then(console.log);
