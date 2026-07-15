const axios = require('axios');
require('dotenv').config({ path: '.env.local' });
axios.get(`https://graph.facebook.com/v20.0/${process.env.META_BUSINESS_ACCOUNT_ID}/message_templates?name=curso_verano`, { headers: { Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}` } })
.then(res => console.log(JSON.stringify(res.data.data[0].components, null, 2)))
.catch(err => console.error(err.response?.data || err.message));
