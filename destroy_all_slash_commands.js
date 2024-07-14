const { Client, Intents, ApplicationCommandManager } = require('discord.js');
let config = require('./config.json');

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Fetch all global commands
    const commands = await client.application?.commands.fetch();

    // Delete all fetched commands
    if (commands?.size > 0) {
        await client.application?.commands.set([]);
        console.log('All global commands removed.');
    } else {
        console.log('No global commands found.');
    }

    await client.destroy();
});

client.login(config.token);
