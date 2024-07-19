const { Client, Intents } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');

let config = require('./config.json');
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES] });

function log(message) {
  console.log(`[${new Date().toLocaleString()}] ${message}`);
}

function lerror(message) {
  console.error(`[${new Date().toLocaleString()}] ERROR: ${message}`);
}

client.once('ready', async () => {
  log(`Logged in as ${client.user.tag}!`);
  client.user.setPresence({
    status: "online"
  });

  const commands = [
    {
      name: 'set-streamlink',
      description: 'Set stream link to play! 🎧',
      options: [
        {
          name: 'link',
          type: 3,
          description: 'The stream link 🎵',
          required: true,
        },
      ],
    },
    {
      name: 'set-channel',
      description: 'Set channel for playing radio 🔊',
      options: [
        {
          name: 'channel',
          type: 7,
          description: 'Voice channel to join and play radio 📻',
          required: true,
        },
      ],
    },
    {
      name: 'reload',
      description: 'Reload bot configuration and playback 🔄',
    },
    {
      name: 'info',
      description: 'Display bot information 📖',
    },
  ];

  const rest = new REST({ version: '9' }).setToken(config.token);

  try {
    log('Started refreshing application global slash commands');

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );

    log('Successfully reloaded application global slash commands');
  } catch (error) {
    lerror(`Failed to reload application global slash commands: ${error.message}`);
  }

  checkVoiceChannel();
  setInterval(checkVoiceChannel, 60000);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === 'info') {
    const nodeVersion = process.version;
    const uptime = formatUptime(process.uptime());

    const infoMessage = `:white_heart: Owner: <@${config.ownerId}>\n` +
                        `:file_folder: Node version: ${nodeVersion}\n` +
                        `:clock3: Uptime: ${uptime}`;

    await interaction.reply({ content: infoMessage, ephemeral: true });
    log(`Info command executed by ${interaction.user.tag}`);
    return;
  }

  if (interaction.user.id !== config.ownerId) {
    await interaction.reply({ content: ":x: You do not have permission to use this command.", ephemeral: true });
    lerror(`Permission error: ${interaction.user.tag} attempted to execute ${commandName}`);
    return;
  }

  switch (commandName) {
    case 'set-streamlink':
      config.streamLink = options.getString('link');
      fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
      await interaction.reply({ content: `:white_check_mark: Stream link set to ${config.streamLink}`, ephemeral: true });
      log(`Stream link set to ${config.streamLink} by ${interaction.user.tag}`);
      break;
    case 'set-channel':
      config.channelId = options.getChannel('channel').id;
      fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
      await interaction.reply({ content: `:white_check_mark: Channel set to <#${config.channelId}>`, ephemeral: true });
      log(`Channel set to ${config.channelId} by ${interaction.user.tag}`);
      break;
    case 'reload':
      fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
      await interaction.reply({ content: `:white_check_mark: Configuration reloaded\n:musical_note: Play link: ${config.streamLink}`, ephemeral: true });

      stopPlayback();
      checkVoiceChannel();
      log(`Configuration reloaded by ${interaction.user.tag}`);
      break;
    default:
      break;
  }
});

let currentConnection = null;

async function checkVoiceChannel() {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) {
    lerror('Guild not found');
    return;
  }

  const channel = guild.channels.cache.get(config.channelId);
  if (!channel || !channel.isVoice()) {
    lerror('Voice channel not found or invalid');
    return;
  }

  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });

    if (currentConnection) {
      currentConnection.removeAllListeners();
    }

    connection.on('error', (error) => {
      lerror(`Voice connection error: ${error.message}`);
    });

    connection.on('disconnect', () => {
      log('Disconnected from voice channel');
    });

    await new Promise((resolve) => {
      connection.on('ready', () => {
        log('Successfully joined voice channel');
        resolve();
      });
    });

    playAudio(connection);
    currentConnection = connection;
  } catch (error) {
    lerror(`Error joining voice channel: ${error.message}`);
  }
}

function playAudio(connection) {
  if (!connection) {
    lerror('No connection available to play audio');
    return;
  }

  const player = createAudioPlayer();

  player.on('error', error => {
    lerror(`Audio player error: ${error.message}`);
  });

  player.on('stateChange', (oldState, newState) => {
    log(`Audio player transitioned from ${oldState.status} to ${newState.status}`);

    const resource = createAudioResource(config.streamLink, {
      bufferingTimeout: config.bufferingTimeout
    });

    switch (newState.status) {
      case 'autopaused':
      case 'idle':
        log(`Player is ${newState.status}, attempting to play audio again...`);
        player.play(resource);
        break;
      case 'playing':
        log('Player is playing');
        client.user.setPresence({
          activities: [{
            name: 'Radio 📻',
            type: 'STREAMING',
            url: 'https://twitch.tv/sevcadio'
          }],
          status: 'idle'
        });
        break;
      default:
        break;
    }
  });

  const resource = createAudioResource(config.streamLink, {
    bufferingTimeout: config.bufferingTimeout
  });

  player.play(resource);
  connection.subscribe(player);
}

function stopPlayback() {
  if (currentConnection) {
    currentConnection.destroy();
    currentConnection.removeAllListeners();
    currentConnection = null;
  }
}

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

client.login(config.token);
