import { Telegraf } from 'telegraf';
const bot = new Telegraf('8748516176:AAE8OSdVy5tp12IPmUhm1_zg1PqlyCj5mjI');
console.log('Testing bot connection...');
bot.telegram.getMe().then(me => {
    console.log('Bot connection successful:', me.username);
    process.exit(0);
}).catch(err => {
    console.error('Bot connection failed:', err.message);
    process.exit(1);
});
